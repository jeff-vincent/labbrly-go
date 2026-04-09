package orgs

import (
	"bytes"
	"context"
	"encoding/json"
	"fmt"
	"io"
	"log/slog"
	"net/http"
	"os"
	"sync"
	"time"
)

// Auth0Client handles Auth0 Management API calls.
type Auth0Client struct {
	domain       string
	clientID     string
	clientSecret string

	mu         sync.Mutex
	mgmtToken  string
	tokenExpiry time.Time
}

// NewAuth0Client reads AUTH0_DOMAIN, AUTH0_CLIENT_ID, AUTH0_CLIENT_SECRET from env.
func NewAuth0Client() *Auth0Client {
	return &Auth0Client{
		domain:       os.Getenv("AUTH0_DOMAIN"),
		clientID:     os.Getenv("AUTH0_CLIENT_ID"),
		clientSecret: os.Getenv("AUTH0_CLIENT_SECRET"),
	}
}

// mgmtAPIURL returns the management API base URL.
func (c *Auth0Client) mgmtAPIURL() string {
	return fmt.Sprintf("https://%s/api/v2", c.domain)
}

// token returns a valid management API token, refreshing if expired.
func (c *Auth0Client) token(ctx context.Context) (string, error) {
	c.mu.Lock()
	defer c.mu.Unlock()
	if c.mgmtToken != "" && time.Now().Before(c.tokenExpiry) {
		return c.mgmtToken, nil
	}

	body, _ := json.Marshal(map[string]string{
		"client_id":     c.clientID,
		"client_secret": c.clientSecret,
		"audience":      fmt.Sprintf("https://%s/api/v2/", c.domain),
		"grant_type":    "client_credentials",
	})
	req, _ := http.NewRequestWithContext(ctx, http.MethodPost,
		fmt.Sprintf("https://%s/oauth/token", c.domain), bytes.NewReader(body))
	req.Header.Set("Content-Type", "application/json")

	resp, err := http.DefaultClient.Do(req)
	if err != nil {
		return "", fmt.Errorf("auth0 token request: %w", err)
	}
	defer resp.Body.Close()
	if resp.StatusCode != http.StatusOK {
		raw, _ := io.ReadAll(resp.Body)
		return "", fmt.Errorf("auth0 token: status %d: %s", resp.StatusCode, raw)
	}

	var result struct {
		AccessToken string `json:"access_token"`
		ExpiresIn   int    `json:"expires_in"`
	}
	if err := json.NewDecoder(resp.Body).Decode(&result); err != nil {
		return "", fmt.Errorf("auth0 token decode: %w", err)
	}
	c.mgmtToken = result.AccessToken
	c.tokenExpiry = time.Now().Add(time.Duration(result.ExpiresIn-60) * time.Second)
	return c.mgmtToken, nil
}

func (c *Auth0Client) doPost(ctx context.Context, path string, payload any) (map[string]any, error) {
	return c.do(ctx, http.MethodPost, path, payload)
}

func (c *Auth0Client) do(ctx context.Context, method, path string, payload any) (map[string]any, error) {
	tok, err := c.token(ctx)
	if err != nil {
		return nil, err
	}
	var bodyReader io.Reader
	if payload != nil {
		b, _ := json.Marshal(payload)
		bodyReader = bytes.NewReader(b)
	}
	req, _ := http.NewRequestWithContext(ctx, method, c.mgmtAPIURL()+path, bodyReader)
	req.Header.Set("Authorization", "Bearer "+tok)
	req.Header.Set("Content-Type", "application/json")

	resp, err := http.DefaultClient.Do(req)
	if err != nil {
		return nil, fmt.Errorf("auth0 %s %s: %w", method, path, err)
	}
	defer resp.Body.Close()
	raw, _ := io.ReadAll(resp.Body)
	if resp.StatusCode >= 400 {
		return nil, fmt.Errorf("auth0 %s %s: status %d: %s", method, path, resp.StatusCode, raw)
	}
	var result map[string]any
	json.Unmarshal(raw, &result)
	return result, nil
}

// CreateOrganization creates an Auth0 organization and returns the org map.
func (c *Auth0Client) CreateOrganization(ctx context.Context, name, displayName string) (map[string]any, error) {
	return c.doPost(ctx, "/organizations", map[string]string{
		"name":         name,
		"display_name": displayName,
	})
}

// AddConnection adds a connection to an Auth0 organization.
func (c *Auth0Client) AddConnection(ctx context.Context, orgID, connectionID string) error {
	_, err := c.doPost(ctx, fmt.Sprintf("/organizations/%s/enabled_connections", orgID), map[string]any{
		"connection_id":             connectionID,
		"assign_membership_on_login": false,
	})
	return err
}

// CreateUser creates an Auth0 user and returns the user_id.
func (c *Auth0Client) CreateUser(ctx context.Context, email, password, connection string) (string, error) {
	result, err := c.doPost(ctx, "/users", map[string]string{
		"email":      email,
		"password":   password,
		"connection": connection,
	})
	if err != nil {
		return "", err
	}
	userID, _ := result["user_id"].(string)
	slog.Info("auth0 user created", "email", email, "user_id", userID)
	return userID, nil
}

// AddUserToOrganization adds a user to an Auth0 organization.
func (c *Auth0Client) AddUserToOrganization(ctx context.Context, orgID, userID string) error {
	_, err := c.doPost(ctx, fmt.Sprintf("/organizations/%s/members", orgID), map[string]any{
		"members": []string{userID},
	})
	return err
}

// CreateAndAddUser creates a user and adds them to the organization.
func (c *Auth0Client) CreateAndAddUser(ctx context.Context, orgID, email, password, connection string) error {
	userID, err := c.CreateUser(ctx, email, password, connection)
	if err != nil {
		return err
	}
	return c.AddUserToOrganization(ctx, orgID, userID)
}
