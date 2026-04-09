// Package labs provides MongoDB storage operations for lab definitions.
package labs

import (
	"context"
	"fmt"

	"go.mongodb.org/mongo-driver/bson"
	"go.mongodb.org/mongo-driver/bson/primitive"
	"go.mongodb.org/mongo-driver/mongo"
)

// Store wraps the labs MongoDB collection.
type Store struct {
	col *mongo.Collection
}

// New returns a Store for the given collection.
func New(col *mongo.Collection) *Store {
	return &Store{col: col}
}

// ListByOrg returns all labs belonging to an org as serializable maps.
func (s *Store) ListByOrg(ctx context.Context, orgID string) ([]map[string]any, error) {
	cursor, err := s.col.Find(ctx, bson.M{"org_id": orgID})
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
		results = append(results, stringify(doc))
	}
	return results, cursor.Err()
}

// Get returns a single lab by ID, scoped to orgID.
func (s *Store) Get(ctx context.Context, labID, orgID string) (map[string]any, error) {
	oid, err := primitive.ObjectIDFromHex(labID)
	if err != nil {
		return nil, fmt.Errorf("invalid lab_id")
	}
	var doc bson.M
	err = s.col.FindOne(ctx, bson.M{"_id": oid, "org_id": orgID}).Decode(&doc)
	if err == mongo.ErrNoDocuments {
		return nil, nil
	}
	return stringify(doc), err
}

// Create inserts a new lab and returns the created document.
func (s *Store) Create(ctx context.Context, data bson.M) (map[string]any, error) {
	res, err := s.col.InsertOne(ctx, data)
	if err != nil {
		return nil, err
	}
	var doc bson.M
	if err := s.col.FindOne(ctx, bson.M{"_id": res.InsertedID}).Decode(&doc); err != nil {
		return nil, err
	}
	return stringify(doc), nil
}

// Update applies $set to the lab identified by labID (unscoped to org, caller ensures authz).
func (s *Store) Update(ctx context.Context, labID string, update bson.M) (map[string]any, error) {
	oid, err := primitive.ObjectIDFromHex(labID)
	if err != nil {
		return nil, fmt.Errorf("invalid lab_id")
	}
	res, err := s.col.UpdateOne(ctx, bson.M{"_id": oid}, bson.M{"$set": update})
	if err != nil {
		return nil, err
	}
	if res.MatchedCount == 0 {
		return nil, nil
	}
	var doc bson.M
	if err := s.col.FindOne(ctx, bson.M{"_id": oid}).Decode(&doc); err != nil {
		return nil, err
	}
	return stringify(doc), nil
}

// Delete removes a lab by ID scoped to orgID. Returns false if not found.
func (s *Store) Delete(ctx context.Context, labID, orgID string) (bool, error) {
	oid, err := primitive.ObjectIDFromHex(labID)
	if err != nil {
		return false, fmt.Errorf("invalid lab_id")
	}
	res, err := s.col.DeleteOne(ctx, bson.M{"_id": oid, "org_id": orgID})
	if err != nil {
		return false, err
	}
	return res.DeletedCount > 0, nil
}

// GetRawRAGURLs returns the rag_urls field for a lab (for triggering ingestion).
func (s *Store) GetRawRAGURLs(ctx context.Context, labID string) ([]string, error) {
	oid, err := primitive.ObjectIDFromHex(labID)
	if err != nil {
		return nil, nil
	}
	var doc struct {
		RAGURLs []string `bson:"rag_urls"`
	}
	if err := s.col.FindOne(ctx, bson.M{"_id": oid}).Decode(&doc); err != nil {
		return nil, nil
	}
	return doc.RAGURLs, nil
}

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
