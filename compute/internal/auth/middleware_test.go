package auth

import (
	"net/http"
	"net/http/httptest"
	"testing"
	"time"

	"github.com/golang-jwt/jwt/v5"
)

const testSecret = "test-secret-for-unit-tests"

// makeHS256Token mints a valid HS256 token with the given claims.
func makeHS256Token(t *testing.T, claims jwt.MapClaims) string {
	t.Helper()
	tok := jwt.NewWithClaims(jwt.SigningMethodHS256, claims)
	s, err := tok.SignedString([]byte(testSecret))
	if err != nil {
		t.Fatalf("failed to sign token: %v", err)
	}
	return s
}

// --- extractToken ---

func TestExtractToken_Cookie(t *testing.T) {
	m := &Middleware{}
	req := httptest.NewRequest(http.MethodGet, "/", nil)
	req.AddCookie(&http.Cookie{Name: "lt_auth", Value: "cookie-tok"})
	req.Header.Set("Authorization", "Bearer header-tok")
	// Cookie takes precedence over header
	if got := m.extractToken(req); got != "cookie-tok" {
		t.Errorf("got %q, want cookie-tok", got)
	}
}

func TestExtractToken_BearerHeader(t *testing.T) {
	m := &Middleware{}
	req := httptest.NewRequest(http.MethodGet, "/", nil)
	req.Header.Set("Authorization", "Bearer header-tok")
	if got := m.extractToken(req); got != "header-tok" {
		t.Errorf("got %q, want header-tok", got)
	}
}

func TestExtractToken_QueryParam(t *testing.T) {
	m := &Middleware{}
	req := httptest.NewRequest(http.MethodGet, "/?token=query-tok", nil)
	if got := m.extractToken(req); got != "query-tok" {
		t.Errorf("got %q, want query-tok", got)
	}
}

func TestExtractToken_AuthQueryParam(t *testing.T) {
	m := &Middleware{}
	req := httptest.NewRequest(http.MethodGet, "/?auth=auth-tok", nil)
	if got := m.extractToken(req); got != "auth-tok" {
		t.Errorf("got %q, want auth-tok", got)
	}
}

func TestExtractToken_Empty(t *testing.T) {
	m := &Middleware{}
	req := httptest.NewRequest(http.MethodGet, "/", nil)
	if got := m.extractToken(req); got != "" {
		t.Errorf("got %q, want empty", got)
	}
}

// --- validateHS256 ---

func TestValidateHS256_Valid(t *testing.T) {
	m := &Middleware{hs256Key: []byte(testSecret)}
	tok := makeHS256Token(t, jwt.MapClaims{
		"user_id": "u1",
		"org_id":  "org_acme",
		"exp":     time.Now().Add(time.Hour).Unix(),
	})
	claims, err := m.validateHS256(tok)
	if err != nil {
		t.Fatalf("unexpected error: %v", err)
	}
	if claims["user_id"] != "u1" {
		t.Errorf("user_id = %v, want u1", claims["user_id"])
	}
}

func TestValidateHS256_WrongSecret(t *testing.T) {
	m := &Middleware{hs256Key: []byte("wrong-secret")}
	tok := makeHS256Token(t, jwt.MapClaims{
		"user_id": "u1",
		"exp":     time.Now().Add(time.Hour).Unix(),
	})
	if _, err := m.validateHS256(tok); err == nil {
		t.Error("expected error for wrong secret, got nil")
	}
}

func TestValidateHS256_Expired(t *testing.T) {
	m := &Middleware{hs256Key: []byte(testSecret)}
	tok := makeHS256Token(t, jwt.MapClaims{
		"user_id": "u1",
		"exp":     time.Now().Add(-time.Hour).Unix(), // expired
	})
	if _, err := m.validateHS256(tok); err == nil {
		t.Error("expected error for expired token, got nil")
	}
}

func TestValidateHS256_Malformed(t *testing.T) {
	m := &Middleware{hs256Key: []byte(testSecret)}
	if _, err := m.validateHS256("not.a.valid.jwt"); err == nil {
		t.Error("expected error for malformed token, got nil")
	}
}

// --- strClaim ---

func TestStrClaim(t *testing.T) {
	c := jwt.MapClaims{"a": "found", "b": 42}
	if got := strClaim(c, "missing"); got != "" {
		t.Errorf("strClaim missing key = %q, want empty", got)
	}
	if got := strClaim(c, "b"); got != "" {
		t.Errorf("strClaim non-string value = %q, want empty", got)
	}
	if got := strClaim(c, "a"); got != "found" {
		t.Errorf("strClaim = %q, want found", got)
	}
	// First key wins
	if got := strClaim(c, "a", "missing"); got != "found" {
		t.Errorf("strClaim first-wins = %q, want found", got)
	}
}

// --- extractOrgID ---

func TestExtractOrgID(t *testing.T) {
	cases := []struct {
		claims jwt.MapClaims
		want   string
	}{
		{jwt.MapClaims{"org_id": "org_a"}, "org_a"},
		{jwt.MapClaims{"https://labthingy.com/org_id": "org_b"}, "org_b"},
		{jwt.MapClaims{"org": "org_c"}, "org_c"},
		{jwt.MapClaims{}, ""},
	}
	for _, c := range cases {
		got := extractOrgID(c.claims)
		if got != c.want {
			t.Errorf("extractOrgID(%v) = %q, want %q", c.claims, got, c.want)
		}
	}
}

// --- peekAlg ---

func TestPeekAlg(t *testing.T) {
	m := &Middleware{hs256Key: []byte(testSecret)}
	tok := makeHS256Token(t, jwt.MapClaims{"sub": "u"})
	alg, err := peekAlg(tok)
	if err != nil {
		t.Fatalf("peekAlg error: %v", err)
	}
	if alg != "HS256" {
		t.Errorf("peekAlg = %q, want HS256", alg)
	}
	_ = m
}

func TestPeekAlg_Malformed(t *testing.T) {
	_, err := peekAlg("garbage")
	if err == nil {
		t.Error("expected error for malformed token")
	}
}

// --- public endpoint bypass (handler-level) ---

func TestPublicEndpointsBypass(t *testing.T) {
	// Build a minimal middleware with hs256Key only; no live JWKS needed.
	m := &Middleware{hs256Key: []byte(testSecret)}

	publicPaths := []struct {
		method string
		path   string
	}{
		{http.MethodGet, "/healthz"},
		{http.MethodGet, "/metrics"},
		{http.MethodPost, "/compute/create-namespace"},
	}

	for _, p := range publicPaths {
		called := false
		next := http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
			called = true
			w.WriteHeader(http.StatusOK)
		})
		req := httptest.NewRequest(p.method, p.path, nil)
		// No token — should still reach next
		rr := httptest.NewRecorder()
		m.Handler(next).ServeHTTP(rr, req)
		if !called {
			t.Errorf("public path %s %s should bypass auth", p.method, p.path)
		}
	}
}

// --- protected endpoint without token returns 400 ---

func TestProtectedEndpoint_NoToken(t *testing.T) {
	m := &Middleware{hs256Key: []byte(testSecret)}
	next := http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		w.WriteHeader(http.StatusOK)
	})
	req := httptest.NewRequest(http.MethodGet, "/compute/start", nil)
	rr := httptest.NewRecorder()
	m.Handler(next).ServeHTTP(rr, req)
	if rr.Code != http.StatusBadRequest {
		t.Errorf("no token: status = %d, want 400", rr.Code)
	}
}

// --- protected endpoint with invalid token returns 403 ---

func TestProtectedEndpoint_InvalidToken(t *testing.T) {
	m := &Middleware{hs256Key: []byte(testSecret)}
	next := http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		w.WriteHeader(http.StatusOK)
	})
	req := httptest.NewRequest(http.MethodGet, "/compute/start", nil)
	req.Header.Set("Authorization", "Bearer totally.invalid.token")
	rr := httptest.NewRecorder()
	m.Handler(next).ServeHTTP(rr, req)
	if rr.Code != http.StatusForbidden {
		t.Errorf("invalid token: status = %d, want 403", rr.Code)
	}
}

// --- valid HS256 token populates context ---

func TestProtectedEndpoint_ValidHS256(t *testing.T) {
	m := &Middleware{hs256Key: []byte(testSecret)}

	var capturedInfo UserInfo
	next := http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		info, ok := FromContext(r.Context())
		if !ok {
			t.Error("expected UserInfo in context")
		}
		capturedInfo = info
		w.WriteHeader(http.StatusOK)
	})

	tok := makeHS256Token(t, jwt.MapClaims{
		"user_id": "user_abc",
		"org_id":  "org_acme",
		"lab_id":  "lab_xyz",
		"exp":     time.Now().Add(time.Hour).Unix(),
	})

	req := httptest.NewRequest(http.MethodGet, "/compute/start", nil)
	req.Header.Set("Authorization", "Bearer "+tok)
	rr := httptest.NewRecorder()
	m.Handler(next).ServeHTTP(rr, req)

	if rr.Code != http.StatusOK {
		t.Fatalf("status = %d, want 200", rr.Code)
	}
	if capturedInfo.UserID != "user_abc" {
		t.Errorf("UserID = %q, want user_abc", capturedInfo.UserID)
	}
	if capturedInfo.OrgID != "org_acme" {
		t.Errorf("OrgID = %q, want org_acme", capturedInfo.OrgID)
	}
	if capturedInfo.TokenType != "custom" {
		t.Errorf("TokenType = %q, want custom", capturedInfo.TokenType)
	}
}
