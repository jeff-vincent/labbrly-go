package orgs

import (
	"context"
	"crypto/rand"
	"encoding/hex"
	"fmt"
	"strings"
	"time"

	"go.mongodb.org/mongo-driver/bson"
	"go.mongodb.org/mongo-driver/bson/primitive"
	"go.mongodb.org/mongo-driver/mongo"
)

// Store wraps the orgs MongoDB collection.
type Store struct {
	col            *mongo.Collection
	computeBaseURL string
	namespaceKey   string
}

// New returns a Store.
func New(col *mongo.Collection, computeBaseURL, namespaceKey string) *Store {
	return &Store{col: col, computeBaseURL: computeBaseURL, namespaceKey: namespaceKey}
}

func generateAPIKey() string {
	b := make([]byte, 16)
	rand.Read(b)
	return "sk_live_" + hex.EncodeToString(b)
}

// GetByOrgID returns the org for the given org_id, sanitized.
func (s *Store) GetByOrgID(ctx context.Context, orgID string) (map[string]any, error) {
	var doc bson.M
	if err := s.col.FindOne(ctx, bson.M{"org_id": orgID}).Decode(&doc); err == mongo.ErrNoDocuments {
		return nil, nil
	} else if err != nil {
		return nil, err
	}
	return sanitize(stringify(doc)), nil
}

// CheckNameAvailable returns true if no org uses the given organization_name.
func (s *Store) CheckNameAvailable(ctx context.Context, name string) (bool, error) {
	count, err := s.col.CountDocuments(ctx, bson.M{"organization_name": name})
	return count == 0, err
}

// CreateOrgRecord inserts a new org and returns the created doc (unsanitized for internal use).
func (s *Store) CreateOrgRecord(ctx context.Context, base bson.M) (map[string]any, error) {
	base["api_keys"] = []string{generateAPIKey()}
	base["images"] = []string{}
	now := time.Now().UTC()
	base["created_at"] = now
	base["updated_at"] = now
	res, err := s.col.InsertOne(ctx, base)
	if err != nil {
		return nil, err
	}
	var doc bson.M
	if err := s.col.FindOne(ctx, bson.M{"_id": res.InsertedID}).Decode(&doc); err != nil {
		return nil, err
	}
	return stringify(doc), nil
}

// UpdateOrg applies $set to the org and returns the sanitized result.
func (s *Store) UpdateOrg(ctx context.Context, orgID string, data bson.M) (map[string]any, error) {
	delete(data, "_id")
	data["updated_at"] = time.Now().UTC()
	res, err := s.col.UpdateOne(ctx, bson.M{"org_id": orgID}, bson.M{"$set": data})
	if err != nil {
		return nil, err
	}
	if res.MatchedCount == 0 {
		return nil, nil
	}
	var doc bson.M
	if err := s.col.FindOne(ctx, bson.M{"org_id": orgID}).Decode(&doc); err != nil {
		return nil, err
	}
	return sanitize(stringify(doc)), nil
}

// AddUserEvent appends a timestamped event to the user's nested map in the org doc.
func (s *Store) AddUserEvent(ctx context.Context, orgID, userID string, payload map[string]any) error {
	var org bson.M
	if err := s.col.FindOne(ctx, bson.M{"org_id": orgID}).Decode(&org); err == mongo.ErrNoDocuments {
		return fmt.Errorf("org not found")
	} else if err != nil {
		return err
	}

	users, _ := org["users"].(bson.M)
	if users == nil {
		users = bson.M{}
	}
	userEvents, _ := users[userID].(bson.M)
	if userEvents == nil {
		userEvents = bson.M{}
	}
	entryKey := time.Now().UTC().Format(time.RFC3339Nano)
	event := bson.M{"user_id": userID}
	for k, v := range payload {
		event[k] = v
	}
	userEvents[entryKey] = event
	users[userID] = userEvents

	_, err := s.col.UpdateOne(ctx, bson.M{"org_id": orgID}, bson.M{"$set": bson.M{"users": users}})
	return err
}

// DeleteByOrgID removes the org document. Returns false if not found.
func (s *Store) DeleteByOrgID(ctx context.Context, orgID string) (bool, error) {
	// org_id is a string field (Auth0 ID), not a MongoDB ObjectID.
	res, err := s.col.DeleteOne(ctx, bson.M{"org_id": orgID})
	if err != nil {
		return false, err
	}
	return res.DeletedCount > 0, nil
}

// ImageAvailable returns true if image_name is not in the org's images array.
func (s *Store) ImageAvailable(ctx context.Context, orgID, imageName string) (bool, error) {
	var org bson.M
	if err := s.col.FindOne(ctx, bson.M{"org_id": orgID}).Decode(&org); err != nil {
		return false, err
	}
	images, _ := org["images"].(bson.A)
	for _, img := range images {
		if s, ok := img.(string); ok && s == imageName {
			return false, nil
		}
	}
	return true, nil
}

// AddImage appends image_name to the org's images array (idempotent).
func (s *Store) AddImage(ctx context.Context, orgID, imageName string) error {
	var org bson.M
	if err := s.col.FindOne(ctx, bson.M{"org_id": orgID}).Decode(&org); err != nil {
		return err
	}
	existing, _ := org["images"].(bson.A)
	for _, img := range existing {
		if s, ok := img.(string); ok && s == imageName {
			return nil // already present
		}
	}
	newList := make([]string, 0, len(existing)+1)
	for _, img := range existing {
		if s, ok := img.(string); ok {
			newList = append(newList, s)
		}
	}
	newList = append(newList, imageName)
	_, err := s.col.UpdateOne(ctx, bson.M{"org_id": orgID}, bson.M{"$set": bson.M{"images": newList}})
	return err
}

// NormalizeImageName lowercases and appends a org-scoped suffix.
func NormalizeImageName(raw, orgID string) string {
	suffix := strings.ToLower(strings.Replace(orgID, "org_", "", 1))
	return strings.ToLower(strings.TrimSpace(raw)) + "-" + suffix
}

// CreateNamespace calls the compute service to provision a K8s namespace for the org.
func (s *Store) CreateNamespace(ctx context.Context, orgID string) error {
	return createNamespaceHTTP(ctx, s.computeBaseURL, orgID, s.namespaceKey)
}

// stringify converts a bson.M to map[string]any, turning ObjectIDs into hex strings.
func stringify(doc bson.M) map[string]any {
	out := make(map[string]any, len(doc))
	for k, v := range doc {
		if k == "_id" {
			if oid, ok := v.(primitive.ObjectID); ok {
				out["_id"] = oid.Hex()
				continue
			}
		}
		out[k] = v
	}
	return out
}

// sanitize removes/masks sensitive fields before returning org data to callers.
func sanitize(doc map[string]any) map[string]any {
	out := make(map[string]any, len(doc))
	for k, v := range doc {
		out[k] = v
	}
	delete(out, "password")

	if llmCfg, ok := out["llm_configs"].(map[string]any); ok {
		masked := make(map[string]any, len(llmCfg))
		for k, v := range llmCfg {
			masked[k] = v
		}
		if masked["api_key"] != nil && masked["api_key"] != "" {
			masked["api_key"] = "***"
		}
		out["llm_configs"] = masked
	}

	if integrations, ok := out["integrations"].(map[string]any); ok {
		redacted := make(map[string]any, len(integrations))
		for k, v := range integrations {
			if s, ok := v.(string); ok && isSensitiveKey(k) {
				_ = s
				redacted[k] = "***"
			} else {
				redacted[k] = v
			}
		}
		out["integrations"] = redacted
	}
	return out
}

func isSensitiveKey(k string) bool {
	kl := strings.ToLower(k)
	for _, word := range []string{"token", "secret", "key", "dsn", "webhook"} {
		if strings.Contains(kl, word) {
			return true
		}
	}
	return false
}
