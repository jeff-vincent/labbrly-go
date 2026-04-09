// Package proxy implements the subdomain-based reverse proxy that routes
// authenticated requests to a user's running pod.
package proxy

import (
	"crypto/rand"
	"encoding/hex"
	"encoding/json"
	"io"
	"log/slog"
	"net/http"
	"os"
	"regexp"
	"strconv"
	"strings"
	"time"

	"github.com/go-chi/chi/v5"
	"github.com/golang-jwt/jwt/v5"
	"github.com/labbrly/compute/internal/auth"
	"github.com/labbrly/compute/internal/pod"
)

// hopByHop headers must not be forwarded to the upstream pod.
var hopByHop = map[string]bool{
	"connection":          true,
	"keep-alive":          true,
	"proxy-authenticate":  true,
	"proxy-authorization": true,
	"te":                  true,
	"trailers":            true,
	"transfer-encoding":   true,
	"upgrade":             true,
}

// hostTokenRE matches <user>-<port>[-<hex>] in the subdomain label.
var hostTokenRE = regexp.MustCompile(`^([a-z0-9-]{1,50})-([0-9]{1,5})(?:-[a-f0-9]{6})?$`)

// Handler groups the proxy HTTP handlers.
type Handler struct {
	manager    *pod.Manager
	authMW     *auth.Middleware
	baseDomain string        // e.g. "labs.subnode1.xyz"
	sessionTTL time.Duration // cookie max-age for subdomain sessions
}

func NewHandler(manager *pod.Manager, authMW *auth.Middleware) *Handler {
	base := strings.ToLower(strings.TrimSpace(os.Getenv("SUBDOMAIN_PROXY_BASE_DOMAIN")))
	ttl := 900 * time.Second
	if v := os.Getenv("SUBDOMAIN_SESSION_MAX_AGE"); v != "" {
		if n, err := strconv.Atoi(v); err == nil {
			ttl = time.Duration(n) * time.Second
		}
	}
	return &Handler{
		manager:    manager,
		authMW:     authMW,
		baseDomain: base,
		sessionTTL: ttl,
	}
}

// SubdomainMiddleware intercepts wildcard-subdomain requests and proxies them
// to the authenticated user's pod. Non-matching hosts fall through to chi.
func (h *Handler) SubdomainMiddleware(next http.Handler) http.Handler {
	return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		if h.baseDomain == "" {
			next.ServeHTTP(w, r)
			return
		}

		host := strings.ToLower(r.Host)
		userSlug, port, ok := h.parseSubdomainHost(host)
		if !ok {
			next.ServeHTTP(w, r)
			return
		}

		// --- Bootstrap cookie redirect ---
		cookieToken := cookieVal(r, "lt_auth")
		queryToken := r.URL.Query().Get("token")
		if queryToken == "" {
			queryToken = r.URL.Query().Get("auth")
		}

		needBootstrap := false
		if queryToken != "" && cookieToken == "" {
			needBootstrap = true
		} else if queryToken != "" && cookieToken != "" {
			// Override stale cookie from a different user session.
			if slug := slugFromToken(cookieToken, h.authMW); slug != userSlug {
				needBootstrap = true
			}
		}

		if needBootstrap {
			cleanURL := stripAuthParams(r)
			secure := os.Getenv("COOKIE_SECURE") == "1"
			sameSite := http.SameSiteLaxMode
			if secure {
				sameSite = http.SameSiteNoneMode
			}
			http.SetCookie(w, &http.Cookie{
				Name:     "lt_auth",
				Value:    queryToken,
				MaxAge:   int(h.sessionTTL.Seconds()),
				HttpOnly: true,
				Secure:   secure,
				SameSite: sameSite,
				Domain:   h.baseDomain,
			})
			http.Redirect(w, r, cleanURL, http.StatusFound)
			return
		}

		// --- Resolve authenticated user ---
		namespace, userID, err := h.resolveUser(r)
		if err != nil {
			writeJSON(w, http.StatusUnauthorized, map[string]string{"error": "unauthorized"})
			return
		}

		expectedSlug := pod.SafeUserSlug(userID)
		if expectedSlug != userSlug {
			writeJSON(w, http.StatusForbidden, map[string]string{"error": "forbidden host user mismatch"})
			return
		}

		h.proxyToPod(w, r, namespace, userID, port, r.URL.Path, false, "subdomain-proxy")
	})
}

// ProxyHostInfo returns the subdomain host and URL for a given port.
// GET /compute/proxy/host/{port}
func (h *Handler) ProxyHostInfo(w http.ResponseWriter, r *http.Request) {
	portStr := chi.URLParam(r, "port")
	port, err := strconv.Atoi(portStr)
	if err != nil || port < 1 || port > 65535 {
		writeJSON(w, http.StatusBadRequest, map[string]string{"error": "invalid port"})
		return
	}
	if h.baseDomain == "" {
		writeJSON(w, http.StatusNotImplemented, map[string]string{"error": "subdomain proxy disabled"})
		return
	}

	info, ok := auth.FromContext(r.Context())
	if !ok {
		writeJSON(w, http.StatusUnauthorized, map[string]string{"error": "unauthorized"})
		return
	}
	namespace := pod.OrgNamespace(info.OrgID)
	userID := info.UserID

	ip, err := h.manager.ResolveIP(r.Context(), namespace, userID, 15*time.Second)
	if err != nil || ip == "" {
		writeJSON(w, http.StatusConflict, map[string]string{"error": "pod not running"})
		return
	}

	slug := pod.SafeUserSlug(userID)
	shortHash := randomHex(3)
	host := slug + "-" + strconv.Itoa(port) + "-" + shortHash + "." + h.baseDomain
	scheme := externalScheme(r)
	writeJSON(w, http.StatusOK, map[string]string{
		"host": host,
		"url":  scheme + "://" + host + "/",
	})
}

// ProxyDirect is the deprecated path-proxy endpoint — returns 410 Gone.
// GET/POST/... /compute/proxy/http/{port}/{path}
func (h *Handler) ProxyDirect(w http.ResponseWriter, r *http.Request) {
	writeJSON(w, http.StatusGone, map[string]string{"error": "path proxy deprecated; use subdomain host flow"})
}

// proxyToPod is the shared core: resolve pod IP, filter headers, stream request/response.
func (h *Handler) proxyToPod(
	w http.ResponseWriter,
	r *http.Request,
	namespace, userID string,
	port int,
	rawPath string,
	forwardHost bool,
	logPrefix string,
) {
	if port < 1 || port > 65535 {
		writeJSON(w, http.StatusBadRequest, map[string]string{"error": "invalid port"})
		return
	}

	ip, err := h.manager.ResolveIP(r.Context(), namespace, userID, 15*time.Second)
	if err != nil || ip == "" {
		writeJSON(w, http.StatusConflict, map[string]string{"error": "pod not running"})
		return
	}

	if !strings.HasPrefix(rawPath, "/") {
		rawPath = "/" + rawPath
	}
	query := r.URL.RawQuery
	target := "http://" + ip + ":" + strconv.Itoa(port) + rawPath
	if query != "" {
		target += "?" + query
	}

	outHeaders := filterRequestHeaders(r.Header)
	if forwardHost && os.Getenv("PROXY_FORWARD_ORIGINAL_HOST") == "1" {
		if oh := r.Header.Get("X-Forwarded-Host"); oh != "" {
			outHeaders.Set("Host", oh)
		} else if oh = r.Header.Get("Host"); oh != "" {
			outHeaders.Set("Host", oh)
		}
	}
	outHeaders.Set("X-LabThingy-Proxy", "1")

	req, err := http.NewRequestWithContext(r.Context(), r.Method, target, r.Body)
	if err != nil {
		writeJSON(w, http.StatusInternalServerError, map[string]string{"error": "proxy error"})
		return
	}
	req.Header = outHeaders

	client := &http.Client{Timeout: 0} // streaming; no timeout here
	resp, err := client.Do(req)
	if err != nil {
		slog.Warn("proxy upstream error", "prefix", logPrefix, "target", target, "err", err)
		writeJSON(w, http.StatusBadGateway, map[string]string{"error": "upstream unreachable"})
		return
	}
	defer resp.Body.Close()

	slog.Info("proxy", "prefix", logPrefix, "ns", namespace, "user", userID, "target", target, "status", resp.StatusCode)

	for k, vv := range filterResponseHeaders(resp.Header) {
		for _, v := range vv {
			w.Header().Add(k, v)
		}
	}
	w.WriteHeader(resp.StatusCode)
	_, _ = io.Copy(w, resp.Body)
}

// parseSubdomainHost extracts (userSlug, port) from a wildcard subdomain host.
func (h *Handler) parseSubdomainHost(host string) (string, int, bool) {
	suffix := "." + h.baseDomain
	if !strings.HasSuffix(host, suffix) {
		return "", 0, false
	}
	prefix := host[:len(host)-len(suffix)]
	m := hostTokenRE.FindStringSubmatch(prefix)
	if m == nil {
		return "", 0, false
	}
	port, err := strconv.Atoi(m[2])
	if err != nil || port < 1 || port > 65535 {
		return "", 0, false
	}
	return m[1], port, true
}

// resolveUser returns namespace and userID from either the request context
// (set by auth middleware) or by decoding the cookie token directly (fallback
// for the bootstrap flow where the main auth middleware may not have run yet).
func (h *Handler) resolveUser(r *http.Request) (string, string, error) {
	if info, ok := auth.FromContext(r.Context()); ok && info.UserID != "" {
		return pod.OrgNamespace(info.OrgID), info.UserID, nil
	}

	token := cookieVal(r, "lt_auth")
	if token == "" {
		token = r.URL.Query().Get("token")
	}
	if token == "" {
		token = r.URL.Query().Get("auth")
	}
	if token == "" {
		return "", "", errUnauthorized
	}

	claims, err := h.authMW.ValidateHS256Public(token)
	if err != nil {
		return "", "", err
	}
	orgID := claimStr(claims, "org_id", "https://labthingy.com/org_id", "org")
	userID := claimStr(claims, "user_id", "sub")
	return pod.OrgNamespace(orgID), userID, nil
}

var errUnauthorized = &proxyError{"unauthorized"}

type proxyError struct{ msg string }

func (e *proxyError) Error() string { return e.msg }

func filterRequestHeaders(src http.Header) http.Header {
	out := make(http.Header)
	for k, vv := range src {
		lk := strings.ToLower(k)
		if hopByHop[lk] || lk == "authorization" || lk == "host" {
			continue
		}
		out[k] = vv
	}
	return out
}

func filterResponseHeaders(src http.Header) http.Header {
	exclude := map[string]bool{
		"content-encoding":  true,
		"transfer-encoding": true,
		"connection":        true,
	}
	for k := range hopByHop {
		exclude[k] = true
	}
	out := make(http.Header)
	for k, vv := range src {
		if !exclude[strings.ToLower(k)] {
			out[k] = vv
		}
	}
	return out
}

func externalScheme(r *http.Request) string {
	if proto := r.Header.Get("X-Forwarded-Proto"); proto != "" {
		first := strings.ToLower(strings.SplitN(proto, ",", 2)[0])
		if first == "http" || first == "https" {
			return first
		}
	}
	if os.Getenv("FORCE_HTTPS") != "0" {
		return "https"
	}
	return r.URL.Scheme
}

func stripAuthParams(r *http.Request) string {
	q := r.URL.Query()
	q.Del("token")
	q.Del("auth")
	u := *r.URL
	u.RawQuery = q.Encode()
	if u.Scheme == "" {
		u.Scheme = externalScheme(r)
	}
	if u.Host == "" {
		u.Host = r.Host
	}
	return u.String()
}

func slugFromToken(tokenStr string, mw *auth.Middleware) string {
	claims, err := mw.ValidateHS256Public(tokenStr)
	if err != nil {
		return ""
	}
	uid := claimStr(claims, "user_id", "sub")
	return pod.SafeUserSlug(uid)
}

func claimStr(c jwt.MapClaims, keys ...string) string {
	for _, k := range keys {
		if v, ok := c[k]; ok {
			if s, ok := v.(string); ok && s != "" {
				return s
			}
		}
	}
	return ""
}

func cookieVal(r *http.Request, name string) string {
	if c, err := r.Cookie(name); err == nil {
		return c.Value
	}
	return ""
}

func writeJSON(w http.ResponseWriter, status int, v any) {
	w.Header().Set("Content-Type", "application/json")
	w.WriteHeader(status)
	_ = json.NewEncoder(w).Encode(v)
}

func randomHex(n int) string {
	b := make([]byte, n)
	if _, err := rand.Read(b); err != nil {
		return strings.Repeat("0", n*2)
	}
	return hex.EncodeToString(b)
}
