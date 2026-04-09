package analytics

import (
	"context"
	"encoding/json"
	"fmt"
	"os"
	"time"

	goredis "github.com/redis/go-redis/v9"
	"go.mongodb.org/mongo-driver/bson"
	"go.mongodb.org/mongo-driver/mongo"
)

// Store holds the Redis client and MongoDB collection for analytics.
type Store struct {
	rdb    *goredis.Client
	events *mongo.Collection
}

// New returns a Store.
func New(rdb *goredis.Client, events *mongo.Collection) *Store {
	return &Store{rdb: rdb, events: events}
}

func userListKey(userID string) string  { return "analytics:events:" + userID }
func usersIndexKey() string             { return "analytics:active_users" }

// listTTL returns the per-user list TTL (default 7 days).
func listTTL() time.Duration {
	if s := os.Getenv("ANALYTICS_LIST_TTL_SEC"); s != "" {
		var sec int
		fmt.Sscanf(s, "%d", &sec)
		if sec > 0 {
			return time.Duration(sec) * time.Second
		}
	}
	return 7 * 24 * time.Hour
}

// PushEntry serializes entry and appends it to the per-user Redis list.
func (s *Store) PushEntry(ctx context.Context, userID string, entry map[string]any) error {
	raw, err := json.Marshal(entry)
	if err != nil {
		return err
	}
	userKey := userListKey(userID)
	pipe := s.rdb.Pipeline()
	pipe.RPush(ctx, userKey, raw)
	pipe.SAdd(ctx, usersIndexKey(), userID)
	pipe.Expire(ctx, userKey, listTTL())
	_, err = pipe.Exec(ctx)
	return err
}

// InsertEvent writes a single event directly to MongoDB.
func (s *Store) InsertEvent(ctx context.Context, doc bson.M) error {
	_, err := s.events.InsertOne(ctx, doc)
	return err
}

// ListEventsByOrg returns all events for an org, stripping _id.
func (s *Store) ListEventsByOrg(ctx context.Context, orgID string) ([]map[string]any, error) {
	cursor, err := s.events.Find(ctx, bson.M{"org_id": orgID})
	if err != nil {
		return nil, err
	}
	defer cursor.Close(ctx)
	var results []map[string]any
	for cursor.Next(ctx) {
		var doc bson.M
		if err := cursor.Decode(&doc); err != nil {
			continue
		}
		delete(doc, "_id")
		m := make(map[string]any, len(doc))
		for k, v := range doc {
			m[k] = v
		}
		results = append(results, m)
	}
	return results, cursor.Err()
}
