// Package redis provides a billing-specific Redis wrapper for the billing service.
package redis

import (
	"context"
	"fmt"
	"time"

	goredis "github.com/redis/go-redis/v9"
	"github.com/labbrly/shared/redisutil"
)

// Client wraps a go-redis client with billing-specific operations.
type Client struct {
	rdb *goredis.Client
}

// New returns a Client using the shared Redis factory (reads REDIS_URL).
func New() *Client {
	return &Client{rdb: redisutil.Connect()}
}

// Scan returns one page of keys matching pattern starting at cursor.
func (c *Client) Scan(ctx context.Context, cursor uint64, pattern string, count int64) (keys []string, next uint64, err error) {
	return c.rdb.Scan(ctx, cursor, pattern, count).Result()
}

// MGet fetches the values for the given keys in a single pipeline round-trip.
// Missing keys are returned as empty strings.
func (c *Client) MGet(ctx context.Context, keys []string) ([]string, error) {
	if len(keys) == 0 {
		return nil, nil
	}
	pipe := c.rdb.Pipeline()
	cmds := make([]*goredis.StringCmd, len(keys))
	for i, k := range keys {
		cmds[i] = pipe.Get(ctx, k)
	}
	if _, err := pipe.Exec(ctx); err != nil && err != goredis.Nil {
		return nil, err
	}
	out := make([]string, len(keys))
	for i, cmd := range cmds {
		v, err := cmd.Result()
		if err == nil {
			out[i] = v
		}
	}
	return out, nil
}

// SetBilled records that a billing block has been processed for an org.
// Uses a plain SET (not NX) because Stripe-side idempotency via the event
// identifier is the primary dedup mechanism; this is a best-effort audit trail.
func (c *Client) SetBilled(ctx context.Context, namespace string, blockEnd int64, ttl time.Duration) error {
	key := fmt.Sprintf("billed:%s:%d", namespace, blockEnd)
	return c.rdb.Set(ctx, key, "1", ttl).Err()
}

// Close closes the underlying Redis connection.
func (c *Client) Close() error {
	return c.rdb.Close()
}
