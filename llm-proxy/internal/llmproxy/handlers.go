package llmproxy

import (
	"encoding/json"
	"log/slog"
	"net/http"
	"strings"

	"github.com/go-chi/chi/v5"
	"github.com/labbrly/shared/auth"
	"github.com/labbrly/shared/crypto"
	"github.com/labbrly/shared/httputil"
	"github.com/labbrly/shared/llm"
)

// Routes registers all /llm endpoints on r.
func Routes(r chi.Router, s *Store, enc *crypto.Encryptor) {
	r.Post("/llm/chat", chat(s, enc))
}

// chat handles POST /llm/chat.
// Resolves the caller's org LLM configuration, optionally enriches with RAG context,
// and proxies the chat request to the configured provider.
func chat(s *Store, enc *crypto.Encryptor) http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		info, _ := auth.FromContext(r.Context())
		if info.OrgID == "" {
			httputil.WriteJSON(w, http.StatusUnauthorized, map[string]string{"detail": "org_id is required"})
			return
		}
		if info.LabID == "" {
			httputil.WriteJSON(w, http.StatusUnauthorized, map[string]string{"detail": "lab_id is required"})
			return
		}

		var data map[string]any
		if err := json.NewDecoder(r.Body).Decode(&data); err != nil {
			httputil.WriteJSON(w, http.StatusBadRequest, map[string]string{"detail": "invalid JSON body"})
			return
		}

		// Load lab to check rag_urls.
		lab, err := s.GetLab(r.Context(), info.LabID)
		if err != nil || lab == nil {
			httputil.WriteJSON(w, http.StatusNotFound, map[string]string{"detail": "lab not found"})
			return
		}

		// Parse messages.
		messagesRaw, _ := data["messages"].([]any)
		if len(messagesRaw) == 0 {
			httputil.WriteJSON(w, http.StatusBadRequest, map[string]string{"detail": "messages must be a non-empty array"})
			return
		}
		msgs := make([]llm.Message, 0, len(messagesRaw))
		for _, raw := range messagesRaw {
			m, ok := raw.(map[string]any)
			if !ok {
				continue
			}
			role, _ := m["role"].(string)
			content, _ := m["content"].(string)
			if role == "" || content == "" {
				continue
			}
			msgs = append(msgs, llm.Message{Role: role, Content: content})
		}
		if len(msgs) == 0 {
			httputil.WriteJSON(w, http.StatusBadRequest, map[string]string{"detail": "no valid chat messages provided"})
			return
		}

		// Load org LLM config.
		org, err := s.GetOrg(r.Context(), info.OrgID)
		if err != nil || org == nil {
			httputil.WriteJSON(w, http.StatusNotFound, map[string]string{"detail": "org not found"})
			return
		}
		llmConf, _ := org["llm_configs"].(map[string]any)
		if llmConf == nil {
			llmConf = map[string]any{}
		}

		provider := stringFromMap(llmConf, "provider")
		if provider == "" {
			provider = "openai"
		}

		// Allow model override from request.
		model := stringFromMap(data, "model")
		if model == "" {
			model = llm.PickModel(provider, llmConf)
		}

		encKey := stringFromMap(llmConf, "api_key")
		if encKey == "" {
			httputil.WriteJSON(w, http.StatusBadRequest, map[string]string{"detail": "LLM API key not configured for org"})
			return
		}
		apiKey, err := enc.Decrypt(encKey)
		if err != nil {
			httputil.WriteJSON(w, http.StatusBadRequest, map[string]string{"detail": "failed to decrypt org LLM API key"})
			return
		}

		temperature := 0.2
		if t, ok := data["temperature"].(float64); ok {
			temperature = t
		}

		// RAG enrichment: only for OpenAI provider when lab has rag_urls.
		ragURLs, _ := lab["rag_urls"].([]any)
		if len(ragURLs) > 0 && provider == "openai" {
			// Use the last user message as the query.
			var chatInput string
			for i := len(msgs) - 1; i >= 0; i-- {
				if msgs[i].Role == "user" {
					chatInput = msgs[i].Content
					break
				}
			}
			if chatInput != "" {
				embedding, err := GetEmbedding(apiKey, chatInput)
				if err != nil {
					slog.Warn("embedding failed, proceeding without RAG", "err", err)
				} else {
					contextDocs, err := s.VectorSearch(r.Context(), info.OrgID, info.LabID, embedding)
					if err != nil {
						slog.Warn("vector search failed, proceeding without RAG", "err", err)
					} else if len(contextDocs) > 0 {
						ragContext := strings.Join(contextDocs, "\n\n")
						// Prepend RAG context as a system message.
						msgs = append([]llm.Message{{Role: "system", Content: "Context:\n" + ragContext}}, msgs...)
					}
				}
			}
		}

		var content string
		switch provider {
		case "openai":
			content, err = llm.CallOpenAI(apiKey, model, msgs, temperature)
		case "anthropic":
			content, err = llm.CallAnthropic(apiKey, model, msgs, temperature)
		case "azure_openai":
			endpoint := stringFromMap(llmConf, "azure_openai_endpoint")
			deployment := stringFromMap(llmConf, "azure_openai_deployment")
			if deployment == "" {
				deployment = model
			}
			if endpoint == "" || deployment == "" {
				httputil.WriteJSON(w, http.StatusBadRequest, map[string]string{"detail": "Azure OpenAI not fully configured for org"})
				return
			}
			content, err = llm.CallAzure(apiKey, endpoint, deployment, msgs, temperature)
		default:
			httputil.WriteJSON(w, http.StatusBadRequest, map[string]string{"detail": "unsupported provider: " + provider})
			return
		}
		if err != nil {
			slog.Error("LLM chat failed", "provider", provider, "err", err)
			httputil.WriteJSON(w, http.StatusInternalServerError, map[string]string{"detail": err.Error()})
			return
		}

		httputil.WriteJSON(w, http.StatusOK, map[string]string{"content": content})
	}
}

func stringFromMap(m map[string]any, key string) string {
	if v, ok := m[key].(string); ok {
		return strings.TrimSpace(v)
	}
	return ""
}
