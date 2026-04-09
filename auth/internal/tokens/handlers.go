package tokens

import (
	"encoding/json"
	"fmt"
	"io"
	"log/slog"
	"net/http"
	"os"
	"strings"
	"time"

	"github.com/labbrly/shared/httputil"
)

const auth0Domain = "dev-w5iil6bapqnf2nai.us.auth0.com"

// DemoTokenHandler returns a short-lived token for the demo org.
func DemoTokenHandler(s *Store) http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		token, err := s.DemoToken()
		if err != nil {
			httputil.WriteJSON(w, http.StatusInternalServerError, map[string]string{"detail": err.Error()})
			return
		}
		httputil.WriteJSON(w, http.StatusOK, map[string]string{
			"access_token": token,
			"token_type":   "bearer",
		})
	}
}

// EmbedTokenHandler issues a token for an embedded lab.
func EmbedTokenHandler(s *Store) http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		var body struct {
			LabID  string `json:"lab_id"`
			UserID string `json:"user_id"`
		}
		if err := json.NewDecoder(r.Body).Decode(&body); err != nil || body.LabID == "" {
			httputil.WriteJSON(w, http.StatusBadRequest, map[string]string{"detail": "lab_id is required"})
			return
		}
		origin := r.Header.Get("Origin")
		if origin == "" {
			httputil.WriteJSON(w, http.StatusBadRequest, map[string]string{"detail": "missing Origin header"})
			return
		}
		token, err := s.EmbedToken(r.Context(), body.LabID, origin, body.UserID)
		if err != nil {
			if strings.Contains(err.Error(), "not allowed") {
				httputil.WriteJSON(w, http.StatusForbidden, map[string]string{"detail": "origin not allowed"})
			} else if strings.Contains(err.Error(), "not found") {
				httputil.WriteJSON(w, http.StatusNotFound, map[string]string{"detail": err.Error()})
			} else {
				httputil.WriteJSON(w, http.StatusInternalServerError, map[string]string{"detail": err.Error()})
			}
			return
		}
		httputil.WriteJSON(w, http.StatusOK, map[string]string{
			"access_token": token,
			"token_type":   "bearer",
		})
	}
}

// APIKeyTokenHandler exchanges an org API key for a JWT.
func APIKeyTokenHandler(s *Store) http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		var body struct {
			APIKey string `json:"api_key"`
			LabID  string `json:"lab_id"`
			UserID string `json:"user_id"`
		}
		if err := json.NewDecoder(r.Body).Decode(&body); err != nil {
			httputil.WriteJSON(w, http.StatusBadRequest, map[string]string{"detail": "invalid json"})
			return
		}
		token, err := s.APIKeyToken(r.Context(), body.APIKey, body.LabID, body.UserID)
		if err != nil {
			if strings.Contains(err.Error(), "invalid API key") {
				httputil.WriteJSON(w, http.StatusUnauthorized, map[string]string{"detail": "invalid API key"})
			} else {
				httputil.WriteJSON(w, http.StatusInternalServerError, map[string]string{"detail": err.Error()})
			}
			return
		}
		httputil.WriteJSON(w, http.StatusOK, map[string]string{
			"access_token": token,
			"token_type":   "bearer",
		})
	}
}

// CheckUsernameHandler checks username availability via Auth0 Management API.
func CheckUsernameHandler() http.HandlerFunc {
	clientID := os.Getenv("AUTH0_CLIENT_ID")
	clientSecret := os.Getenv("AUTH0_CLIENT_SECRET")

	return func(w http.ResponseWriter, r *http.Request) {
		var body struct {
			Email string `json:"email"`
		}
		if err := json.NewDecoder(r.Body).Decode(&body); err != nil || strings.TrimSpace(body.Email) == "" {
			httputil.WriteJSON(w, http.StatusBadRequest, map[string]string{"detail": "email is required"})
			return
		}
		username := strings.TrimSpace(body.Email)

		token, err := getAuth0MgmtToken(clientID, clientSecret)
		if err != nil {
			slog.Error("auth0 management token error", "err", err)
			httputil.WriteJSON(w, http.StatusInternalServerError, map[string]string{"detail": "auth0 error"})
			return
		}

		req, _ := http.NewRequestWithContext(r.Context(), http.MethodGet,
			fmt.Sprintf("https://%s/api/v2/users", auth0Domain), nil)
		req.Header.Set("Authorization", "Bearer "+token)
		q := req.URL.Query()
		q.Set("q", fmt.Sprintf(`email:"%s" OR username:"%s"`, username, username))
		q.Set("search_engine", "v3")
		req.URL.RawQuery = q.Encode()

		resp, err := httpClient.Do(req)
		if err != nil {
			httputil.WriteJSON(w, http.StatusInternalServerError, map[string]string{"detail": "auth0 request failed"})
			return
		}
		defer resp.Body.Close()
		var users []any
		if err := json.NewDecoder(resp.Body).Decode(&users); err != nil {
			httputil.WriteJSON(w, http.StatusInternalServerError, map[string]string{"detail": "auth0 response error"})
			return
		}
		httputil.WriteJSON(w, http.StatusOK, map[string]any{
			"available": len(users) == 0,
			"username":  username,
		})
	}
}

var httpClient = &http.Client{Timeout: 10 * time.Second}

func getAuth0MgmtToken(clientID, clientSecret string) (string, error) {
	body := fmt.Sprintf(
		`{"client_id":%q,"client_secret":%q,"audience":"https://%s/api/v2/","grant_type":"client_credentials"}`,
		clientID, clientSecret, auth0Domain,
	)
	resp, err := httpClient.Post(
		"https://"+auth0Domain+"/oauth/token",
		"application/json",
		strings.NewReader(body),
	)
	if err != nil {
		return "", err
	}
	defer resp.Body.Close()
	raw, _ := io.ReadAll(resp.Body)
	var result map[string]any
	if err := json.Unmarshal(raw, &result); err != nil {
		return "", err
	}
	token, ok := result["access_token"].(string)
	if !ok || token == "" {
		return "", fmt.Errorf("no access_token in response: %s", raw)
	}
	return token, nil
}
