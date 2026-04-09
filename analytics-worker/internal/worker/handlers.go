package worker

import (
	"encoding/json"
	"fmt"
	"log/slog"
	"net/http"
	"os"
	"time"

	"github.com/go-chi/chi/v5"
	"github.com/labbrly/shared/crypto"
	"github.com/labbrly/shared/httputil"
	"github.com/labbrly/shared/llm"
)

// Routes registers the analytics-worker endpoints on r.
func Routes(r chi.Router, s *Store, enc *crypto.Encryptor) {
	r.Post("/analytics-worker/process", processAnalytics(s, enc))
}

// processAnalytics handles POST /analytics-worker/process.
// Drains the user's Redis event list, finds their org, decrypts the LLM key,
// calls the configured LLM provider to summarize, and writes the result to MongoDB.
func processAnalytics(s *Store, enc *crypto.Encryptor) http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		var body struct {
			UserID string `json:"user_id"`
		}
		if err := json.NewDecoder(r.Body).Decode(&body); err != nil || body.UserID == "" {
			httputil.WriteJSON(w, http.StatusBadRequest, map[string]string{"detail": "missing user_id"})
			return
		}
		userID := body.UserID

		// Drain events from Redis.
		items, err := s.DrainUserEvents(r.Context(), userID)
		if err != nil {
			httputil.WriteJSON(w, http.StatusInternalServerError, map[string]string{"detail": err.Error()})
			return
		}
		if len(items) == 0 {
			httputil.WriteJSON(w, http.StatusOK, map[string]string{"status": "no-data", "userId": userID})
			return
		}
		slog.Info("drained analytics events", "user_id", userID, "count", len(items))

		// Find org: first by users map, then by org_id from items.
		org, err := s.FindOrgByUserID(r.Context(), userID)
		if err != nil {
			slog.Error("org lookup failed", "user_id", userID, "err", err)
		}
		if org == nil {
			// Fallback: org_id from first item.
			orgIDGuess := firstString(items, "org_id")
			if orgIDGuess != "" {
				org, _ = s.FindOrgByID(r.Context(), orgIDGuess)
			}
		}
		if org == nil {
			httputil.WriteJSON(w, http.StatusNotFound, map[string]string{"detail": "organization for user not found"})
			return
		}

		// Extract IDs.
		orgID := stringFromMap(org, "org_id")
		if orgID == "" {
			orgID = firstString(items, "org_id")
		}
		labID := lastString(items, "lab_id")

		// Load lab analytics targets.
		var analyticsTargets []any
		if labID != "" {
			if lab, _ := s.FindLab(r.Context(), labID); lab != nil {
				if targets, ok := lab["analytics_targets"].([]any); ok {
					analyticsTargets = targets
				}
			}
		}

		// LLM config from org.
		llmConf, _ := org["llm_configs"].(map[string]any)
		if llmConf == nil {
			llmConf = map[string]any{}
		}
		provider := stringFromMap(llmConf, "provider")
		if provider == "" {
			provider = "openai"
		}

		encKey := stringFromMap(llmConf, "api_key")
		if encKey == "" {
			httputil.WriteJSON(w, http.StatusBadRequest, map[string]string{"detail": "org LLM API key not configured"})
			return
		}
		apiKey, err := enc.Decrypt(encKey)
		if err != nil {
			httputil.WriteJSON(w, http.StatusBadRequest, map[string]string{"detail": "failed to decrypt org LLM API key"})
			return
		}

		model := llm.PickModel(provider, llmConf)
		temperature := 0.2
		if v := os.Getenv("ANALYTICS_SUMMARY_TEMPERATURE"); v != "" {
			fmt.Sscanf(v, "%f", &temperature)
		}

		nowMS := time.Now().UnixMilli()
		combined := map[string]any{
			"orgId":            orgID,
			"userId":           userID,
			"labId":            labID,
			"timestamp":        nowMS,
			"entries":          items,
			"analyticsTargets": analyticsTargets,
		}

		schemaExample := buildSchemaExample(orgID, labID, userID, nowMS, analyticsTargets)
		combinedJSON, _ := json.Marshal(combined)
		schemaJSON, _ := json.Marshal(schemaExample)

		systemPrompt := "You are an analytics summarizer for product managers. Analyze the provided lab session events and output a single, strictly valid JSON object matching the schema keys and types shown. " +
			"Use ONLY the provided admin-defined analyticsTargets to evaluate attempts and success; do not infer or invent targets. " +
			"Write the summary.text as a concise, PM-facing narrative focused on the product being taught/demonstrated (not the lab platform or delivery). " +
			"The narrative must: (1) explicitly comment on each analytics target, (2) highlight friction points and user questions related to the product, and (3) suggest 2-4 concrete product improvements (e.g., copy, flows, guardrails, errors). " +
			"Avoid critiquing the third-party lab mechanics; frame all recommendations as product improvements. " +
			"Only output JSON, no explanations."

		userPrompt := "Summarize the analytics for this user. Compute a 0-1 engagement_score and friction_score; estimate tasks_completed; " +
			"count commands_entered. Base scores on observable activity (e.g., frequency and output patterns). " +
			"Additionally, evaluate admin-defined analyticsTargets by assessing whether the user attempted and succeeded at each target. " +
			"For each target, set attempted/succeeded booleans, a 0-1 score reflecting closeness to success, and include concise attempt_evidence and success_evidence strings pulled from the events. " +
			"Use ONLY the provided targets (id, name, attemptIndicators, successIndicators, notes) and the supplied events; do not rely on any external heuristics. " +
			"Compute overall_target_coverage as the fraction of targets marked succeeded. " +
			"In summary.text, explicitly comment on each analytics target (use the target names) and focus commentary on the product being taught—not the lab platform. Call out product-related friction points and user questions observed, and list 2-4 concrete recommendations to improve the product. Avoid critiquing third-party lab mechanics. " +
			"Respond with ONLY JSON matching the example schema.\n\n" +
			fmt.Sprintf("Example schema (values illustrative):\n%s\n\nData: %s", schemaJSON, combinedJSON)

		messages := []llm.Message{
			{Role: "system", Content: systemPrompt},
			{Role: "user", Content: userPrompt},
		}

		var content string
		switch provider {
		case "openai":
			content, err = llm.CallOpenAI(apiKey, model, messages, temperature)
		case "anthropic":
			content, err = llm.CallAnthropic(apiKey, model, messages, temperature)
		case "azure_openai":
			endpoint := stringFromMap(llmConf, "azure_openai_endpoint")
			deployment := stringFromMap(llmConf, "azure_openai_deployment")
			if endpoint == "" || deployment == "" {
				httputil.WriteJSON(w, http.StatusBadRequest, map[string]string{"detail": "Azure OpenAI not fully configured for org"})
				return
			}
			content, err = llm.CallAzure(apiKey, endpoint, deployment, messages, temperature)
		default:
			httputil.WriteJSON(w, http.StatusBadRequest, map[string]string{"detail": "unsupported provider: " + provider})
			return
		}
		if err != nil {
			slog.Error("LLM summarization failed", "err", err)
			httputil.WriteJSON(w, http.StatusInternalServerError, map[string]string{"detail": err.Error()})
			return
		}

		var summary map[string]any
		if err := json.Unmarshal([]byte(content), &summary); err != nil {
			slog.Warn("LLM returned non-JSON, using fallback summary", "user_id", userID)
			summary = buildFallbackSummary(orgID, labID, userID, nowMS, items, analyticsTargets)
		}
		s.WriteSummary(r.Context(), summary)

		httputil.WriteJSON(w, http.StatusOK, summary)
	}
}

func buildSchemaExample(orgID, labID, userID string, ts int64, targets []any) map[string]any {
	targetEvals := make([]map[string]any, 0)
	for _, t := range targets {
		tm, _ := t.(map[string]any)
		if tm == nil {
			continue
		}
		targetEvals = append(targetEvals, map[string]any{
			"id": stringFromMap(tm, "id"), "name": stringFromMap(tm, "name"),
			"attempted": false, "succeeded": false, "score": 0.0,
			"attempt_evidence": []string{}, "success_evidence": []string{}, "notes": "",
		})
	}
	return map[string]any{
		"org_id": orgID, "lab_id": labID, "user_id": userID, "timestamp": ts,
		"metrics": map[string]any{
			"engagement_score": 0.0, "friction_score": 0.0,
			"tasks_completed": 0, "commands_entered": 0,
		},
		"target_evaluations":      targetEvals,
		"overall_target_coverage": 0.0,
		"summary":                 map[string]any{"text": "", "tags": []string{}},
	}
}

func buildFallbackSummary(orgID, labID, userID string, ts int64, items []map[string]any, targets []any) map[string]any {
	var commandCount int
	for _, item := range items {
		if s, ok := item["sample"].(map[string]any); ok {
			if evs, ok := s["events"].([]any); ok {
				commandCount += len(evs)
			}
		}
	}
	targetEvals := make([]map[string]any, 0, len(targets))
	for _, t := range targets {
		tm, _ := t.(map[string]any)
		if tm == nil {
			continue
		}
		targetEvals = append(targetEvals, map[string]any{
			"id": stringFromMap(tm, "id"), "name": stringFromMap(tm, "name"),
			"attempted": false, "succeeded": false, "score": 0.0,
			"attempt_evidence": []string{}, "success_evidence": []string{},
			"notes": stringFromMap(tm, "notes"),
		})
	}
	return map[string]any{
		"org_id": orgID, "lab_id": labID, "user_id": userID, "timestamp": ts,
		"metrics": map[string]any{
			"engagement_score": 0.0, "friction_score": 0.0,
			"tasks_completed": 0, "commands_entered": commandCount,
		},
		"target_evaluations":      targetEvals,
		"overall_target_coverage": 0.0,
		"summary":                 map[string]any{"text": "Automatic fallback summary.", "tags": []string{"fallback"}},
	}
}

func stringFromMap(m map[string]any, key string) string {
	if v, ok := m[key].(string); ok {
		return v
	}
	return ""
}

// firstString returns the value of key from the first item that has it.
func firstString(items []map[string]any, key string) string {
	for _, item := range items {
		if v, ok := item[key].(string); ok && v != "" {
			return v
		}
	}
	return ""
}

// lastString returns the value of key from the last item that has it.
func lastString(items []map[string]any, key string) string {
	for i := len(items) - 1; i >= 0; i-- {
		if v, ok := items[i][key].(string); ok && v != "" {
			return v
		}
	}
	return ""
}
