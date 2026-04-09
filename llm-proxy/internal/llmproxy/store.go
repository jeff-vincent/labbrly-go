package llmproxy

import (
	"context"
	"fmt"

	"go.mongodb.org/mongo-driver/bson"
	"go.mongodb.org/mongo-driver/bson/primitive"
	"go.mongodb.org/mongo-driver/mongo"
)

// Store wraps the MongoDB collections needed by the llm-proxy.
type Store struct {
	orgs *mongo.Collection
	labs *mongo.Collection
	rag  *mongo.Collection
}

// New returns a Store.
func New(orgs, labs, rag *mongo.Collection) *Store {
	return &Store{orgs: orgs, labs: labs, rag: rag}
}

// GetOrg fetches the org document by org_id.
func (s *Store) GetOrg(ctx context.Context, orgID string) (map[string]any, error) {
	var doc bson.M
	if err := s.orgs.FindOne(ctx, bson.M{"org_id": orgID}).Decode(&doc); err == mongo.ErrNoDocuments {
		return nil, nil
	} else if err != nil {
		return nil, err
	}
	return doc, nil
}

// GetLab fetches the lab document by ObjectID hex.
func (s *Store) GetLab(ctx context.Context, labID string) (map[string]any, error) {
	oid, err := primitive.ObjectIDFromHex(labID)
	if err != nil {
		return nil, fmt.Errorf("invalid lab_id")
	}
	var doc bson.M
	if err := s.labs.FindOne(ctx, bson.M{"_id": oid}).Decode(&doc); err == mongo.ErrNoDocuments {
		return nil, nil
	} else if err != nil {
		return nil, err
	}
	return doc, nil
}

// RAGResult is a single document returned from Atlas vector search.
type RAGResult struct {
	Content   string  `bson:"content"`
	PageURL   string  `bson:"page_url"`
	PageTitle string  `bson:"page_title"`
	Score     float64 `bson:"score"`
}

// VectorSearch performs an Atlas $vectorSearch pipeline on the rag collection.
// Returns the top 3 content strings, or nil if none found.
func (s *Store) VectorSearch(ctx context.Context, orgID, labID string, embedding []float64) ([]string, error) {
	pipeline := mongo.Pipeline{
		{
			{Key: "$vectorSearch", Value: bson.D{
				{Key: "index", Value: "embedding_index"},
				{Key: "path", Value: "embedding"},
				{Key: "queryVector", Value: embedding},
				{Key: "numCandidates", Value: 200},
				{Key: "limit", Value: 5},
				{Key: "filter", Value: bson.D{
					{Key: "org_id", Value: orgID},
					{Key: "lab_id", Value: labID},
				}},
			}},
		},
		{
			{Key: "$project", Value: bson.D{
				{Key: "_id", Value: 0},
				{Key: "content", Value: 1},
				{Key: "page_url", Value: 1},
				{Key: "page_title", Value: 1},
				{Key: "score", Value: bson.D{{Key: "$meta", Value: "vectorSearchScore"}}},
			}},
		},
	}

	cursor, err := s.rag.Aggregate(ctx, pipeline)
	if err != nil {
		return nil, err
	}
	defer cursor.Close(ctx)

	var results []RAGResult
	if err := cursor.All(ctx, &results); err != nil {
		return nil, err
	}

	top := results
	if len(top) > 3 {
		top = top[:3]
	}
	out := make([]string, 0, len(top))
	for _, r := range top {
		if r.Content != "" {
			out = append(out, r.Content)
		}
	}
	return out, nil
}
