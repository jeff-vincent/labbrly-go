package orgs

import (
	"bytes"
	"context"
	"encoding/json"
	"fmt"
	"net/http"
)

// createNamespaceHTTP POSTs to the compute service to provision a K8s namespace.
func createNamespaceHTTP(ctx context.Context, baseURL, orgID, namespaceKey string) error {
	body, _ := json.Marshal(map[string]string{
		"org_id":                orgID,
		"namespace_creation_key": namespaceKey,
	})
	req, err := http.NewRequestWithContext(ctx, http.MethodPost, baseURL+"/compute/create-namespace", bytes.NewReader(body))
	if err != nil {
		return err
	}
	req.Header.Set("Content-Type", "application/json")
	resp, err := http.DefaultClient.Do(req)
	if err != nil {
		return err
	}
	defer resp.Body.Close()
	if resp.StatusCode != http.StatusOK {
		return fmt.Errorf("compute create-namespace returned %d", resp.StatusCode)
	}
	return nil
}
