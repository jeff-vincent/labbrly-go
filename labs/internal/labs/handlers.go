package labs

import (
	"bytes"
	"encoding/json"
	"log/slog"
	"net/http"
	"time"

	"github.com/go-chi/chi/v5"
	"github.com/labbrly/shared/auth"
	"github.com/labbrly/shared/httputil"
	"go.mongodb.org/mongo-driver/bson"
)

var ragClient = &http.Client{Timeout: 10 * time.Second}

// Routes registers all /labs endpoints on r.
func Routes(r chi.Router, s *Store) {
	r.Get("/labs", listLabs(s))
	r.Get("/labs/lab", getLab(s))
	r.Post("/labs/lab", createLab(s))
	r.Put("/labs/lab/{lab_id}", updateLab(s))
	r.Delete("/labs/lab/{lab_id}", deleteLab(s))
}

func listLabs(s *Store) http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		info, _ := auth.FromContext(r.Context())
		labs, err := s.ListByOrg(r.Context(), info.OrgID)
		if err != nil {
			httputil.WriteJSON(w, http.StatusInternalServerError, map[string]string{"detail": err.Error()})
			return
		}
		if labs == nil {
			labs = []map[string]any{}
		}
		httputil.WriteJSON(w, http.StatusOK, labs)
	}
}

func getLab(s *Store) http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		info, _ := auth.FromContext(r.Context())
		if info.LabID == "" {
			httputil.WriteJSON(w, http.StatusBadRequest, map[string]string{"detail": "lab_id is required"})
			return
		}
		lab, err := s.Get(r.Context(), info.LabID, info.OrgID)
		if err != nil {
			httputil.WriteJSON(w, http.StatusBadRequest, map[string]string{"detail": err.Error()})
			return
		}
		if lab == nil {
			httputil.WriteJSON(w, http.StatusNotFound, map[string]string{"detail": "lab not found"})
			return
		}
		httputil.WriteJSON(w, http.StatusOK, lab)
	}
}

var requiredFields = []string{
	"name", "container_image", "container_image_display_name",
	"elements", "scored_lab", "custom_lab", "resource_tier", "session_ttl_minutes",
}

func createLab(s *Store) http.HandlerFunc {
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
		for _, f := range requiredFields {
			if _, ok := payload[f]; !ok {
				httputil.WriteJSON(w, http.StatusBadRequest, map[string]string{"detail": "missing required field: " + f})
				return
			}
		}

		data := bson.M{
			"org_id":                        info.OrgID,
			"name":                          payload["name"],
			"container_image":               payload["container_image"],
			"container_image_display_name":  payload["container_image_display_name"],
			"elements":                      payload["elements"],
			"scored_lab":                    payload["scored_lab"],
			"custom_lab":                    payload["custom_lab"],
			"resource_tier":                 payload["resource_tier"],
			"session_ttl_minutes":           payload["session_ttl_minutes"],
			"script_name":                   strOr(payload, "script_name", ""),
			"execution_command":             strOr(payload, "execution_command", ""),
			"lab_text":                      strOr(payload, "lab_text", ""),
			"example_code":                  strOr(payload, "example_code", ""),
			"terminal_commands":             strOr(payload, "terminal_commands", ""),
			"rag_urls":                      sliceOr(payload, "rag_urls"),
			"analytics_targets":             sliceOr(payload, "analytics_targets"),
		}

		created, err := s.Create(r.Context(), data)
		if err != nil {
			httputil.WriteJSON(w, http.StatusInternalServerError, map[string]string{"detail": err.Error()})
			return
		}

		if urls, _ := created["rag_urls"].([]any); len(urls) > 0 {
			go scrapeAndEmbed(urls, info.OrgID, created["_id"].(string))
		}

		httputil.WriteJSON(w, http.StatusCreated, created)
	}
}

var allowedUpdateFields = map[string]bool{
	"org_id": true, "name": true, "elements": true, "lab_text": true,
	"example_code": true, "terminal_commands": true, "container_image": true,
	"script_name": true, "execution_command": true, "rag_urls": true,
}

func updateLab(s *Store) http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		info, _ := auth.FromContext(r.Context())
		if info.OrgID == "" {
			httputil.WriteJSON(w, http.StatusUnauthorized, map[string]string{"detail": "org_id required"})
			return
		}
		labID := chi.URLParam(r, "lab_id")
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
		if len(update) == 0 {
			httputil.WriteJSON(w, http.StatusBadRequest, map[string]string{"detail": "no valid fields to update"})
			return
		}
		updated, err := s.Update(r.Context(), labID, update)
		if err != nil {
			httputil.WriteJSON(w, http.StatusBadRequest, map[string]string{"detail": err.Error()})
			return
		}
		if updated == nil {
			httputil.WriteJSON(w, http.StatusNotFound, map[string]string{"detail": "lab not found"})
			return
		}
		httputil.WriteJSON(w, http.StatusOK, updated)
	}
}

func deleteLab(s *Store) http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		info, _ := auth.FromContext(r.Context())
		if info.OrgID == "" {
			httputil.WriteJSON(w, http.StatusUnauthorized, map[string]string{"detail": "org_id required"})
			return
		}
		labID := chi.URLParam(r, "lab_id")
		// Fire-and-forget video deletion
		go deleteVideo(labID, info.Token)

		deleted, err := s.Delete(r.Context(), labID, info.OrgID)
		if err != nil {
			httputil.WriteJSON(w, http.StatusBadRequest, map[string]string{"detail": err.Error()})
			return
		}
		if !deleted {
			httputil.WriteJSON(w, http.StatusNotFound, map[string]string{"detail": "lab not found"})
			return
		}
		w.WriteHeader(http.StatusNoContent)
	}
}

func scrapeAndEmbed(urls []any, orgID, labID string) {
	strURLs := make([]string, 0, len(urls))
	for _, u := range urls {
		if s, ok := u.(string); ok {
			strURLs = append(strURLs, s)
		}
	}
	body, _ := json.Marshal(map[string]any{"urls": strURLs, "org_id": orgID, "lab_id": labID})
	resp, err := ragClient.Post("http://rag-ingest:8000/rag/ingest", "application/json", bytes.NewReader(body))
	if err != nil {
		slog.Error("rag ingest request failed", "err", err)
		return
	}
	defer resp.Body.Close()
	if resp.StatusCode != http.StatusOK {
		slog.Error("rag ingest returned error", "status", resp.StatusCode)
	}
}

func deleteVideo(labID, token string) {
	req, err := http.NewRequest(http.MethodDelete, "http://video-api:8000/video/delete/"+labID, nil)
	if err != nil {
		return
	}
	req.Header.Set("Authorization", "Bearer "+token)
	resp, err := ragClient.Do(req)
	if err != nil {
		slog.Warn("video delete request failed", "lab_id", labID, "err", err)
		return
	}
	defer resp.Body.Close()
}

func strOr(m map[string]any, key, def string) string {
	if v, ok := m[key].(string); ok {
		return v
	}
	return def
}

func sliceOr(m map[string]any, key string) []any {
	if v, ok := m[key].([]any); ok {
		return v
	}
	return []any{}
}
