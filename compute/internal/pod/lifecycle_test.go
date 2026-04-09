package pod

import (
	"testing"

	corev1 "k8s.io/api/core/v1"
	"k8s.io/apimachinery/pkg/api/resource"
)

func TestOrgNamespace(t *testing.T) {
	cases := []struct {
		in   string
		want string
	}{
		{"org_acme", "acme"},
		{"org_MyCompany", "mycompany"},
		{"acme", "acme"}, // no prefix
		{"ORG_UPPER", "org_upper"}, // TrimPrefix is case-sensitive; lowercased result
		{"", ""},
	}
	for _, c := range cases {
		got := OrgNamespace(c.in)
		if got != c.want {
			t.Errorf("OrgNamespace(%q) = %q, want %q", c.in, got, c.want)
		}
	}
}

func TestSafeUserSlug(t *testing.T) {
	cases := []struct {
		in   string
		want string
	}{
		{"alice", "alice"},
		{"User123", "user123"},
		{"user@example.com", "userexamplecom"},
		{"user_with_underscores", "userwithunderscores"},
		{"a-b-c", "a-b-c"},
		{"", "u"},
		// Truncation at 24 chars
		{"averylongusernamethatexceedstwentyfour", "averylongusernamethatexc"},
	}
	for _, c := range cases {
		got := SafeUserSlug(c.in)
		if got != c.want {
			t.Errorf("SafeUserSlug(%q) = %q, want %q", c.in, got, c.want)
		}
		if len(got) > 24 {
			t.Errorf("SafeUserSlug(%q) len=%d > 24", c.in, len(got))
		}
	}
}

func TestTierByName(t *testing.T) {
	cases := []struct {
		name       string
		wantCPUReq string
	}{
		{"small", "100m"},
		{"medium", "200m"},
		{"large", "400m"},
		{"unknown", "100m"}, // falls back to small
		{"", "100m"},
	}
	for _, c := range cases {
		got := TierByName(c.name)
		if got.CPURequest != c.wantCPUReq {
			t.Errorf("TierByName(%q).CPURequest = %q, want %q", c.name, got.CPURequest, c.wantCPUReq)
		}
	}
}

func TestPhaseToStatus(t *testing.T) {
	cases := []struct {
		phase string
		want  string
	}{
		{"Running", "running"},
		{"Pending", "pending"},
		{"Terminating", "terminating"},
		{"", "not_found"},
		{"Failed", "failed"},
		{"Succeeded", "succeeded"},
	}
	for _, c := range cases {
		got := phaseToStatus(c.phase)
		if got != c.want {
			t.Errorf("phaseToStatus(%q) = %q, want %q", c.phase, got, c.want)
		}
	}
}

func TestResourcesMatch(t *testing.T) {
	tier := ResourceTier{
		CPURequest: "100m", CPULimit: "400m",
		MemoryRequest: "320Mi", MemoryLimit: "640Mi",
	}

	matchingResources := corev1.ResourceRequirements{
		Requests: corev1.ResourceList{
			corev1.ResourceCPU:    resource.MustParse("100m"),
			corev1.ResourceMemory: resource.MustParse("320Mi"),
		},
		Limits: corev1.ResourceList{
			corev1.ResourceCPU:    resource.MustParse("400m"),
			corev1.ResourceMemory: resource.MustParse("640Mi"),
		},
	}

	if !resourcesMatch(matchingResources, tier) {
		t.Error("expected matching resources to return true")
	}

	mismatch := corev1.ResourceRequirements{
		Requests: corev1.ResourceList{
			corev1.ResourceCPU:    resource.MustParse("200m"), // wrong
			corev1.ResourceMemory: resource.MustParse("320Mi"),
		},
		Limits: corev1.ResourceList{
			corev1.ResourceCPU:    resource.MustParse("400m"),
			corev1.ResourceMemory: resource.MustParse("640Mi"),
		},
	}
	if resourcesMatch(mismatch, tier) {
		t.Error("expected mismatched resources to return false")
	}
}

func TestBuildPodManifest(t *testing.T) {
	tier := TierByName("small")
	p := buildPodManifest("user123", "myimage:latest", tier)

	if p.Name != "user123" {
		t.Errorf("pod name = %q, want %q", p.Name, "user123")
	}
	if len(p.Spec.Containers) != 1 {
		t.Fatalf("expected 1 container, got %d", len(p.Spec.Containers))
	}
	c := p.Spec.Containers[0]
	if c.Image != "myimage:latest" {
		t.Errorf("container image = %q, want %q", c.Image, "myimage:latest")
	}
	if *p.Spec.AutomountServiceAccountToken {
		t.Error("AutomountServiceAccountToken should be false")
	}
	if *c.SecurityContext.AllowPrivilegeEscalation {
		t.Error("AllowPrivilegeEscalation should be false")
	}
	if p.Spec.RestartPolicy != corev1.RestartPolicyNever {
		t.Errorf("restart policy = %q, want Never", p.Spec.RestartPolicy)
	}
}
