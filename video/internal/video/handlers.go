package video

import (
	"fmt"
	"io"
	"net/http"

	"github.com/go-chi/chi/v5"
	"github.com/labbrly/shared/auth"
	"github.com/labbrly/shared/httputil"
)

// Routes registers all /video endpoints on r.
func Routes(r chi.Router, s *Store) {
	r.Post("/video/upload", upload(s))
	r.Get("/video/stream/{filename}", stream(s))
	r.Delete("/video/delete/{filename}", delete(s))
}

// upload handles POST /video/upload.
// Accepts multipart form with: video (file), lab_id (field).
// Compresses and stores in GridFS as a background task.
func upload(s *Store) http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		if err := r.ParseMultipartForm(512 << 20); err != nil {
			httputil.WriteJSON(w, http.StatusBadRequest, map[string]string{"detail": "failed to parse form"})
			return
		}
		defer r.MultipartForm.RemoveAll()

		labID := r.FormValue("lab_id")
		if labID == "" {
			httputil.WriteJSON(w, http.StatusBadRequest, map[string]string{"status": "error", "message": "No video file provided"})
			return
		}

		file, _, err := r.FormFile("video")
		if err != nil {
			httputil.WriteJSON(w, http.StatusBadRequest, map[string]string{"status": "error", "message": "No video file provided"})
			return
		}
		defer file.Close()

		raw, err := io.ReadAll(file)
		if err != nil {
			httputil.WriteJSON(w, http.StatusInternalServerError, map[string]string{"status": "error", "message": "failed to read video"})
			return
		}

		// Upload and compress in the background.
		go s.Upload(labID, raw)

		httputil.WriteJSON(w, http.StatusOK, map[string]string{"status": "success", "message": "Video uploaded successfully"})
	}
}

// stream handles GET /video/stream/{filename}.
func stream(s *Store) http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		filename := chi.URLParam(r, "filename")

		// Use a pipe so we can set Content-Length after reading from GridFS.
		// Since GridFS buffers in memory anyway, just stream directly.
		w.Header().Set("Content-Type", "video/mp4")

		n, err := s.Stream(r.Context(), w, filename)
		if err != nil {
			// Headers may already be sent; best-effort.
			http.Error(w, "not found", http.StatusNotFound)
			return
		}
		_ = n
	}
}

// delete handles DELETE /video/delete/{filename}.
func delete(s *Store) http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		info, _ := auth.FromContext(r.Context())
		if info.OrgID == "" {
			httputil.WriteJSON(w, http.StatusUnauthorized, map[string]string{"status": "error", "message": "Organization ID is required"})
			return
		}
		filename := chi.URLParam(r, "filename")
		if filename == "" {
			httputil.WriteJSON(w, http.StatusBadRequest, map[string]string{"status": "error", "message": "Filename is required"})
			return
		}

		if err := s.Delete(r.Context(), filename); err != nil {
			httputil.WriteJSON(w, http.StatusInternalServerError, map[string]string{"status": "error", "message": fmt.Sprintf("delete failed: %s", err.Error())})
			return
		}
		httputil.WriteJSON(w, http.StatusOK, map[string]string{"status": "success", "message": "Video deleted successfully"})
	}
}
