package main

import (
	"context"
	"fmt"
	"log/slog"
	"net/http"
	"os"
	"os/signal"
	"syscall"

	"github.com/labbrly/garbagecollection/internal/gc"
	"github.com/labbrly/shared/logutil"
	"github.com/labbrly/shared/redisutil"
	"k8s.io/client-go/kubernetes"
	"k8s.io/client-go/rest"
	"k8s.io/client-go/tools/clientcmd"
)

func main() {
	logutil.Setup()

	k8sClient, err := newK8sClient()
	if err != nil {
		slog.Error("k8s client init failed", "err", err)
		os.Exit(1)
	}

	rdb := redisutil.Connect()
	defer rdb.Close()

	ctx, cancel := signal.NotifyContext(context.Background(), syscall.SIGINT, syscall.SIGTERM)
	defer cancel()

	// Minimal healthz server for liveness probes.
	mux := http.NewServeMux()
	mux.HandleFunc("/healthz", func(w http.ResponseWriter, r *http.Request) {
		fmt.Fprint(w, `{"status":"ok"}`)
	})
	go func() {
		port := os.Getenv("PORT")
		if port == "" {
			port = "8000"
		}
		slog.Info("healthz server starting", "port", port)
		if err := http.ListenAndServe(":"+port, mux); err != nil {
			slog.Error("healthz server error", "err", err)
		}
	}()

	gc.Run(ctx, k8sClient, rdb)
	slog.Info("garbage collection worker stopped")
}

func newK8sClient() (*kubernetes.Clientset, error) {
	cfg, err := rest.InClusterConfig()
	if err != nil {
		slog.Warn("not in cluster, falling back to kubeconfig", "err", err)
		cfg, err = clientcmd.BuildConfigFromFlags("", clientcmd.RecommendedHomeFile)
		if err != nil {
			return nil, fmt.Errorf("k8s config: %w", err)
		}
	}
	return kubernetes.NewForConfig(cfg)
}
