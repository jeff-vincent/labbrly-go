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
	"github.com/labbrly/auth/internal/tokens"
	"github.com/labbrly/shared/httputil"
	"github.com/labbrly/shared/logutil"
	"github.com/labbrly/shared/metrics"
	"github.com/labbrly/shared/mongoutil"
)

func main() {
	logutil.Setup()

	ctx, cancel := context.WithTimeout(context.Background(), 10*time.Second)
	defer cancel()

	mongoClient, err := mongoutil.Connect(ctx)
	if err != nil {
		slog.Error("mongo connect failed", "err", err)
		os.Exit(1)
	}

	orgs := mongoClient.Database("orgs").Collection("orgs")
	labs := mongoClient.Database("labs").Collection("labs")

	store, err := tokens.New(orgs, labs)
	if err != nil {
		slog.Error("token store init failed", "err", err)
		os.Exit(1)
	}

	r := chi.NewRouter()
	r.Use(chimw.RealIP)
	r.Use(chimw.Recoverer)

	// No auth middleware — this service issues tokens
	r.Get("/healthz", httputil.Healthz)
	r.Handle("/metrics", metrics.Handler())

	r.Get("/auth/demo-token", tokens.DemoTokenHandler(store))
	r.Post("/auth/embed/token", tokens.EmbedTokenHandler(store))
	r.Post("/auth/token", tokens.APIKeyTokenHandler(store))
	r.Post("/auth/check-username", tokens.CheckUsernameHandler())

	addr := os.Getenv("PORT")
	if addr == "" {
		addr = "8000"
	}
	srv := &http.Server{
		Addr:         ":" + addr,
		Handler:      r,
		ReadTimeout:  30 * time.Second,
		WriteTimeout: 30 * time.Second,
		IdleTimeout:  120 * time.Second,
	}

	go func() {
		slog.Info("auth service starting", "addr", srv.Addr)
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
	_ = mongoClient.Disconnect(shutdownCtx)
	slog.Info("shutdown complete")
}
