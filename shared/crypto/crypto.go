// Package crypto provides Fernet-compatible symmetric encryption for labbrly
// services. It is wire-compatible with Python's cryptography.fernet.Fernet,
// allowing Go services to decrypt values stored by Python services and vice
// versa. The encryption key is read from the APP_SECRET_KEY environment
// variable.
package crypto

import (
	"errors"
	"os"
	"time"

	gofernet "github.com/fernet/fernet-go"
)

// Encryptor encrypts and decrypts strings using a Fernet key.
type Encryptor struct {
	key *gofernet.Key
}

// New returns an Encryptor using the APP_SECRET_KEY environment variable.
func New() (*Encryptor, error) {
	raw := os.Getenv("APP_SECRET_KEY")
	if raw == "" {
		return nil, errors.New("APP_SECRET_KEY is not set")
	}
	k, err := gofernet.DecodeKey(raw)
	if err != nil {
		return nil, err
	}
	return &Encryptor{key: k}, nil
}

// Encrypt returns a Fernet-encrypted base64url token for the given plaintext.
func (e *Encryptor) Encrypt(plaintext string) (string, error) {
	tok, err := gofernet.EncryptAndSign([]byte(plaintext), e.key)
	if err != nil {
		return "", err
	}
	return string(tok), nil
}

// Decrypt decrypts a Fernet token and returns the original plaintext.
// TTL is not enforced (stored secrets may be arbitrarily old).
func (e *Encryptor) Decrypt(token string) (string, error) {
	plain := gofernet.VerifyAndDecrypt([]byte(token), 0*time.Second, []*gofernet.Key{e.key})
	if plain == nil {
		return "", errors.New("fernet: decryption failed")
	}
	return string(plain), nil
}
