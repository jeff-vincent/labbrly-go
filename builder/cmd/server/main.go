package main

import (
	"context"
	"log/slog"
	"net/http"
	"os"
	"os/signal"
	"syscall"
	"time"

	"github.com/go-chi/chi/v5"
	chimw "github.com/go-chi/chi/v5/middleware"
	"github.com/labbrly/builder/internal/builder"
	"github.com/labbrly/shared/auth"
	"github.com/labbrly/shared/httputil"
	"github.com/labbrly/shared/logutil"
	"github.com/labbrly/shared/metrics"
)

func main() {
	logutil.Setup()

	k8sClient, err := builder.NewK8sClient()
	if err != nil {
		slog.Error("k8s client init failed", "err", err)
		os.Exit(1)
	}

	cfg := builder.DefaultConfig()

	authMW, err := auth.New()
	if err != nil {
		slog.Error("auth middleware init failed", "err", err)
		os.Exit(1)
	}

	r := chi.NewRouter()
	r.Use(chimw.RealIP)
	r.Use(chimw.Recoverer)
	r.Use(authMW.Handler)

	r.Get("/healthz", httputil.Healthz)
	r.Handle("/metrics", metrics.Handler())

	builder.Routes(r, k8sClient, cfg)

	addr := os.Getenv("PORT")
	if addr == "" {
		addr = "8000"
	}
	srv := &http.Server{
		Addr:         ":" + addr,
		Handler:      r,
		ReadTimeout:  120 * time.Second, // generous for large uploads
		WriteTimeout: 30 * time.Second,
		IdleTimeout:  120 * time.Second,
	}

	go func() {
		slog.Info("builder service starting", "addr", srv.Addr)
		if err := srv.ListenAndServe(); err != nil && err != http.ErrServerClosed {
			slog.Error("server error", "err", err)
			os.Exit(1)
		}
	}()

	quit := make(chan os.Signal, 1)
	signal.Notify(quit, syscall.SIGINT, syscall.SIGTERM)
	<-quit

	slog.Info("shutting down...")
	shutdownCtx, shutdownCancel := context.WithTimeout(context.Background(), 30*time.Second)
	defer shutdownCancel()
	_ = srv.Shutdown(shutdownCtx)
	slog.Info("shutdown complete")
}
