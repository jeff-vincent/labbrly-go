// Package tokens handles MongoDB lookups and JWT signing for the auth service.
package tokens

import (
	"context"
	"errors"
	"fmt"
	"os"
	"time"

	"github.com/golang-jwt/jwt/v5"
	"go.mongodb.org/mongo-driver/bson"
	"go.mongodb.org/mongo-driver/bson/primitive"
	"go.mongodb.org/mongo-driver/mongo"
)

const (
	demoOrgID = "org_oubjxoFHhKvKm4mq"
	demoLabID = "68c717ba15aa8a909ced534d"
	tokenTTL  = 30 * time.Minute
)

// Store provides JWT signing and MongoDB lookups.
type Store struct {
	orgs   *mongo.Collection
	labs   *mongo.Collection
	secret []byte
}

// New returns a Store using the given collections and LAB_THINGY_JWT_SECRET.
func New(orgs, labs *mongo.Collection) (*Store, error) {
	secret := os.Getenv("LAB_THINGY_JWT_SECRET")
	if secret == "" {
		return nil, errors.New("LAB_THINGY_JWT_SECRET is required")
	}
	return &Store{orgs: orgs, labs: labs, secret: []byte(secret)}, nil
}

// sign creates a signed HS256 JWT from the given claims map.
func (s *Store) sign(claims jwt.MapClaims) (string, error) {
	return jwt.NewWithClaims(jwt.SigningMethodHS256, claims).SignedString(s.secret)
}

func (s *Store) baseClaims() jwt.MapClaims {
	now := time.Now().UTC()
	return jwt.MapClaims{
		"iat": now.Unix(),
		"exp": now.Add(tokenTTL).Unix(),
	}
}

// DemoToken returns a signed token for the demo org and a random user ID.
func (s *Store) DemoToken() (string, error) {
	c := s.baseClaims()
	c["org_id"] = demoOrgID
	c["user_id"] = RandomHex(16)
	c["lab_id"] = demoLabID
	return s.sign(c)
}

// EmbedToken validates an origin and issues a token for the given lab.
// Returns (token, nil) on success; ("", ErrForbidden) if origin not allowed.
func (s *Store) EmbedToken(ctx context.Context, labID, origin, userID string) (string, error) {
	oid, err := primitive.ObjectIDFromHex(labID)
	if err != nil {
		return "", fmt.Errorf("invalid lab_id: %w", err)
	}
	var lab struct {
		OrgID string `bson:"org_id"`
	}
	if err := s.labs.FindOne(ctx, bson.M{"_id": oid}).Decode(&lab); err == mongo.ErrNoDocuments {
		return "", errors.New("lab not found")
	} else if err != nil {
		return "", err
	}

	var org struct {
		OrgID          string   `bson:"org_id"`
		AllowedOrigins []string `bson:"allowed_origins"`
	}
	if err := s.orgs.FindOne(ctx, bson.M{"org_id": lab.OrgID}).Decode(&org); err == mongo.ErrNoDocuments {
		return "", errors.New("org not found")
	} else if err != nil {
		return "", err
	}

	allowed := false
	for _, o := range org.AllowedOrigins {
		if o == origin {
			allowed = true
			break
		}
	}
	if !allowed {
		return "", errors.New("origin not allowed")
	}

	if userID == "" {
		userID = RandomHex(16)
	}
	c := s.baseClaims()
	c["org_id"] = org.OrgID
	c["user_id"] = userID
	c["lab_id"] = labID
	return s.sign(c)
}

// APIKeyToken validates an API key and issues a token for the org.
func (s *Store) APIKeyToken(ctx context.Context, apiKey, labID, userID string) (string, error) {
	var org struct {
		OrgID string `bson:"org_id"`
	}
	err := s.orgs.FindOne(ctx, bson.M{"api_keys": bson.M{"$in": []string{apiKey}}}).Decode(&org)
	if err == mongo.ErrNoDocuments {
		return "", errors.New("invalid API key")
	}
	if err != nil {
		return "", err
	}
	if userID == "" {
		userID = RandomHex(16)
	}
	c := s.baseClaims()
	c["org_id"] = org.OrgID
	c["user_id"] = userID
	c["lab_id"] = labID
	return s.sign(c)
}
