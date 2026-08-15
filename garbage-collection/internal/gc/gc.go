// Package gc implements the stale-pod garbage collection loop.
package gc

import (
	"bytes"
	"context"
	"encoding/json"
	"log/slog"
	"net/http"
	"strings"
	"time"

	goredis "github.com/redis/go-redis/v9"
	corev1 "k8s.io/api/core/v1"
	metav1 "k8s.io/apimachinery/pkg/apis/meta/v1"
	"k8s.io/client-go/kubernetes"
)

// systemNamespaces are excluded from GC scanning, as defense-in-depth on top
// of the orgNamespaceLabelSelector below.
var systemNamespaces = map[string]bool{
	"default":            true,
	"cert-manager":       true,
	"ingress-nginx":      true,
	"kindling-system":    true,
	"traefik":            true,
	"local-path-storage": true,
}

// orgNamespaceLabelSelector matches only namespaces created by the compute
// service for org environments (see compute/internal/k8s/client.go
// CreateNamespace). GC must NOT enumerate every namespace in the cluster and
// delete any pod lacking a Redis TTL key — that would (and did) delete
// unrelated infra pods in namespaces like kindling-system/traefik that have
// no Redis-tracked pods at all.
const orgNamespaceLabelSelector = "app.kubernetes.io/managed-by=labbrly-compute"

// analyticsWorkerURL is the endpoint for triggering analytics processing on pod cleanup.
const analyticsWorkerURL = "http://analytics-worker:8000/analytics-worker/process"

var analyticsHTTPClient = &http.Client{Timeout: 5 * time.Second}

// Run starts the GC loop, blocking until ctx is cancelled.
func Run(ctx context.Context, k8s *kubernetes.Clientset, rdb *goredis.Client) {
	slog.Info("garbage collection loop starting")
	for {
		select {
		case <-ctx.Done():
			slog.Info("garbage collection loop stopped")
			return
		default:
		}

		if err := runCycle(ctx, k8s, rdb); err != nil {
			slog.Error("GC cycle failed", "err", err)
		}

		select {
		case <-ctx.Done():
			return
		case <-time.After(60 * time.Second):
		}
	}
}

func runCycle(ctx context.Context, k8s *kubernetes.Clientset, rdb *goredis.Client) error {
	slog.Info("starting GC cycle")

	nsList, err := k8s.CoreV1().Namespaces().List(ctx, metav1.ListOptions{
		LabelSelector: orgNamespaceLabelSelector,
	})
	if err != nil {
		return err
	}

	for _, ns := range nsList.Items {
		if isSystemNamespace(ns.Name) {
			continue
		}
		if err := gcNamespace(ctx, k8s, rdb, ns.Name); err != nil {
			slog.Error("GC namespace failed", "namespace", ns.Name, "err", err)
		}
	}
	slog.Info("GC cycle completed")
	return nil
}

func gcNamespace(ctx context.Context, k8s *kubernetes.Clientset, rdb *goredis.Client, ns string) error {
	pods, err := k8s.CoreV1().Pods(ns).List(ctx, metav1.ListOptions{})
	if err != nil {
		return err
	}
	slog.Debug("scanning namespace", "namespace", ns, "pods", len(pods.Items))

	for _, pod := range pods.Items {
		podName := pod.Name
		key := "pod:" + ns + ":" + podName

		exists, err := rdb.Exists(ctx, key).Result()
		if err != nil {
			slog.Error("redis exists check failed", "key", key, "err", err)
			continue
		}
		if exists > 0 {
			slog.Debug("pod has valid TTL entry", "pod", ns+"/"+podName)
			continue
		}

		slog.Info("deleting stale pod", "pod", ns+"/"+podName)
		deletePod(ctx, k8s, pod, ns)
		notifyAnalyticsWorker(podName)
	}
	return nil
}

func deletePod(ctx context.Context, k8s *kubernetes.Clientset, pod corev1.Pod, ns string) {
	if err := k8s.CoreV1().Pods(ns).Delete(ctx, pod.Name, metav1.DeleteOptions{}); err != nil {
		slog.Error("failed to delete pod", "pod", ns+"/"+pod.Name, "err", err)
		return
	}
	slog.Info("pod deleted", "pod", ns+"/"+pod.Name)
}

func notifyAnalyticsWorker(userID string) {
	body, _ := json.Marshal(map[string]string{"user_id": userID})
	resp, err := analyticsHTTPClient.Post(analyticsWorkerURL, "application/json", bytes.NewReader(body))
	if err != nil {
		slog.Warn("analytics worker notification failed", "user_id", userID, "err", err)
		return
	}
	defer resp.Body.Close()
	slog.Info("analytics worker notified", "user_id", userID, "status", resp.StatusCode)
}

func isSystemNamespace(name string) bool {
	if strings.HasPrefix(name, "kube-") {
		return true
	}
	return systemNamespaces[name]
}
