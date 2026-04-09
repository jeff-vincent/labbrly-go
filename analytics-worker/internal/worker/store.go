package worker

import (
	"context"
	"encoding/json"
	"log/slog"

	goredis "github.com/redis/go-redis/v9"
	"go.mongodb.org/mongo-driver/bson"
	"go.mongodb.org/mongo-driver/bson/primitive"
	"go.mongodb.org/mongo-driver/mongo"
)

// Store holds the connections needed by the analytics worker.
type Store struct {
	rdb      *goredis.Client
	orgs     *mongo.Collection
	labs     *mongo.Collection
	analytics *mongo.Collection
}

// New returns a Store.
func New(rdb *goredis.Client, orgs, labs, analytics *mongo.Collection) *Store {
	return &Store{rdb: rdb, orgs: orgs, labs: labs, analytics: analytics}
}

func userListKey(userID string) string { return "analytics:events:" + userID }
func usersIndexKey() string            { return "analytics:active_users" }

// DrainUserEvents atomically reads and removes all entries for a user from Redis.
func (s *Store) DrainUserEvents(ctx context.Context, userID string) ([]map[string]any, error) {
	key := userListKey(userID)
	pipe := s.rdb.TxPipeline()
	lrange := pipe.LRange(ctx, key, 0, -1)
	pipe.Del(ctx, key)
	pipe.SRem(ctx, usersIndexKey(), userID)
	if _, err := pipe.Exec(ctx); err != nil {
		return nil, err
	}

	raw := lrange.Val()
	items := make([]map[string]any, 0, len(raw))
	for _, s := range raw {
		var m map[string]any
		if err := json.Unmarshal([]byte(s), &m); err != nil {
			continue
		}
		items = append(items, m)
	}
	return items, nil
}

// FindOrgByUserID looks up an org whose users map contains the given userID.
func (s *Store) FindOrgByUserID(ctx context.Context, userID string) (map[string]any, error) {
	var doc bson.M
	err := s.orgs.FindOne(ctx, bson.M{"users." + userID: bson.M{"$exists": true}}).Decode(&doc)
	if err == mongo.ErrNoDocuments {
		return nil, nil
	}
	return doc, err
}

// FindOrgByID looks up an org by org_id string field.
func (s *Store) FindOrgByID(ctx context.Context, orgID string) (map[string]any, error) {
	var doc bson.M
	err := s.orgs.FindOne(ctx, bson.M{"org_id": orgID}).Decode(&doc)
	if err == mongo.ErrNoDocuments {
		return nil, nil
	}
	return doc, err
}

// FindLab returns the lab document for the given labID hex, or nil if not found.
func (s *Store) FindLab(ctx context.Context, labID string) (map[string]any, error) {
	oid, err := primitive.ObjectIDFromHex(labID)
	if err != nil {
		return nil, nil
	}
	var doc bson.M
	err = s.labs.FindOne(ctx, bson.M{"_id": oid}).Decode(&doc)
	if err == mongo.ErrNoDocuments {
		return nil, nil
	}
	return doc, err
}

// WriteSummary inserts a summary document into the analytics collection.
func (s *Store) WriteSummary(ctx context.Context, summary map[string]any) {
	if _, err := s.analytics.InsertOne(ctx, summary); err != nil {
		slog.Error("failed to write summary to analytics DB", "err", err)
	}
}
