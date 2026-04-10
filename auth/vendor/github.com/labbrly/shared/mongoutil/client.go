// Package mongoutil provides a MongoDB client factory for labbrly services.
// Connection credentials are read from MONGO_HOST, MONGO_USER, MONGO_PASSWORD.
package mongoutil

import (
	"context"
	"fmt"
	"os"

	"go.mongodb.org/mongo-driver/bson/primitive"
	"go.mongodb.org/mongo-driver/mongo"
	"go.mongodb.org/mongo-driver/mongo/options"
)

// Connect returns a MongoDB client connected to the Atlas cluster specified
// by MONGO_HOST, MONGO_USER, and MONGO_PASSWORD environment variables.
func Connect(ctx context.Context) (*mongo.Client, error) {
	host := os.Getenv("MONGO_HOST")
	user := os.Getenv("MONGO_USER")
	pass := os.Getenv("MONGO_PASSWORD")
	uri := fmt.Sprintf("mongodb+srv://%s:%s@%s", user, pass, host)
	return mongo.Connect(ctx, options.Client().ApplyURI(uri))
}

// StringifyID converts the "_id" field of a bson.M document from
// primitive.ObjectID to its hex string, then returns the doc as map[string]any.
// All other fields are passed through unchanged.
func StringifyID(doc map[string]any) map[string]any {
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
