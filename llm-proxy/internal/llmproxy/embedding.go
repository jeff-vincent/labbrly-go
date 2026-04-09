package llmproxy

import (
	"bytes"
	"encoding/json"
	"fmt"
	"io"
	"log/slog"
	"net/http"
	"time"
)

var embeddingClient = &http.Client{Timeout: 30 * time.Second}

// GetEmbedding calls the OpenAI embeddings API and returns the embedding vector.
func GetEmbedding(apiKey, text string) ([]float64, error) {
	body, _ := json.Marshal(map[string]string{
		"input": text,
		"model": "text-embedding-3-small",
	})
	req, _ := http.NewRequest(http.MethodPost, "https://api.openai.com/v1/embeddings", bytes.NewReader(body))
	req.Header.Set("Authorization", "Bearer "+apiKey)
	req.Header.Set("Content-Type", "application/json")

	resp, err := embeddingClient.Do(req)
	if err != nil {
		return nil, fmt.Errorf("embedding request: %w", err)
	}
	defer resp.Body.Close()
	raw, _ := io.ReadAll(resp.Body)
	if resp.StatusCode >= 400 {
		slog.Error("embedding API error", "status", resp.StatusCode, "body", string(raw))
		return nil, fmt.Errorf("embedding API: status %d", resp.StatusCode)
	}

	var result struct {
		Data []struct {
			Embedding []float64 `json:"embedding"`
		} `json:"data"`
	}
	if err := json.Unmarshal(raw, &result); err != nil {
		return nil, fmt.Errorf("embedding decode: %w", err)
	}
	if len(result.Data) == 0 {
		return nil, fmt.Errorf("embedding API returned no data")
	}
	return result.Data[0].Embedding, nil
}
