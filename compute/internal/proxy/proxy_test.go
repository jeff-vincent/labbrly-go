package proxy

import (
	"net/http"
	"net/http/httptest"
	"testing"
)

// newTestHandler builds a Handler with no real k8s/redis dependencies.
// baseDomain is set directly to exercise parsing logic.
func newTestHandler(baseDomain string) *Handler {
	h := &Handler{baseDomain: baseDomain}
	return h
}

// --- parseSubdomainHost ---

func TestParseSubdomainHost(t *testing.T) {
	h := newTestHandler("labs.subnode1.xyz")

	cases := []struct {
		host      string
		wantSlug  string
		wantPort  int
		wantMatch bool
	}{
		{"alice-3000-deadbe.labs.subnode1.xyz", "alice", 3000, true},
		{"bob-8080.labs.subnode1.xyz", "bob", 8080, true},
		{"user123-443-abcdef.labs.subnode1.xyz", "user123", 443, true},
		// Wrong base domain
		{"carol-9000.example.com", "", 0, false},
		// Port out of range
		{"dave-70000-abcdef.labs.subnode1.xyz", "", 0, false},
		// Port zero
		{"eve-0.labs.subnode1.xyz", "", 0, false},
		// No port segment
		{"notmatching.labs.subnode1.xyz", "", 0, false},
		// Base domain itself
		{"labs.subnode1.xyz", "", 0, false},
	}

	for _, c := range cases {
		slug, port, ok := h.parseSubdomainHost(c.host)
		if ok != c.wantMatch {
			t.Errorf("parseSubdomainHost(%q) match=%v, want %v", c.host, ok, c.wantMatch)
			continue
		}
		if ok {
			if slug != c.wantSlug {
				t.Errorf("parseSubdomainHost(%q) slug=%q, want %q", c.host, slug, c.wantSlug)
			}
			if port != c.wantPort {
				t.Errorf("parseSubdomainHost(%q) port=%d, want %d", c.host, port, c.wantPort)
			}
		}
	}
}

func TestParseSubdomainHostDisabled(t *testing.T) {
	h := newTestHandler("") // disabled
	_, _, ok := h.parseSubdomainHost("alice-3000.labs.subnode1.xyz")
	if ok {
		t.Error("expected no match when baseDomain is empty")
	}
}

// --- filterRequestHeaders ---

func TestFilterRequestHeaders(t *testing.T) {
	src := http.Header{
		"Authorization":   []string{"Bearer secret"},
		"Host":            []string{"labs.example.com"},
		"Connection":      []string{"keep-alive"},
		"X-Custom-Header": []string{"value"},
		"Content-Type":    []string{"application/json"},
		"Transfer-Encoding": []string{"chunked"},
	}
	out := filterRequestHeaders(src)

	for _, banned := range []string{"Authorization", "Host", "Connection", "Transfer-Encoding"} {
		if _, ok := out[banned]; ok {
			t.Errorf("filterRequestHeaders should strip %q", banned)
		}
	}
	for _, kept := range []string{"X-Custom-Header", "Content-Type"} {
		if _, ok := out[kept]; !ok {
			t.Errorf("filterRequestHeaders should keep %q", kept)
		}
	}
}

// --- filterResponseHeaders ---

func TestFilterResponseHeaders(t *testing.T) {
	src := http.Header{
		"Content-Type":      []string{"text/html"},
		"Content-Encoding":  []string{"gzip"},
		"Transfer-Encoding": []string{"chunked"},
		"Connection":        []string{"close"},
		"X-App-Version":     []string{"1.2.3"},
	}
	out := filterResponseHeaders(src)

	for _, banned := range []string{"Content-Encoding", "Transfer-Encoding", "Connection"} {
		if _, ok := out[banned]; ok {
			t.Errorf("filterResponseHeaders should strip %q", banned)
		}
	}
	for _, kept := range []string{"Content-Type", "X-App-Version"} {
		if _, ok := out[kept]; !ok {
			t.Errorf("filterResponseHeaders should keep %q", kept)
		}
	}
}

// --- externalScheme ---

func TestExternalScheme(t *testing.T) {
	cases := []struct {
		header     string
		forceHTTPS string
		want       string
	}{
		{"https", "", "https"},
		{"http", "", "http"},
		{"https, http", "", "https"}, // takes first
		{"", "0", ""},               // no env, no header → falls through to r.URL.Scheme=""
		{"", "1", "https"},          // FORCE_HTTPS=1
	}

	for _, c := range cases {
		t.Setenv("FORCE_HTTPS", c.forceHTTPS)
		req := httptest.NewRequest(http.MethodGet, "/", nil)
		if c.header != "" {
			req.Header.Set("X-Forwarded-Proto", c.header)
		}
		got := externalScheme(req)
		if got != c.want {
			t.Errorf("externalScheme(header=%q, FORCE_HTTPS=%q) = %q, want %q",
				c.header, c.forceHTTPS, got, c.want)
		}
	}
}

// --- stripAuthParams ---

func TestStripAuthParams(t *testing.T) {
	req := httptest.NewRequest(http.MethodGet, "http://user-3000-abc.labs.example.com/app?token=tok123&foo=bar&auth=x", nil)
	got := stripAuthParams(req)

	for _, banned := range []string{"token", "auth"} {
		// Parse URL and check query
		parsed, err := http.NewRequest(http.MethodGet, got, nil)
		if err != nil {
			t.Fatal(err)
		}
		if v := parsed.URL.Query().Get(banned); v != "" {
			t.Errorf("stripAuthParams left %q=%q in URL", banned, v)
		}
	}

	req2, _ := http.NewRequest(http.MethodGet, got, nil)
	if v := req2.URL.Query().Get("foo"); v != "bar" {
		t.Errorf("stripAuthParams removed non-auth param foo, got %q", v)
	}
}

// --- randomHex ---

func TestRandomHex(t *testing.T) {
	for i := 0; i < 10; i++ {
		h := randomHex(3)
		if len(h) != 6 {
			t.Errorf("randomHex(3) len=%d, want 6", len(h))
		}
		for _, ch := range h {
			if !('0' <= ch && ch <= '9') && !('a' <= ch && ch <= 'f') {
				t.Errorf("randomHex(3) contains non-hex char %q", ch)
			}
		}
	}
}

// --- SubdomainMiddleware passthrough ---

func TestSubdomainMiddlewarePassthrough(t *testing.T) {
	h := newTestHandler("labs.subnode1.xyz")

	called := false
	next := http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		called = true
		w.WriteHeader(http.StatusOK)
	})

	// Request to a non-subdomain host should pass through to next.
	req := httptest.NewRequest(http.MethodGet, "/healthz", nil)
	req.Host = "compute.internal"
	rr := httptest.NewRecorder()
	h.SubdomainMiddleware(next).ServeHTTP(rr, req)

	if !called {
		t.Error("expected next handler to be called for non-subdomain host")
	}
}

// --- ProxyDirect returns 410 ---

func TestProxyDirectReturns410(t *testing.T) {
	h := newTestHandler("labs.subnode1.xyz")
	req := httptest.NewRequest(http.MethodGet, "/compute/proxy/http/3000/some/path", nil)
	rr := httptest.NewRecorder()
	h.ProxyDirect(rr, req)

	if rr.Code != http.StatusGone {
		t.Errorf("ProxyDirect status = %d, want 410", rr.Code)
	}
}
