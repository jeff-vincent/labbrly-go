package orgs

import (
	"encoding/json"
	"log/slog"
	"net/http"
	"os"
	"strings"

	"github.com/go-chi/chi/v5"
	"github.com/labbrly/shared/auth"
	"github.com/labbrly/shared/crypto"
	"github.com/labbrly/shared/httputil"
	stripe "github.com/stripe/stripe-go/v82"
	"github.com/stripe/stripe-go/v82/customer"
	"github.com/stripe/stripe-go/v82/subscription"
	"go.mongodb.org/mongo-driver/bson"
)

// Routes registers all /orgs endpoints on r.
func Routes(r chi.Router, s *Store, a *Auth0Client, enc *crypto.Encryptor) {
	r.Get("/orgs/org", getOrg(s))
	r.Post("/orgs/org", createOrg(s, a))
	r.Put("/orgs/org", updateOrg(s, enc))
	r.Delete("/orgs/org", deleteOrg(s))
	r.Put("/orgs/org/end-user-data", updateEndUserData(s))
	r.Post("/orgs/subscribe", subscribe(s))
	r.Post("/orgs/check-availability", checkAvailability(s))
	r.Post("/orgs/image", addImage(s))
	r.Post("/orgs/image-available", imageAvailable(s))
}

var requiredOrgFields = []string{
	"username", "email", "password", "organization_name", "organization_display_name",
}

var allowedUpdateFields = map[string]bool{
	"organization_name": true, "email": true, "account_type": true, "api_keys": true,
	"stripe_id": true, "stripe_subscription_id": true, "stripe_customer_id": true,
	"stripe_plan": true, "stripe_status": true, "images": true, "llm_configs": true,
	"integrations": true,
}

// auth0ConnectionID is the fixed connection to attach to new Auth0 orgs.
const auth0ConnectionID = "con_nw6skrVh8S4OBgaY"

func getOrg(s *Store) http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		info, _ := auth.FromContext(r.Context())
		if info.OrgID == "" {
			httputil.WriteJSON(w, http.StatusBadRequest, map[string]string{"detail": "org_id is required"})
			return
		}
		org, err := s.GetByOrgID(r.Context(), info.OrgID)
		if err != nil {
			httputil.WriteJSON(w, http.StatusInternalServerError, map[string]string{"detail": err.Error()})
			return
		}
		if org == nil {
			httputil.WriteJSON(w, http.StatusNotFound, map[string]string{"detail": "org not found"})
			return
		}
		httputil.WriteJSON(w, http.StatusOK, org)
	}
}

func createOrg(s *Store, a *Auth0Client) http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		var payload map[string]any
		if err := json.NewDecoder(r.Body).Decode(&payload); err != nil {
			httputil.WriteJSON(w, http.StatusBadRequest, map[string]string{"detail": "invalid json"})
			return
		}
		for _, f := range requiredOrgFields {
			if _, ok := payload[f]; !ok {
				httputil.WriteJSON(w, http.StatusBadRequest, map[string]string{"detail": "missing required field: " + f})
				return
			}
		}
		email, _ := payload["email"].(string)
		if !strings.Contains(email, "@") {
			httputil.WriteJSON(w, http.StatusBadRequest, map[string]string{"detail": "invalid email format"})
			return
		}

		orgName, _ := payload["organization_name"].(string)
		displayName, _ := payload["organization_display_name"].(string)

		auth0Org, err := a.CreateOrganization(r.Context(), orgName, displayName)
		if err != nil {
			slog.Error("auth0 create organization failed", "err", err)
			httputil.WriteJSON(w, http.StatusInternalServerError, map[string]string{"detail": "error creating organization in Auth0"})
			return
		}
		orgID, _ := auth0Org["id"].(string)

		if err := a.AddConnection(r.Context(), orgID, auth0ConnectionID); err != nil {
			slog.Error("auth0 add connection failed", "org_id", orgID, "err", err)
		}

		password, _ := payload["password"].(string)
		if err := a.CreateAndAddUser(r.Context(), orgID, email, password, "Username-Password-Authentication"); err != nil {
			slog.Error("auth0 create user failed", "org_id", orgID, "err", err)
			httputil.WriteJSON(w, http.StatusInternalServerError, map[string]string{"detail": "error creating user in Auth0"})
			return
		}

		namespace := strings.ToLower(strings.Replace(orgID, "org_", "", 1))
		record := bson.M{
			"org_id":                    orgID,
			"username":                  strOr(payload, "username"),
			"email":                     email,
			"password":                  password,
			"organization_name":         orgName,
			"organization_display_name": displayName,
			"account_type":              "free",
			"namespace":                 namespace,
		}

		created, err := s.CreateOrgRecord(r.Context(), record)
		if err != nil {
			httputil.WriteJSON(w, http.StatusInternalServerError, map[string]string{"detail": err.Error()})
			return
		}

		go func() {
			if err := s.CreateNamespace(r.Context(), orgID); err != nil {
				slog.Error("create namespace failed", "org_id", orgID, "err", err)
			}
		}()

		httputil.WriteJSON(w, http.StatusCreated, created)
	}
}

func updateOrg(s *Store, enc *crypto.Encryptor) http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		info, _ := auth.FromContext(r.Context())
		if info.OrgID == "" {
			httputil.WriteJSON(w, http.StatusUnauthorized, map[string]string{"detail": "org_id required"})
			return
		}
		var payload map[string]any
		if err := json.NewDecoder(r.Body).Decode(&payload); err != nil {
			httputil.WriteJSON(w, http.StatusBadRequest, map[string]string{"detail": "invalid json"})
			return
		}

		update := bson.M{}
		for k, v := range payload {
			if allowedUpdateFields[k] && v != nil {
				update[k] = v
			}
		}

		// Encrypt LLM API key if present.
		if llmCfg, ok := update["llm_configs"].(map[string]any); ok {
			if apiKey, _ := llmCfg["api_key"].(string); apiKey != "" {
				encrypted, err := enc.Encrypt(apiKey)
				if err != nil {
					httputil.WriteJSON(w, http.StatusInternalServerError, map[string]string{"detail": "failed to encrypt api key"})
					return
				}
				llmCfg["api_key"] = encrypted
				update["llm_configs"] = llmCfg
			}
		}

		// Encrypt sensitive integration fields.
		if integrations, ok := update["integrations"].(map[string]any); ok {
			secured := make(map[string]any, len(integrations))
			for k, v := range integrations {
				if s, ok := v.(string); ok && s != "" && isSensitiveKey(k) {
					encrypted, err := enc.Encrypt(s)
					if err == nil {
						secured[k] = encrypted
					} else {
						secured[k] = v
					}
				} else {
					secured[k] = v
				}
			}
			update["integrations"] = secured
		}

		if len(update) == 0 {
			httputil.WriteJSON(w, http.StatusBadRequest, map[string]string{"detail": "no valid fields to update"})
			return
		}

		updated, err := s.UpdateOrg(r.Context(), info.OrgID, update)
		if err != nil {
			httputil.WriteJSON(w, http.StatusInternalServerError, map[string]string{"detail": err.Error()})
			return
		}
		if updated == nil {
			httputil.WriteJSON(w, http.StatusNotFound, map[string]string{"detail": "org not found"})
			return
		}
		httputil.WriteJSON(w, http.StatusOK, updated)
	}
}

func deleteOrg(s *Store) http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		info, _ := auth.FromContext(r.Context())
		if info.OrgID == "" {
			httputil.WriteJSON(w, http.StatusUnauthorized, map[string]string{"detail": "org_id required"})
			return
		}
		deleted, err := s.DeleteByOrgID(r.Context(), info.OrgID)
		if err != nil {
			httputil.WriteJSON(w, http.StatusInternalServerError, map[string]string{"detail": err.Error()})
			return
		}
		if !deleted {
			httputil.WriteJSON(w, http.StatusNotFound, map[string]string{"detail": "org not found"})
			return
		}
		w.WriteHeader(http.StatusNoContent)
	}
}

func updateEndUserData(s *Store) http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		info, _ := auth.FromContext(r.Context())
		if info.OrgID == "" {
			httputil.WriteJSON(w, http.StatusUnauthorized, map[string]string{"detail": "org_id required"})
			return
		}
		if info.UserID == "" {
			httputil.WriteJSON(w, http.StatusBadRequest, map[string]string{"detail": "missing user_id"})
			return
		}
		var payload map[string]any
		if err := json.NewDecoder(r.Body).Decode(&payload); err != nil {
			httputil.WriteJSON(w, http.StatusBadRequest, map[string]string{"detail": "invalid json"})
			return
		}
		delete(payload, "user_id")
		for k, v := range payload {
			if v == nil {
				delete(payload, k)
			}
		}
		if err := s.AddUserEvent(r.Context(), info.OrgID, info.UserID, payload); err != nil {
			httputil.WriteJSON(w, http.StatusInternalServerError, map[string]string{"detail": err.Error()})
			return
		}
		httputil.WriteJSON(w, http.StatusOK, map[string]string{"message": "User data updated successfully"})
	}
}

func subscribe(s *Store) http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		info, _ := auth.FromContext(r.Context())
		if info.OrgID == "" {
			httputil.WriteJSON(w, http.StatusUnauthorized, map[string]string{"detail": "org_id required"})
			return
		}
		var payload map[string]any
		if err := json.NewDecoder(r.Body).Decode(&payload); err != nil {
			httputil.WriteJSON(w, http.StatusBadRequest, map[string]string{"detail": "invalid json"})
			return
		}
		pmID, _ := payload["payment_method_id"].(string)
		if pmID == "" {
			httputil.WriteJSON(w, http.StatusBadRequest, map[string]string{"detail": "missing payment_method_id"})
			return
		}
		customerInfo, _ := payload["customer"].(map[string]any)

		stripe.Key = os.Getenv("STRIPE_API_KEY")

		// Create Stripe customer.
		custParams := &stripe.CustomerParams{
			PaymentMethod: stripe.String(pmID),
		}
		if customerInfo != nil {
			if email, _ := customerInfo["email"].(string); email != "" {
				custParams.Email = stripe.String(email)
			}
			if name, _ := customerInfo["name"].(string); name != "" {
				custParams.Name = stripe.String(name)
			}
		}
		cust, err := customer.New(custParams)
		if err != nil {
			httputil.WriteJSON(w, http.StatusInternalServerError, map[string]string{"detail": "failed to create customer: " + err.Error()})
			return
		}

		// Create platform subscription (seats price).
		_, err = subscription.New(&stripe.SubscriptionParams{
			Customer: stripe.String(cust.ID),
			Items: []*stripe.SubscriptionItemsParams{
				{Price: stripe.String("price_1S0wEUQHoQHn9QEvwt5eyJKT")},
			},
			DefaultPaymentMethod: stripe.String(pmID),
		})
		if err != nil {
			slog.Error("stripe seats subscription failed", "err", err)
		}

		// Create metered usage subscription.
		sub, err := subscription.New(&stripe.SubscriptionParams{
			Customer: stripe.String(cust.ID),
			Items: []*stripe.SubscriptionItemsParams{
				{Price: stripe.String("price_1S1IfhQHoQHn9QEvgqOMlRiD")},
			},
			DefaultPaymentMethod: stripe.String(pmID),
		})
		if err != nil {
			slog.Error("stripe metered subscription failed", "err", err)
		}

		// Update org with Stripe IDs.
		updateData := bson.M{
			"stripe_customer_id":    cust.ID,
			"account_type":          "business",
		}
		if sub != nil {
			updateData["stripe_subscription_id"] = sub.ID
		}
		if _, err := s.UpdateOrg(r.Context(), info.OrgID, updateData); err != nil {
			slog.Error("failed to update org with stripe info", "org_id", info.OrgID, "err", err)
		}

		httputil.WriteJSON(w, http.StatusOK, map[string]string{"message": "Subscribed successfully"})
	}
}

func checkAvailability(s *Store) http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		var data map[string]any
		if err := json.NewDecoder(r.Body).Decode(&data); err != nil {
			httputil.WriteJSON(w, http.StatusBadRequest, map[string]string{"detail": "invalid json"})
			return
		}
		orgName, _ := data["organization_name"].(string)
		if strings.TrimSpace(orgName) == "" {
			httputil.WriteJSON(w, http.StatusBadRequest, map[string]string{"detail": "organization name is required"})
			return
		}
		available, err := s.CheckNameAvailable(r.Context(), orgName)
		if err != nil {
			httputil.WriteJSON(w, http.StatusInternalServerError, map[string]string{"detail": err.Error()})
			return
		}
		httputil.WriteJSON(w, http.StatusOK, map[string]any{"available": available, "org_name": orgName})
	}
}

func addImage(s *Store) http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		info, _ := auth.FromContext(r.Context())
		if info.OrgID == "" {
			httputil.WriteJSON(w, http.StatusUnauthorized, map[string]string{"detail": "org_id required"})
			return
		}
		var data map[string]any
		if err := json.NewDecoder(r.Body).Decode(&data); err != nil {
			httputil.WriteJSON(w, http.StatusBadRequest, map[string]string{"detail": "invalid json"})
			return
		}
		imageName, _ := data["image_name"].(string)
		if imageName == "" {
			httputil.WriteJSON(w, http.StatusBadRequest, map[string]string{"detail": "missing image_name"})
			return
		}
		norm := NormalizeImageName(imageName, info.OrgID)
		available, err := s.ImageAvailable(r.Context(), info.OrgID, norm)
		if err != nil {
			httputil.WriteJSON(w, http.StatusInternalServerError, map[string]string{"detail": err.Error()})
			return
		}
		if !available {
			httputil.WriteJSON(w, http.StatusConflict, map[string]string{"detail": "image name is already taken"})
			return
		}
		if err := s.AddImage(r.Context(), info.OrgID, norm); err != nil {
			httputil.WriteJSON(w, http.StatusInternalServerError, map[string]string{"detail": err.Error()})
			return
		}
		httputil.WriteJSON(w, http.StatusOK, map[string]string{"image_name": norm, "status": "added"})
	}
}

func imageAvailable(s *Store) http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		info, _ := auth.FromContext(r.Context())
		if info.OrgID == "" {
			httputil.WriteJSON(w, http.StatusUnauthorized, map[string]string{"detail": "org_id required"})
			return
		}
		var data map[string]any
		if err := json.NewDecoder(r.Body).Decode(&data); err != nil {
			httputil.WriteJSON(w, http.StatusBadRequest, map[string]string{"detail": "invalid json"})
			return
		}
		imageName, _ := data["image_name"].(string)
		if imageName == "" {
			httputil.WriteJSON(w, http.StatusBadRequest, map[string]string{"detail": "missing image_name"})
			return
		}
		norm := NormalizeImageName(imageName, info.OrgID)
		available, err := s.ImageAvailable(r.Context(), info.OrgID, norm)
		if err != nil {
			httputil.WriteJSON(w, http.StatusInternalServerError, map[string]string{"detail": err.Error()})
			return
		}
		httputil.WriteJSON(w, http.StatusOK, map[string]any{"image_name": norm, "available": available})
	}
}

func strOr(m map[string]any, key string) string {
	if v, ok := m[key].(string); ok {
		return v
	}
	return ""
}
