// Package auth provides JWT validation middleware supporting Auth0 RS256 and
// custom HS256 tokens. Validated claims are placed into the request context.
package auth

import (
	"context"
	"encoding/json"
	"errors"
	"net/http"
	"os"
	"strings"
	"sync"
	"time"

	"github.com/MicahParks/keyfunc/v2"
	"github.com/golang-jwt/jwt/v5"
)

const (
	auth0Domain   = "dev-w5iil6bapqnf2nai.us.auth0.com"
	auth0Audience = "urn:labthingy:api"
)

// contextKey is an unexported type for context keys in this package.
type contextKey int

const userInfoKey contextKey = 1

// UserInfo holds the claims extracted from a validated JWT.
type UserInfo struct {
	OrgID     string
	UserID    string
	LabID     string
	TokenType string // "auth0" | "custom"
}

// FromContext retrieves UserInfo from the request context. Returns zero value
// and false if not present.
func FromContext(ctx context.Context) (UserInfo, bool) {
	v, ok := ctx.Value(userInfoKey).(UserInfo)
	return v, ok
}

// Middleware validates incoming JWTs and injects UserInfo into the context.
// Priority order for token source: cookie (lt_auth) → Authorization header → query param.
// Public paths (/healthz, /metrics, POST /compute/create-namespace,
// /compute/terminal/*) bypass validation.
type Middleware struct {
	jwks     *keyfunc.JWKS
	hs256Key []byte
	debugJWT bool

	once sync.Once
}

func NewMiddleware() (*Middleware, error) {
	secret := os.Getenv("LAB_THINGY_JWT_SECRET")
	if secret == "" {
		return nil, errors.New("LAB_THINGY_JWT_SECRET is required")
	}

	jwksURL := "https://" + auth0Domain + "/.well-known/jwks.json"
	jwks, err := keyfunc.Get(jwksURL, keyfunc.Options{
		RefreshInterval: 1 * time.Hour,
		RefreshTimeout:  10 * time.Second,
	})
	if err != nil {
		return nil, err
	}

	return &Middleware{
		jwks:     jwks,
		hs256Key: []byte(secret),
		debugJWT: os.Getenv("LOG_JWT_DEBUG") == "1",
	}, nil
}

func (m *Middleware) Handler(next http.Handler) http.Handler {
	return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		// Public endpoints
		if r.URL.Path == "/healthz" || r.URL.Path == "/metrics" {
			next.ServeHTTP(w, r)
			return
		}
		if r.URL.Path == "/compute/create-namespace" && r.Method == http.MethodPost {
			next.ServeHTTP(w, r)
			return
		}
		// The terminal WebSocket authenticates itself via its own first-frame
		// handshake (see terminal.Handler.Terminal) — mirroring the original
		// Python/FastAPI @app.websocket route, which HTTP middleware never
		// wrapped in the first place. Browsers cannot set custom headers on
		// WebSocket upgrade requests, so requiring header/cookie/query auth
		// here would make the terminal permanently unreachable.
		if strings.HasPrefix(r.URL.Path, "/compute/terminal/") {
			next.ServeHTTP(w, r)
			return
		}

		token := m.extractToken(r)
		if token == "" {
			writeJSON(w, http.StatusBadRequest, map[string]string{"detail": "authorization required"})
			return
		}

		claims, tokenType, err := m.validate(token)
		if err != nil {
			if m.debugJWT {
				_ = err // logged in validate
			}
			writeJSON(w, http.StatusForbidden, map[string]string{"detail": "invalid token"})
			return
		}

		info := UserInfo{
			OrgID:     extractOrgID(claims),
			UserID:    strClaim(claims, "user_id", "sub"),
			LabID:     strClaim(claims, "lab_id"),
			TokenType: tokenType,
		}

		ctx := context.WithValue(r.Context(), userInfoKey, info)
		resp := newResponseRecorder(w)
		next.ServeHTTP(resp, r.WithContext(ctx))

		// Set bootstrap cookie on path-proxy requests if not already present.
		_, noCookie := r.Cookie("lt_auth")
		if strings.HasPrefix(r.URL.Path, "/compute/proxy/http/") && noCookie != nil {
			http.SetCookie(resp, &http.Cookie{
				Name:     "lt_auth",
				Value:    token,
				MaxAge:   300,
				HttpOnly: true,
				SameSite: http.SameSiteLaxMode,
			})
		}

		resp.flush()
	})
}

// extractToken returns the best available token from the request.
// Precedence: cookie > Authorization header > query param.
func (m *Middleware) extractToken(r *http.Request) string {
	if c, err := r.Cookie("lt_auth"); err == nil && c.Value != "" {
		return c.Value
	}
	if h := r.Header.Get("Authorization"); h != "" {
		h = strings.TrimPrefix(h, "Bearer ")
		h = strings.TrimSpace(h)
		if h != "" {
			return h
		}
	}
	if q := r.URL.Query().Get("auth"); q != "" {
		return q
	}
	return r.URL.Query().Get("token")
}

// validate attempts RS256 (Auth0) first, then falls back to HS256 unless the
// JWT header explicitly declares HS256.
func (m *Middleware) validate(tokenStr string) (jwt.MapClaims, string, error) {
	// Peek at the algorithm header so we can skip unnecessary attempts.
	alg, _ := peekAlg(tokenStr)

	if alg == "HS256" {
		claims, err := m.validateHS256(tokenStr)
		return claims, "custom", err
	}

	// Try Auth0 first.
	if claims, err := m.validateRS256(tokenStr); err == nil {
		return claims, "auth0", nil
	}

	// Fallback to HS256.
	claims, err := m.validateHS256(tokenStr)
	return claims, "custom", err
}

func (m *Middleware) validateRS256(tokenStr string) (jwt.MapClaims, error) {
	token, err := jwt.Parse(tokenStr, m.jwks.Keyfunc,
		jwt.WithAudience(auth0Audience),
		jwt.WithIssuer("https://"+auth0Domain+"/"),
		jwt.WithValidMethods([]string{"RS256"}),
	)
	if err != nil {
		return nil, err
	}
	claims, ok := token.Claims.(jwt.MapClaims)
	if !ok || !token.Valid {
		return nil, errors.New("invalid claims")
	}
	return claims, nil
}

func (m *Middleware) validateHS256(tokenStr string) (jwt.MapClaims, error) {
	token, err := jwt.Parse(tokenStr,
		func(t *jwt.Token) (interface{}, error) {
			if _, ok := t.Method.(*jwt.SigningMethodHMAC); !ok {
				return nil, errors.New("unexpected signing method")
			}
			return m.hs256Key, nil
		},
		jwt.WithValidMethods([]string{"HS256"}),
	)
	if err != nil {
		return nil, err
	}
	claims, ok := token.Claims.(jwt.MapClaims)
	if !ok || !token.Valid {
		return nil, errors.New("invalid claims")
	}
	return claims, nil
}

// ValidateHS256Public validates an HS256 token without HTTP context — used by
// the subdomain proxy middleware for cookie fallback auth.
func (m *Middleware) ValidateHS256Public(tokenStr string) (jwt.MapClaims, error) {
	return m.validateHS256(tokenStr)
}

// peekAlg returns the algorithm from the JWT header without verification.
func peekAlg(tokenStr string) (string, error) {
	parts := strings.Split(tokenStr, ".")
	if len(parts) != 3 {
		return "", errors.New("malformed jwt")
	}
	// jwt.ParseHeader would be ideal but we just need the alg field cheaply.
	token, _, err := new(jwt.Parser).ParseUnverified(tokenStr, jwt.MapClaims{})
	if err != nil {
		return "", err
	}
	return token.Method.Alg(), nil
}

func extractOrgID(c jwt.MapClaims) string {
	if v := strClaim(c, "org_id"); v != "" {
		return v
	}
	if v := strClaim(c, "https://labthingy.com/org_id"); v != "" {
		return v
	}
	return strClaim(c, "org")
}

func strClaim(c jwt.MapClaims, keys ...string) string {
	for _, k := range keys {
		if v, ok := c[k]; ok {
			if s, ok := v.(string); ok && s != "" {
				return s
			}
		}
	}
	return ""
}

func writeJSON(w http.ResponseWriter, status int, v any) {
	w.Header().Set("Content-Type", "application/json")
	w.WriteHeader(status)
	_ = json.NewEncoder(w).Encode(v)
}

// responseRecorder buffers the response so we can inject Set-Cookie before
// the headers are flushed.
type responseRecorder struct {
	http.ResponseWriter
	code    int
	headers http.Header
	buf     []byte
}

func newResponseRecorder(w http.ResponseWriter) *responseRecorder {
	return &responseRecorder{ResponseWriter: w, code: http.StatusOK, headers: w.Header()}
}

func (r *responseRecorder) WriteHeader(code int) { r.code = code }
func (r *responseRecorder) Write(b []byte) (int, error) {
	r.buf = append(r.buf, b...)
	return len(b), nil
}
func (r *responseRecorder) flush() {
	r.ResponseWriter.WriteHeader(r.code)
	_, _ = r.ResponseWriter.Write(r.buf)
}
