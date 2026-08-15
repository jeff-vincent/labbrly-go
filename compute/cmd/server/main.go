package main

import (
	"context"
	"encoding/json"
	"log/slog"
	"net/http"
	"os"
	"os/signal"
	"syscall"
	"time"

	"github.com/go-chi/chi/v5"
	"github.com/go-chi/chi/v5/middleware"
	"github.com/prometheus/client_golang/prometheus/promhttp"

	"github.com/labbrly/compute/internal/auth"
	"github.com/labbrly/compute/internal/fs"
	k8sclient "github.com/labbrly/compute/internal/k8s"
	"github.com/labbrly/compute/internal/pod"
	"github.com/labbrly/compute/internal/proxy"
	redisclient "github.com/labbrly/compute/internal/redis"
	"github.com/labbrly/compute/internal/terminal"
)

func main() {
	// ---- Dependencies ----
	authMW, err := auth.NewMiddleware()
	if err != nil {
		slog.Error("auth middleware init failed", "err", err)
		os.Exit(1)
	}

	k8s, err := k8sclient.New()
	if err != nil {
		slog.Error("k8s client init failed", "err", err)
		os.Exit(1)
	}

	redis := redisclient.New()
	podManager := pod.NewManager(k8s, redis)
	proxyHandler := proxy.NewHandler(podManager, authMW)
	fsHandler := fs.NewHandler(k8s)
	termHandler := terminal.NewHandler(k8s)

	// ---- Router ----
	r := chi.NewRouter()
	r.Use(middleware.RealIP)
	r.Use(middleware.RequestID)
	r.Use(middleware.Recoverer)

	// Subdomain proxy middleware runs first (before auth) so it can perform
	// the bootstrap cookie redirect before the auth middleware rejects the request.
	r.Use(proxyHandler.SubdomainMiddleware)

	// Auth middleware wraps all remaining routes.
	r.Use(authMW.Handler)

	// ---- Routes ----
	r.Get("/healthz", handleHealthz)
	r.Handle("/metrics", promhttp.Handler())

	// Pod lifecycle
	r.Post("/compute/start", handleStart(podManager))
	r.Get("/compute/delete", handleDelete(podManager))
	r.Get("/compute/check-lab", fsHandler.CheckLab)

	// Namespace provisioning (internal; protected by NAMESPACE_CREATION_KEY)
	r.Post("/compute/create-namespace", handleCreateNamespace(k8s))

	// Proxy
	r.Get("/compute/proxy/host/{port}", proxyHandler.ProxyHostInfo)
	r.HandleFunc("/compute/proxy/http/{port}/{path:.*}", proxyHandler.ProxyDirect)

	// Filesystem
	r.Get("/compute/fs/list", fsHandler.ListFiles)
	r.Get("/compute/fs/read", fsHandler.ReadFile)
	r.Post("/compute/fs/create", fsHandler.CreateFile)
	r.Post("/compute/fs/delete", fsHandler.DeletePath)
	r.Post("/compute/fs/mkdir", fsHandler.MakeDirectory)
	r.Post("/compute/fs/rename", fsHandler.RenamePath)

	// Script execution
	r.Post("/compute/run", fsHandler.RunScript)

	// WebSocket terminal
	r.Get("/compute/terminal/{user_id}", termHandler.Terminal)

	// ---- Server ----
	addr := os.Getenv("PORT")
	if addr == "" {
		addr = "8000"
	}
	srv := &http.Server{
		Addr:    ":" + addr,
		Handler: r,
		// ReadHeaderTimeout protects against slow-header attacks on regular
		// REST endpoints. ReadTimeout must stay 0: it sets an ABSOLUTE
		// deadline on the raw connection at request start, and gorilla's
		// websocket.Upgrade() hijacks that connection without clearing it —
		// a nonzero ReadTimeout here silently kills every terminal WebSocket
		// exactly that many seconds after connecting, active or not.
		ReadHeaderTimeout: 10 * time.Second,
		ReadTimeout:       0,
		WriteTimeout:      0, // streaming and WebSocket; no write deadline
		IdleTimeout:       120 * time.Second,
	}

	go func() {
		slog.Info("compute service starting", "addr", srv.Addr)
		if err := srv.ListenAndServe(); err != nil && err != http.ErrServerClosed {
			slog.Error("server error", "err", err)
			os.Exit(1)
		}
	}()

	quit := make(chan os.Signal, 1)
	signal.Notify(quit, syscall.SIGINT, syscall.SIGTERM)
	<-quit

	slog.Info("shutting down...")
	ctx, cancel := context.WithTimeout(context.Background(), 30*time.Second)
	defer cancel()
	_ = srv.Shutdown(ctx)
	_ = redis.Close()
	slog.Info("shutdown complete")
}

func handleHealthz(w http.ResponseWriter, r *http.Request) {
	w.Header().Set("Content-Type", "application/json")
	_ = json.NewEncoder(w).Encode(map[string]string{"status": "ok"})
}

func handleStart(mgr *pod.Manager) http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		info, ok := auth.FromContext(r.Context())
		if !ok {
			writeJSON(w, http.StatusUnauthorized, map[string]string{"error": "unauthorized"})
			return
		}

		var body struct {
			ContainerImage    string `json:"container_image"`
			ResourceTier      string `json:"resource_tier"`
			SessionTTLMinutes int    `json:"session_ttl_minutes"`
		}
		body.ResourceTier = "small"
		body.SessionTTLMinutes = 30
		if err := json.NewDecoder(r.Body).Decode(&body); err != nil {
			writeJSON(w, http.StatusBadRequest, map[string]string{"error": "invalid json"})
			return
		}

		namespace := pod.OrgNamespace(info.OrgID)
		ttl := time.Duration(body.SessionTTLMinutes) * time.Minute

		result, err := mgr.EnsureRunning(r.Context(), namespace, info.UserID, body.ContainerImage, body.ResourceTier, ttl)
		if err != nil {
			writeJSON(w, http.StatusInternalServerError, map[string]string{"error": err.Error()})
			return
		}
		writeJSON(w, http.StatusOK, map[string]any{
			"status": result.Status,
			"reused": result.Reused,
		})
	}
}

func handleDelete(mgr *pod.Manager) http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		info, ok := auth.FromContext(r.Context())
		if !ok {
			writeJSON(w, http.StatusUnauthorized, map[string]string{"error": "unauthorized"})
			return
		}
		namespace := pod.OrgNamespace(info.OrgID)
		if err := mgr.Delete(r.Context(), namespace, info.UserID); err != nil {
			writeJSON(w, http.StatusInternalServerError, map[string]string{"error": err.Error()})
			return
		}
		writeJSON(w, http.StatusOK, map[string]string{"status": "deleted"})
	}
}

func handleCreateNamespace(k8s *k8sclient.Client) http.HandlerFunc {
	creationKey := os.Getenv("NAMESPACE_CREATION_KEY")
	if creationKey == "" {
		creationKey = "default-namespace-creation-key"
	}
	return func(w http.ResponseWriter, r *http.Request) {
		var body struct {
			NamespaceCreationKey string `json:"namespace_creation_key"`
			OrgID                string `json:"org_id"`
		}
		if err := json.NewDecoder(r.Body).Decode(&body); err != nil {
			writeJSON(w, http.StatusBadRequest, map[string]string{"error": "invalid json"})
			return
		}
		if body.NamespaceCreationKey != creationKey {
			writeJSON(w, http.StatusForbidden, map[string]string{"error": "invalid namespace creation key"})
			return
		}
		namespace := pod.OrgNamespace(body.OrgID)
		if namespace == "" {
			writeJSON(w, http.StatusBadRequest, map[string]string{"error": "org_id is required"})
			return
		}
		if err := k8s.CreateNamespace(r.Context(), namespace); err != nil {
			writeJSON(w, http.StatusInternalServerError, map[string]string{"error": err.Error()})
			return
		}
		writeJSON(w, http.StatusOK, map[string]string{"status": "success", "namespace": namespace})
	}
}

func writeJSON(w http.ResponseWriter, status int, v any) {
	w.Header().Set("Content-Type", "application/json")
	w.WriteHeader(status)
	_ = json.NewEncoder(w).Encode(v)
}
