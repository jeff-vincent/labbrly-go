// Package redis provides a thin wrapper around go-redis used by the compute service.
package redis

import (
	"context"
	"encoding/json"
	"fmt"
	"os"
	"time"

	goredis "github.com/redis/go-redis/v9"
)

// Client wraps a go-redis client.
type Client struct {
	rdb *goredis.Client
}

// New returns a Client connected to the Redis URL from the environment
// (REDIS_URL), defaulting to redis://redis:6379.
func New() *Client {
	url := os.Getenv("REDIS_URL")
	if url == "" {
		url = "redis://redis:6379"
	}
	opt, err := goredis.ParseURL(url)
	if err != nil {
		// Fall back to default if the URL is malformed.
		opt = &goredis.Options{Addr: "redis:6379"}
	}
	return &Client{rdb: goredis.NewClient(opt)}
}

// PodRecord is the value stored in Redis for a running user pod.
type PodRecord struct {
	UserID    string `json:"user_id"`
	PodName   string `json:"pod_name"`
	Namespace string `json:"namespace"`
	StartedAt string `json:"started_at"`
	ExpiresAt string `json:"expires_at"`
}

// WritePodRecord stores a pod record with the given TTL.
func (c *Client) WritePodRecord(ctx context.Context, namespace, podName, userID string, ttl time.Duration) error {
	now := time.Now().UTC()
	rec := PodRecord{
		UserID:    userID,
		PodName:   podName,
		Namespace: namespace,
		StartedAt: now.Format(time.RFC3339),
		ExpiresAt: now.Add(ttl).Format(time.RFC3339),
	}
	b, err := json.Marshal(rec)
	if err != nil {
		return err
	}
	key := fmt.Sprintf("pod:%s:%s", namespace, podName)
	return c.rdb.SetEx(ctx, key, string(b), ttl).Err()
}

// Close closes the underlying Redis connection.
func (c *Client) Close() error {
	return c.rdb.Close()
}
