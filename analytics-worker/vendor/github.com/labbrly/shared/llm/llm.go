// Package llm provides a thin multi-provider LLM client used by the
// analytics-worker and llm-proxy services.
//
// Supported providers: openai, anthropic, azure_openai.
// All calls are synchronous HTTP POST requests — callers handle concurrency.
package llm

import (
	"bytes"
	"encoding/json"
	"fmt"
	"io"
	"net/http"
	"time"
)

var httpClient = &http.Client{Timeout: 60 * time.Second}

// Message is an OpenAI-style chat message.
type Message struct {
	Role    string `json:"role"`
	Content string `json:"content"`
}

// PickModel returns the model name for a provider, consulting the org's
// llm_configs map for overrides before falling back to sensible defaults.
func PickModel(provider string, conf map[string]any) string {
	if m, _ := conf["model"].(string); m != "" {
		return m
	}
	switch provider {
	case "openai":
		if m, _ := conf["openai_model"].(string); m != "" {
			return m
		}
		return "gpt-4o-mini"
	case "anthropic":
		if m, _ := conf["anthropic_model"].(string); m != "" {
			return m
		}
		return "claude-3-5-sonnet-latest"
	case "azure_openai":
		if m, _ := conf["azure_openai_deployment"].(string); m != "" {
			return m
		}
		return "gpt-4o-mini"
	}
	return "gpt-4o-mini"
}

// CallOpenAI sends messages to the OpenAI chat completions API.
func CallOpenAI(apiKey, model string, messages []Message, temperature float64) (string, error) {
	body := map[string]any{
		"model":       model,
		"messages":    messages,
		"temperature": temperature,
	}
	data, err := doPost("https://api.openai.com/v1/chat/completions",
		map[string]string{
			"Authorization": "Bearer " + apiKey,
			"Content-Type":  "application/json",
		}, body)
	if err != nil {
		return "", err
	}
	return extractOpenAIContent(data)
}

// CallAnthropic sends messages to the Anthropic Messages API.
func CallAnthropic(apiKey, model string, messages []Message, temperature float64) (string, error) {
	var system string
	var anthropicMsgs []map[string]string
	for _, m := range messages {
		if m.Role == "system" {
			if system != "" {
				system += "\n"
			}
			system += m.Content
		} else {
			anthropicMsgs = append(anthropicMsgs, map[string]string{
				"role":    m.Role,
				"content": m.Content,
			})
		}
	}
	body := map[string]any{
		"model":       model,
		"max_tokens":  1024,
		"temperature": temperature,
		"messages":    anthropicMsgs,
	}
	if system != "" {
		body["system"] = system
	}
	data, err := doPost("https://api.anthropic.com/v1/messages",
		map[string]string{
			"x-api-key":         apiKey,
			"anthropic-version": "2023-06-01",
			"content-type":      "application/json",
		}, body)
	if err != nil {
		return "", err
	}
	return extractAnthropicContent(data)
}

// CallAzure sends messages to an Azure OpenAI deployment.
func CallAzure(apiKey, endpoint, deployment string, messages []Message, temperature float64) (string, error) {
	url := fmt.Sprintf("%s/openai/deployments/%s/chat/completions?api-version=2024-02-15-preview",
		endpoint, deployment)
	body := map[string]any{
		"messages":    messages,
		"temperature": temperature,
	}
	data, err := doPost(url,
		map[string]string{
			"api-key":      apiKey,
			"Content-Type": "application/json",
		}, body)
	if err != nil {
		return "", err
	}
	return extractOpenAIContent(data)
}

// doPost makes a JSON POST request and returns the decoded response body.
func doPost(url string, headers map[string]string, body any) (map[string]any, error) {
	b, err := json.Marshal(body)
	if err != nil {
		return nil, err
	}
	req, err := http.NewRequest(http.MethodPost, url, bytes.NewReader(b))
	if err != nil {
		return nil, err
	}
	for k, v := range headers {
		req.Header.Set(k, v)
	}
	resp, err := httpClient.Do(req)
	if err != nil {
		return nil, err
	}
	defer resp.Body.Close()
	raw, err := io.ReadAll(resp.Body)
	if err != nil {
		return nil, err
	}
	if resp.StatusCode >= 400 {
		return nil, fmt.Errorf("LLM API %s error %d: %s", url, resp.StatusCode, raw)
	}
	var result map[string]any
	if err := json.Unmarshal(raw, &result); err != nil {
		return nil, err
	}
	return result, nil
}

func extractOpenAIContent(data map[string]any) (string, error) {
	choices, _ := data["choices"].([]any)
	if len(choices) == 0 {
		return "", fmt.Errorf("no choices in response")
	}
	choice, _ := choices[0].(map[string]any)
	msg, _ := choice["message"].(map[string]any)
	content, _ := msg["content"].(string)
	return content, nil
}

func extractAnthropicContent(data map[string]any) (string, error) {
	parts, _ := data["content"].([]any)
	var out string
	for _, p := range parts {
		block, _ := p.(map[string]any)
		if block["type"] == "text" {
			if t, ok := block["text"].(string); ok {
				if out != "" {
					out += "\n"
				}
				out += t
			}
		}
	}
	return out, nil
}
