// Package pod manages the lifecycle of user environment pods.
package pod

import (
	"context"
	"fmt"
	"log/slog"
	"regexp"
	"strings"
	"sync"
	"time"

	corev1 "k8s.io/api/core/v1"
	metav1 "k8s.io/apimachinery/pkg/apis/meta/v1"
	"k8s.io/apimachinery/pkg/api/resource"

	k8sclient "github.com/labbrly/compute/internal/k8s"
	redisclient "github.com/labbrly/compute/internal/redis"
)

const defaultImage = "jdvincent/lab-thingy-demo-env:latest"

// ResourceTier describes CPU/memory requests and limits for a pod.
type ResourceTier struct {
	CPURequest    string
	CPULimit      string
	MemoryRequest string
	MemoryLimit   string
}

var tiers = map[string]ResourceTier{
	"small": {
		CPURequest: "100m", CPULimit: "400m",
		MemoryRequest: "320Mi", MemoryLimit: "640Mi",
	},
	"medium": {
		CPURequest: "200m", CPULimit: "800m",
		MemoryRequest: "640Mi", MemoryLimit: "1280Mi",
	},
	"large": {
		CPURequest: "400m", CPULimit: "1600m",
		MemoryRequest: "1280Mi", MemoryLimit: "2560Mi",
	},
}

// TierByName returns the named tier, falling back to "small".
func TierByName(name string) ResourceTier {
	if t, ok := tiers[name]; ok {
		return t
	}
	return tiers["small"]
}

// podIPCache caches pod IPs to avoid hammering the k8s API on every proxied request.
type podIPCache struct {
	mu    sync.Mutex
	items map[string]cacheEntry
}

type cacheEntry struct {
	ip        string
	expiresAt time.Time
}

var ipCache = &podIPCache{items: make(map[string]cacheEntry)}

// Manager handles pod start/stop/status operations.
type Manager struct {
	k8s   *k8sclient.Client
	redis *redisclient.Client
}

func NewManager(k8s *k8sclient.Client, redis *redisclient.Client) *Manager {
	return &Manager{k8s: k8s, redis: redis}
}

// OrgNamespace strips the "org_" prefix and lowercases the org ID to get the
// namespace name (mirrors the Python service's behaviour).
func OrgNamespace(orgID string) string {
	return strings.ToLower(strings.TrimPrefix(orgID, "org_"))
}

// StartResult is returned by EnsureRunning.
type StartResult struct {
	Status  string // "running" | "created" | "pending"
	Reused  bool
}

// EnsureRunning starts a pod for the user or reuses an existing matching pod.
// It mirrors the Python _ensure_pod_state_for_request + /compute/start logic.
func (m *Manager) EnsureRunning(
	ctx context.Context,
	namespace, userID, image, tierName string,
	sessionTTL time.Duration,
) (StartResult, error) {
	if image == "" || image == "null" {
		image = defaultImage
	}
	tier := TierByName(tierName)

	// Try to reuse an existing pod that matches image + resources.
	reused, err := m.reuseIfMatching(ctx, namespace, userID, image, tier, sessionTTL)
	if err != nil {
		slog.Warn("pod reuse check failed; will recreate", "user", userID, "err", err)
	}
	if reused {
		phase, _ := m.k8s.PodPhase(ctx, namespace, userID)
		status := phaseToStatus(phase)
		return StartResult{Status: status, Reused: true}, nil
	}

	// Create a fresh pod.
	manifest := buildPodManifest(userID, image, tier)
	if err := m.k8s.CreatePod(ctx, namespace, manifest); err != nil {
		// Pod might already exist (race); try to get its status.
		phase, perr := m.k8s.PodPhase(ctx, namespace, userID)
		if perr == nil && phase != "" {
			return StartResult{Status: phaseToStatus(phase)}, nil
		}
		return StartResult{}, fmt.Errorf("create pod: %w", err)
	}

	if err := m.redis.WritePodRecord(ctx, namespace, userID, userID, sessionTTL); err != nil {
		slog.Warn("failed writing pod record to redis", "err", err)
	}

	phase, _ := m.k8s.PodPhase(ctx, namespace, userID)
	return StartResult{Status: phaseToStatus(phase)}, nil
}

// Delete deletes the user's pod.
func (m *Manager) Delete(ctx context.Context, namespace, userID string) error {
	return m.k8s.DeletePod(ctx, namespace, userID)
}

// Phase returns a simple status string for the user's pod.
func (m *Manager) Phase(ctx context.Context, namespace, userID string) (string, error) {
	phase, err := m.k8s.PodPhase(ctx, namespace, userID)
	if err != nil {
		return "", err
	}
	return phaseToStatus(phase), nil
}

// ResolveIP returns the pod IP, using a short-lived cache to reduce k8s API calls.
func (m *Manager) ResolveIP(ctx context.Context, namespace, userID string, ttl time.Duration) (string, error) {
	key := namespace + ":" + userID
	ipCache.mu.Lock()
	if e, ok := ipCache.items[key]; ok && time.Now().Before(e.expiresAt) {
		ipCache.mu.Unlock()
		return e.ip, nil
	}
	ipCache.mu.Unlock()

	ip, err := m.k8s.PodIP(ctx, namespace, userID)
	if err != nil {
		return "", err
	}
	if ip != "" {
		ipCache.mu.Lock()
		ipCache.items[key] = cacheEntry{ip: ip, expiresAt: time.Now().Add(ttl)}
		ipCache.mu.Unlock()
	}
	return ip, nil
}

// reuseIfMatching returns true if an existing pod matches the requested image
// and resource tier, refreshing the Redis TTL if so.
func (m *Manager) reuseIfMatching(
	ctx context.Context,
	namespace, userID, image string,
	tier ResourceTier,
	ttl time.Duration,
) (bool, error) {
	pod, err := m.k8s.GetPod(ctx, namespace, userID)
	if err != nil {
		return false, err // not found or API error
	}
	if len(pod.Spec.Containers) == 0 {
		// Malformed pod — delete and let caller recreate.
		_ = m.k8s.DeletePod(ctx, namespace, userID)
		return false, nil
	}
	c := pod.Spec.Containers[0]

	sameImage := strings.EqualFold(strings.TrimSpace(c.Image), strings.TrimSpace(image))
	sameResources := resourcesMatch(c.Resources, tier)

	if sameImage && sameResources {
		slog.Info("reusing pod", "user", userID, "ns", namespace)
		_ = m.redis.WritePodRecord(ctx, namespace, userID, userID, ttl)
		return true, nil
	}

	// Mismatch — delete so caller creates fresh.
	slog.Info("pod mismatch; deleting to recreate", "user", userID, "ns", namespace)
	_ = m.k8s.DeletePod(ctx, namespace, userID)
	return false, nil
}

func buildPodManifest(userID, image string, tier ResourceTier) *corev1.Pod {
	return &corev1.Pod{
		ObjectMeta: metav1.ObjectMeta{
			Name:   userID,
			Labels: map[string]string{"app": "user-env", "user": userID},
		},
		Spec: corev1.PodSpec{
			RestartPolicy:                corev1.RestartPolicyNever,
			ServiceAccountName:           "default",
			AutomountServiceAccountToken: boolPtr(false),
			EnableServiceLinks:           boolPtr(false),
			Containers: []corev1.Container{
				{
					Name:    userID,
					Image:   image,
					Command: []string{"/bin/sh", "-c", "tail -f /dev/null"},
					Env: []corev1.EnvVar{
						{Name: "HOME", Value: "/app"},
					},
					Resources: corev1.ResourceRequirements{
						Requests: corev1.ResourceList{
							corev1.ResourceCPU:    resource.MustParse(tier.CPURequest),
							corev1.ResourceMemory: resource.MustParse(tier.MemoryRequest),
						},
						Limits: corev1.ResourceList{
							corev1.ResourceCPU:    resource.MustParse(tier.CPULimit),
							corev1.ResourceMemory: resource.MustParse(tier.MemoryLimit),
						},
					},
					SecurityContext: &corev1.SecurityContext{
						AllowPrivilegeEscalation: boolPtr(false),
					},
				},
			},
		},
	}
}

// StripK8sEnvVars is the env cleanup command prefix used for exec-based operations.
// Removes injected k8s service-account env vars from the user-visible shell.
var StripK8sEnvVars = []string{
	"/bin/sh", "-c",
	"unset KUBERNETES_SERVICE_PORT KUBERNETES_PORT HOSTNAME GPG_KEY PYTHON_SHA256 " +
		"KUBERNETES_PORT_443_TCP_ADDR KUBERNETES_PORT_443_TCP_PORT KUBERNETES_PORT_443_TCP_PROTO " +
		"LANG PYTHON_VERSION KUBERNETES_SERVICE_PORT_HTTPS KUBERNETES_PORT_443_TCP " +
		"KUBERNETES_SERVICE_HOST PWD; exec /bin/sh",
}

// SafeUserSlug converts a user ID to the slug format used in subdomain hostnames.
var nonAlnum = regexp.MustCompile(`[^a-z0-9-]+`)

func SafeUserSlug(userID string) string {
	slug := nonAlnum.ReplaceAllString(strings.ToLower(userID), "")
	if len(slug) > 24 {
		slug = slug[:24]
	}
	if slug == "" {
		return "u"
	}
	return slug
}

func phaseToStatus(phase string) string {
	switch phase {
	case "Running":
		return "running"
	case "Pending":
		return "pending"
	case "Terminating":
		return "terminating"
	case "":
		return "not_found"
	default:
		return strings.ToLower(phase)
	}
}

func resourcesMatch(res corev1.ResourceRequirements, tier ResourceTier) bool {
	get := func(list corev1.ResourceList, key corev1.ResourceName) string {
		if list == nil {
			return ""
		}
		if q, ok := list[key]; ok {
			return q.String()
		}
		return ""
	}
	return strings.EqualFold(get(res.Requests, corev1.ResourceCPU), tier.CPURequest) &&
		strings.EqualFold(get(res.Requests, corev1.ResourceMemory), tier.MemoryRequest) &&
		strings.EqualFold(get(res.Limits, corev1.ResourceCPU), tier.CPULimit) &&
		strings.EqualFold(get(res.Limits, corev1.ResourceMemory), tier.MemoryLimit)
}

func boolPtr(b bool) *bool { return &b }
