// Package mongo provides a billing-specific MongoDB wrapper for the billing service.
package mongo

import (
	"context"
	"fmt"

	"go.mongodb.org/mongo-driver/bson"
	"go.mongodb.org/mongo-driver/mongo"
	"github.com/labbrly/shared/mongoutil"
)

// Org is the subset of an org document needed for billing.
type Org struct {
	StripeCustomerID string `bson:"stripe_customer_id"`
}

// Client wraps the MongoDB collection used for org lookups.
type Client struct {
	col *mongo.Collection
	raw *mongo.Client
}

// New connects to MongoDB using the shared factory (reads MONGO_HOST/USER/PASSWORD)
// and returns a Client pointed at the orgs collection.
func New(ctx context.Context) (*Client, error) {
	raw, err := mongoutil.Connect(ctx)
	if err != nil {
		return nil, fmt.Errorf("mongo connect: %w", err)
	}
	col := raw.Database("orgs").Collection("orgs")
	return &Client{col: col, raw: raw}, nil
}

// FindOrgByNamespace returns the org document for the given namespace,
// or (nil, nil) if no document matches.
func (c *Client) FindOrgByNamespace(ctx context.Context, namespace string) (*Org, error) {
	var org Org
	err := c.col.FindOne(ctx, bson.M{"namespace": namespace}).Decode(&org)
	if err == mongo.ErrNoDocuments {
		return nil, nil
	}
	if err != nil {
		return nil, fmt.Errorf("mongo find namespace %s: %w", namespace, err)
	}
	return &org, nil
}

// Disconnect closes the underlying MongoDB connection.
func (c *Client) Disconnect(ctx context.Context) error {
	return c.raw.Disconnect(ctx)
}
