// Package redisutil provides a Redis client factory for labbrly services.
// The connection URL is read from the REDIS_URL environment variable,
// defaulting to redis://redis:6379.
package redisutil

import (
	"os"

	goredis "github.com/redis/go-redis/v9"
)

// Connect returns a go-redis client using the REDIS_URL environment variable.
// Returns a client with the default address (redis:6379) if REDIS_URL is
// absent or malformed.
func Connect() *goredis.Client {
	url := os.Getenv("REDIS_URL")
	if url == "" {
		url = "redis://redis:6379"
	}
	opt, err := goredis.ParseURL(url)
	if err != nil {
		opt = &goredis.Options{Addr: "redis:6379"}
	}
	return goredis.NewClient(opt)
}
