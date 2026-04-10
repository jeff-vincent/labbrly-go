// Package auth provides JWT validation middleware supporting Auth0 RS256 and
// custom HS256 tokens. Validated claims are placed into the request context
// and can be retrieved with FromContext.
//
// Public paths /healthz and /metrics are always bypassed. Additional paths
// can be registered with WithPublicPaths.
package auth

import (
	"context"
	"errors"
	"net/http"
	"os"
	"strings"
	"sync"
	"time"

	"github.com/MicahParks/keyfunc/v2"
	"github.com/golang-jwt/jwt/v5"
	"github.com/labbrly/shared/httputil"
)

const (
	auth0Domain   = "dev-w5iil6bapqnf2nai.us.auth0.com"
	auth0Audience = "urn:labthingy:api"
)

type contextKey int

const userInfoKey contextKey = 1

// UserInfo holds the claims extracted from a validated JWT.
type UserInfo struct {
	OrgID     string
	UserID    string
	LabID     string
	TokenType string // "auth0" | "custom"
	Token     string // raw token string (for downstream forwarding)
}

// FromContext retrieves UserInfo from the request context.
// Returns zero value and false if not present.
func FromContext(ctx context.Context) (UserInfo, bool) {
	v, ok := ctx.Value(userInfoKey).(UserInfo)
	return v, ok
}

// Option configures a Middleware.
type Option func(*options)

type options struct {
	extraPublicPaths []string
}

// WithPublicPaths adds paths that bypass JWT validation in addition to the
// built-in /healthz and /metrics.
func WithPublicPaths(paths ...string) Option {
	return func(o *options) {
		o.extraPublicPaths = append(o.extraPublicPaths, paths...)
	}
}

// Middleware validates incoming JWTs and injects UserInfo into the context.
type Middleware struct {
	jwks        *keyfunc.JWKS
	hs256Key    []byte
	publicPaths map[string]bool
	once        sync.Once
}

// New returns a Middleware using the LAB_THINGY_JWT_SECRET environment variable
// for HS256 validation and the Auth0 JWKS endpoint for RS256 validation.
func New(opts ...Option) (*Middleware, error) {
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

	o := &options{}
	for _, opt := range opts {
		opt(o)
	}

	public := map[string]bool{
		"/healthz": true,
		"/metrics": true,
	}
	for _, p := range o.extraPublicPaths {
		public[p] = true
	}

	return &Middleware{
		jwks:        jwks,
		hs256Key:    []byte(secret),
		publicPaths: public,
	}, nil
}

// Handler returns an http.Handler middleware that validates the JWT and
// injects UserInfo into the request context.
func (m *Middleware) Handler(next http.Handler) http.Handler {
	return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		if m.publicPaths[r.URL.Path] {
			next.ServeHTTP(w, r)
			return
		}

		token := extractToken(r)
		if token == "" {
			httputil.WriteJSON(w, http.StatusBadRequest, map[string]string{"detail": "authorization required"})
			return
		}

		claims, tokenType, err := m.validate(token)
		if err != nil {
			httputil.WriteJSON(w, http.StatusForbidden, map[string]string{"detail": "invalid token"})
			return
		}

		info := UserInfo{
			OrgID:     extractOrgID(claims),
			UserID:    strClaim(claims, "user_id", "sub"),
			LabID:     strClaim(claims, "lab_id"),
			TokenType: tokenType,
			Token:     token,
		}

		ctx := context.WithValue(r.Context(), userInfoKey, info)
		next.ServeHTTP(w, r.WithContext(ctx))
	})
}

// extractToken returns the best available token from the request.
// Precedence: cookie (lt_auth) > Authorization header > query param.
func extractToken(r *http.Request) string {
	if c, err := r.Cookie("lt_auth"); err == nil && c.Value != "" {
		return c.Value
	}
	if h := r.Header.Get("Authorization"); h != "" {
		h = strings.TrimPrefix(h, "Bearer ")
		if h = strings.TrimSpace(h); h != "" {
			return h
		}
	}
	if q := r.URL.Query().Get("auth"); q != "" {
		return q
	}
	return r.URL.Query().Get("token")
}

// validate tries RS256 (Auth0) first, then HS256 unless the JWT header
// explicitly declares HS256.
func (m *Middleware) validate(tokenStr string) (jwt.MapClaims, string, error) {
	alg, _ := peekAlg(tokenStr)
	if alg == "HS256" {
		claims, err := m.validateHS256(tokenStr)
		return claims, "custom", err
	}
	if claims, err := m.validateRS256(tokenStr); err == nil {
		return claims, "auth0", nil
	}
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

// ValidateHS256 validates an HS256 token without HTTP context.
// Useful for internal token verification outside of middleware.
func (m *Middleware) ValidateHS256(tokenStr string) (jwt.MapClaims, error) {
	return m.validateHS256(tokenStr)
}

func peekAlg(tokenStr string) (string, error) {
	parts := strings.Split(tokenStr, ".")
	if len(parts) != 3 {
		return "", errors.New("malformed jwt")
	}
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
