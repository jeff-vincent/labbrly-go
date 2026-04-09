package tokens

import (
	"crypto/rand"
	"encoding/hex"
)

// RandomHex returns a random hex string of n bytes (2n characters).
func RandomHex(n int) string {
	b := make([]byte, n)
	_, _ = rand.Read(b)
	return hex.EncodeToString(b)
}
