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
	"github.com/labbrly/shared/auth"
	"github.com/labbrly/shared/httputil"
	"github.com/labbrly/shared/logutil"
	"github.com/labbrly/shared/metrics"
	"github.com/labbrly/shared/mongoutil"
	"github.com/labbrly/video/internal/video"
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

	videoDB := mongoClient.Database("video")
	store, err := video.New(videoDB)
	if err != nil {
		slog.Error("video store init failed", "err", err)
		os.Exit(1)
	}

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

	video.Routes(r, store)

	addr := os.Getenv("PORT")
	if addr == "" {
		addr = "8000"
	}
	srv := &http.Server{
		Addr:         ":" + addr,
		Handler:      r,
		ReadTimeout:  120 * time.Second, // large video uploads
		WriteTimeout: 120 * time.Second, // large video streams
		IdleTimeout:  120 * time.Second,
	}

	go func() {
		slog.Info("video service starting", "addr", srv.Addr)
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
