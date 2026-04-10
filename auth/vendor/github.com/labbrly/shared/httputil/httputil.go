// Package httputil provides common HTTP helpers used across labbrly services.
package httputil

import (
	"encoding/json"
	"net/http"
)

// WriteJSON encodes v as JSON and writes it with the given status code.
func WriteJSON(w http.ResponseWriter, status int, v any) {
	w.Header().Set("Content-Type", "application/json")
	w.WriteHeader(status)
	_ = json.NewEncoder(w).Encode(v)
}

// Healthz is a standard liveness handler that returns {"status":"ok"}.
func Healthz(w http.ResponseWriter, _ *http.Request) {
	WriteJSON(w, http.StatusOK, map[string]string{"status": "ok"})
}
