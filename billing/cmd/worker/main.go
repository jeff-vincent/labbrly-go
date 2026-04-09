package main

import (
	"context"
	"log/slog"
	"os"
	"os/signal"
	"syscall"
	"time"

	"github.com/labbrly/billing/internal/billing"
	mongoClient "github.com/labbrly/billing/internal/mongo"
	redisClient "github.com/labbrly/billing/internal/redis"
	"github.com/labbrly/shared/logutil"
	stripe "github.com/stripe/stripe-go/v82"
)

func main() {
	// ---- Logging ----
	logutil.Setup()

	// ---- Stripe ----
	stripe.Key = os.Getenv("STRIPE_API_KEY")
	if stripe.Key == "" {
		slog.Error("STRIPE_API_KEY is not set")
		os.Exit(1)
	}

	// ---- Redis ----
	redis := redisClient.New()

	// ---- MongoDB ----
	initCtx, initCancel := context.WithTimeout(context.Background(), 10*time.Second)
	defer initCancel()
	mongo, err := mongoClient.New(initCtx)
	if err != nil {
		slog.Error("mongo init failed", "err", err)
		os.Exit(1)
	}

	// ---- Service ----
	svc := billing.New(redis, mongo)

	slog.Info("billing worker starting",
		"sample_interval", billing.SampleInterval,
		"block_duration", billing.BlockDuration,
		"free_concurrency", billing.FreeConcurrency,
	)

	// ---- Run until signal ----
	ctx, stop := signal.NotifyContext(context.Background(), syscall.SIGTERM, syscall.SIGINT)
	defer stop()

	svc.Run(ctx)

	// ---- Graceful shutdown ----
	slog.Info("billing worker shutting down")
	shutdownCtx, cancel := context.WithTimeout(context.Background(), 30*time.Second)
	defer cancel()
	if err := mongo.Disconnect(shutdownCtx); err != nil {
		slog.Warn("mongo disconnect error", "err", err)
	}
	if err := redis.Close(); err != nil {
		slog.Warn("redis close error", "err", err)
	}
	slog.Info("shutdown complete")
}
