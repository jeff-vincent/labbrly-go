package analytics

import (
	"encoding/json"
	"net/http"
	"time"

	"github.com/go-chi/chi/v5"
	"github.com/labbrly/shared/auth"
	"github.com/labbrly/shared/httputil"
	"go.mongodb.org/mongo-driver/bson"
)

// Routes registers all /analytics endpoints on r.
func Routes(r chi.Router, s *Store) {
	r.Post("/analytics/log", ingestLog(s))
	r.Post("/analytics/event", logEvent(s))
	r.Get("/analytics/events", getEvents(s))
}

// ingestLog handles POST /analytics/log.
// Accepts legacy { userId, labId, ts, sample } or new { user_id, events } payloads,
// normalizes to a stored entry, and pushes to a per-user Redis list.
func ingestLog(s *Store) http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		info, _ := auth.FromContext(r.Context())

		var data map[string]any
		if err := json.NewDecoder(r.Body).Decode(&data); err != nil {
			httputil.WriteJSON(w, http.StatusBadRequest, map[string]string{"detail": "invalid json"})
			return
		}

		// Resolve user_id: prefer JWT claims, fall back to body fields.
		userID := info.UserID
		if userID == "" {
			userID = stringOr(data, "user_id", stringOr(data, "userId", ""))
		}
		if userID == "" {
			httputil.WriteJSON(w, http.StatusBadRequest, map[string]string{"detail": "userId missing in token and payload"})
			return
		}

		// Normalize sample: support legacy { sample: {...} } or new { events: [...] }.
		sample, hasSample := data["sample"].(map[string]any)
		if !hasSample {
			if events, ok := data["events"].([]any); ok {
				sample = map[string]any{"events": events}
				if dwell, ok := data["dwell_ms"].(float64); ok {
					sample["dwell_ms"] = int(dwell)
				}
			}
		}
		if sample == nil {
			httputil.WriteJSON(w, http.StatusBadRequest, map[string]string{"detail": "invalid sample"})
			return
		}
		if _, ok := sample["events"]; !ok {
			httputil.WriteJSON(w, http.StatusBadRequest, map[string]string{"detail": "invalid sample"})
			return
		}

		// Derive timestamp.
		ts := resolveTS(data, sample)

		orgID := info.OrgID
		if orgID == "" {
			orgID = stringOr(data, "org_id", stringOr(data, "orgId", ""))
		}
		labID := info.LabID
		if labID == "" {
			labID = stringOr(data, "lab_id", stringOr(data, "labId", ""))
		}

		entry := map[string]any{
			"org_id": orgID,
			"user_id": userID,
			"lab_id": labID,
			"ts":     ts,
			"sample": sample,
		}

		if err := s.PushEntry(r.Context(), userID, entry); err != nil {
			httputil.WriteJSON(w, http.StatusInternalServerError, map[string]string{"detail": "storage_error"})
			return
		}
		httputil.WriteJSON(w, http.StatusCreated, map[string]string{"status": "queued"})
	}
}

// logEvent handles POST /analytics/event — writes a single named event to MongoDB.
func logEvent(s *Store) http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		info, _ := auth.FromContext(r.Context())
		if info.UserID == "" || info.OrgID == "" {
			httputil.WriteJSON(w, http.StatusUnauthorized, map[string]string{"detail": "Unauthorized"})
			return
		}

		var data map[string]any
		if err := json.NewDecoder(r.Body).Decode(&data); err != nil {
			httputil.WriteJSON(w, http.StatusBadRequest, map[string]string{"detail": "invalid json"})
			return
		}

		event := stringOr(data, "event", "")
		if event == "" {
			httputil.WriteJSON(w, http.StatusBadRequest, map[string]string{"detail": "event is required"})
			return
		}
		labID := stringOr(data, "lab_id", "")
		if labID == "" {
			httputil.WriteJSON(w, http.StatusBadRequest, map[string]string{"detail": "labId is required"})
			return
		}

		doc := bson.M{
			"org_id":    info.OrgID,
			"lab_id":    labID,
			"user_id":   info.UserID,
			"event":     event,
			"timestamp": time.Now().UTC().Format(time.RFC3339),
		}
		if err := s.InsertEvent(r.Context(), doc); err != nil {
			httputil.WriteJSON(w, http.StatusInternalServerError, map[string]string{"detail": "storage_error"})
			return
		}
		httputil.WriteJSON(w, http.StatusCreated, map[string]string{"status": "event logged"})
	}
}

// getEvents handles GET /analytics/events — returns all events for the authenticated org.
func getEvents(s *Store) http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		info, _ := auth.FromContext(r.Context())
		if info.OrgID == "" {
			httputil.WriteJSON(w, http.StatusUnauthorized, map[string]string{"detail": "Unauthorized"})
			return
		}
		events, err := s.ListEventsByOrg(r.Context(), info.OrgID)
		if err != nil {
			httputil.WriteJSON(w, http.StatusInternalServerError, map[string]string{"detail": "storage_error"})
			return
		}
		if events == nil {
			events = []map[string]any{}
		}
		httputil.WriteJSON(w, http.StatusOK, events)
	}
}

// resolveTS derives a timestamp (epoch ms) from the payload or falls back to now.
func resolveTS(data, sample map[string]any) int64 {
	if ts, ok := data["ts"].(float64); ok {
		return int64(ts)
	}
	// Try last event's ts.
	if events, ok := sample["events"].([]any); ok && len(events) > 0 {
		if last, ok := events[len(events)-1].(map[string]any); ok {
			if ts, ok := last["ts"].(float64); ok {
				return int64(ts)
			}
		}
	}
	return time.Now().UnixMilli()
}

func stringOr(m map[string]any, key, def string) string {
	if v, ok := m[key].(string); ok {
		return v
	}
	return def
}
