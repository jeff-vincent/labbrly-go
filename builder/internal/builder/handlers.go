package builder

import (
	"crypto/rand"
	"encoding/hex"
	"fmt"
	"net/http"
	"strings"

	"github.com/go-chi/chi/v5"
	"github.com/labbrly/shared/auth"
	"github.com/labbrly/shared/httputil"
	"k8s.io/client-go/kubernetes"
)

// Routes registers all /builder endpoints on r.
func Routes(r chi.Router, k8s *kubernetes.Clientset, cfg Config) {
	r.Post("/builder/build", buildImage(k8s, cfg))
	r.Get("/builder/status/{job_name}", jobStatus(k8s, cfg))
}

// buildImage handles POST /builder/build.
// Accepts multipart form with: dockerfile (file), files (files), image_name (field).
// Saves the build context to the PVC and creates a Kaniko K8s Job.
func buildImage(k8s *kubernetes.Clientset, cfg Config) http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		info, _ := auth.FromContext(r.Context())
		if info.OrgID == "" {
			httputil.WriteJSON(w, http.StatusForbidden, map[string]string{"detail": "organization ID not found"})
			return
		}

		// Parse multipart form with generous limits for large build contexts.
		if err := r.ParseMultipartForm(512 << 20); err != nil {
			httputil.WriteJSON(w, http.StatusBadRequest, map[string]string{"detail": "failed to parse multipart form: " + err.Error()})
			return
		}
		defer r.MultipartForm.RemoveAll()

		imageName := strings.TrimSpace(r.FormValue("image_name"))
		if imageName == "" {
			httputil.WriteJSON(w, http.StatusBadRequest, map[string]string{"detail": "image name cannot be empty"})
			return
		}
		imageTag := strings.ToLower(imageName) + "-" + strings.ToLower(strings.Replace(info.OrgID, "org_", "", 1))

		// Read Dockerfile.
		dockerfileFiles := r.MultipartForm.File["dockerfile"]
		if len(dockerfileFiles) == 0 {
			httputil.WriteJSON(w, http.StatusBadRequest, map[string]string{"detail": "missing Dockerfile upload"})
			return
		}
		dockerfileFile, err := dockerfileFiles[0].Open()
		if err != nil {
			httputil.WriteJSON(w, http.StatusInternalServerError, map[string]string{"detail": "failed to open Dockerfile"})
			return
		}
		defer dockerfileFile.Close()
		dockerfileBuf := make([]byte, 0, dockerfileFiles[0].Size)
		buf := make([]byte, 4096)
		for {
			n, err := dockerfileFile.Read(buf)
			if n > 0 {
				dockerfileBuf = append(dockerfileBuf, buf[:n]...)
			}
			if err != nil {
				break
			}
		}
		dockerfileContent := string(dockerfileBuf)

		// Collect uploaded files.
		uploadedFiles := r.MultipartForm.File["files"]

		// Generate a unique job ID.
		jobIDBytes := make([]byte, 16)
		rand.Read(jobIDBytes)
		jobID := hex.EncodeToString(jobIDBytes)

		// Save build context to PVC.
		ctxDir, err := SaveBuildContext(jobID, dockerfileContent, uploadedFiles)
		if err != nil {
			httputil.WriteJSON(w, http.StatusInternalServerError, map[string]string{"detail": "failed to save build context: " + err.Error()})
			return
		}

		destination := fmt.Sprintf("%s/labthingy-org-lab:%s", cfg.Registry, imageTag)

		// Create Kaniko job.
		jobName, err := CreateKanikoJob(k8s, cfg, jobID, destination)
		if err != nil {
			httputil.WriteJSON(w, http.StatusInternalServerError, map[string]string{"detail": "kubernetes error: " + err.Error()})
			return
		}

		httputil.WriteJSON(w, http.StatusOK, map[string]string{
			"job_id":       jobID,
			"job_name":     jobName,
			"image":        destination,
			"context_path": ctxDir,
		})
	}
}

// jobStatus handles GET /builder/status/{job_name}.
func jobStatus(k8s *kubernetes.Clientset, cfg Config) http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		jobName := chi.URLParam(r, "job_name")
		status, err := GetJobStatus(k8s, cfg, jobName)
		if err != nil {
			httputil.WriteJSON(w, http.StatusNotFound, map[string]string{"detail": "job not found: " + err.Error()})
			return
		}
		httputil.WriteJSON(w, http.StatusOK, status)
	}
}
