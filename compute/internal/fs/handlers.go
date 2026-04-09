// Package fs provides HTTP handlers for file-system operations inside user pods.
// All operations use the Kubernetes exec API — no kubectl subprocess required.
package fs

import (
	"bytes"
	"context"
	"encoding/json"
	"fmt"
	"io"
	"log/slog"
	"net/http"
	"strings"
	"time"

	"github.com/labbrly/compute/internal/auth"
	k8sclient "github.com/labbrly/compute/internal/k8s"
	"github.com/labbrly/compute/internal/pod"
)

const execTimeout = 10 * time.Second

// Handler groups the filesystem HTTP handlers.
type Handler struct {
	k8s *k8sclient.Client
}

func NewHandler(k8s *k8sclient.Client) *Handler {
	return &Handler{k8s: k8s}
}

// ListFiles handles GET /compute/fs/list?path=<dir>
func (h *Handler) ListFiles(w http.ResponseWriter, r *http.Request) {
	namespace, userID, ok := userContext(r)
	if !ok {
		writeJSON(w, http.StatusUnauthorized, errResp("unauthorized"))
		return
	}

	dirPath := r.URL.Query().Get("path")
	if dirPath == "" {
		dirPath = "."
	}

	// Shell script: list non-hidden entries, mark dirs with trailing '/'.
	// Path is passed via env var P to avoid shell injection.
	script := `
set -e
P=${P:-.}
if [ ! -d "$P" ]; then echo "__ERR__NOT_DIR__"; exit 2; fi
for f in "$P"/*; do
  [ -e "$f" ] || continue
  base=$(basename "$f")
  case "$base" in .*) continue;; esac
  if [ -d "$f" ]; then printf "%s/\n" "$base"
  else printf "%s\n" "$base"; fi
done
`
	stdout, _, err := h.exec(r.Context(), namespace, userID,
		[]string{"env", "P="+dirPath, "/bin/sh", "-c", script},
	)
	if err != nil {
		out := string(stdout)
		if strings.Contains(out, "__ERR__NOT_DIR__") {
			writeJSON(w, http.StatusBadRequest, errResp("not a directory"))
			return
		}
		writeJSON(w, http.StatusInternalServerError, errResp(err.Error()))
		return
	}

	entries := parseListOutput(string(stdout), dirPath)
	writeJSON(w, http.StatusOK, map[string]any{"path": dirPath, "entries": entries})
}

// ReadFile handles GET /compute/fs/read?path=<file>
func (h *Handler) ReadFile(w http.ResponseWriter, r *http.Request) {
	namespace, userID, ok := userContext(r)
	if !ok {
		writeJSON(w, http.StatusUnauthorized, errResp("unauthorized"))
		return
	}

	filePath := r.URL.Query().Get("path")
	if filePath == "" {
		writeJSON(w, http.StatusBadRequest, errResp("path is required"))
		return
	}

	stdout, stderr, err := h.exec(r.Context(), namespace, userID,
		[]string{"env", "P="+filePath, "/bin/sh", "-c", `cat "$P"`},
	)
	if err != nil {
		writeJSON(w, http.StatusBadRequest, errResp(string(stderr)))
		return
	}
	w.Header().Set("Content-Type", "text/plain; charset=utf-8")
	_, _ = w.Write(stdout)
}

// CreateFile handles POST /compute/fs/create  body: {path, content?}
func (h *Handler) CreateFile(w http.ResponseWriter, r *http.Request) {
	namespace, userID, ok := userContext(r)
	if !ok {
		writeJSON(w, http.StatusUnauthorized, errResp("unauthorized"))
		return
	}

	var body struct {
		Path    string `json:"path"`
		Content string `json:"content"`
	}
	if err := json.NewDecoder(r.Body).Decode(&body); err != nil || body.Path == "" {
		writeJSON(w, http.StatusBadRequest, errResp("path is required"))
		return
	}

	// Stream the content via stdin to avoid env-var size limits.
	// The script reads from stdin and writes to the destination file.
	script := `
set -e
mkdir -p "$(dirname "$P")"
cat > "$P"
`
	contentBytes := []byte(body.Content)
	_, stderr, err := h.execWithStdin(r.Context(), namespace, userID,
		[]string{"env", "P="+body.Path, "/bin/sh", "-c", script},
		bytes.NewReader(contentBytes),
	)
	if err != nil {
		writeJSON(w, http.StatusBadRequest, errResp(string(stderr)))
		return
	}
	writeJSON(w, http.StatusOK, map[string]string{"status": "ok", "path": body.Path})
}

// DeletePath handles POST /compute/fs/delete  body: {path}
func (h *Handler) DeletePath(w http.ResponseWriter, r *http.Request) {
	namespace, userID, ok := userContext(r)
	if !ok {
		writeJSON(w, http.StatusUnauthorized, errResp("unauthorized"))
		return
	}

	var body struct {
		Path string `json:"path"`
	}
	if err := json.NewDecoder(r.Body).Decode(&body); err != nil || body.Path == "" {
		writeJSON(w, http.StatusBadRequest, errResp("path is required"))
		return
	}

	_, stderr, err := h.exec(r.Context(), namespace, userID,
		[]string{"env", "P="+body.Path, "/bin/sh", "-c", `rm -rf -- "$P"`},
	)
	if err != nil {
		writeJSON(w, http.StatusBadRequest, errResp(string(stderr)))
		return
	}
	writeJSON(w, http.StatusOK, map[string]string{"status": "ok", "path": body.Path})
}

// MakeDirectory handles POST /compute/fs/mkdir  body: {path}
func (h *Handler) MakeDirectory(w http.ResponseWriter, r *http.Request) {
	namespace, userID, ok := userContext(r)
	if !ok {
		writeJSON(w, http.StatusUnauthorized, errResp("unauthorized"))
		return
	}

	var body struct {
		Path string `json:"path"`
	}
	if err := json.NewDecoder(r.Body).Decode(&body); err != nil || body.Path == "" {
		writeJSON(w, http.StatusBadRequest, errResp("path is required"))
		return
	}

	_, stderr, err := h.exec(r.Context(), namespace, userID,
		[]string{"env", "P="+body.Path, "/bin/sh", "-c", `mkdir -p -- "$P"`},
	)
	if err != nil {
		writeJSON(w, http.StatusBadRequest, errResp(string(stderr)))
		return
	}
	writeJSON(w, http.StatusOK, map[string]string{"status": "ok", "path": body.Path})
}

// RenamePath handles POST /compute/fs/rename  body: {src, dest}
func (h *Handler) RenamePath(w http.ResponseWriter, r *http.Request) {
	namespace, userID, ok := userContext(r)
	if !ok {
		writeJSON(w, http.StatusUnauthorized, errResp("unauthorized"))
		return
	}

	var body struct {
		Src  string `json:"src"`
		Dest string `json:"dest"`
	}
	if err := json.NewDecoder(r.Body).Decode(&body); err != nil || body.Src == "" || body.Dest == "" {
		writeJSON(w, http.StatusBadRequest, errResp("src and dest are required"))
		return
	}

	script := `
set -e
mkdir -p -- "$(dirname "$D")"
mv -f -- "$S" "$D"
`
	_, stderr, err := h.exec(r.Context(), namespace, userID,
		[]string{"env", "S="+body.Src, "D="+body.Dest, "/bin/sh", "-c", script},
	)
	if err != nil {
		writeJSON(w, http.StatusBadRequest, errResp(string(stderr)))
		return
	}
	writeJSON(w, http.StatusOK, map[string]string{"status": "ok", "path": body.Dest})
}

// RunScript handles POST /compute/run (multipart: script, script_name?, execution_command?)
func (h *Handler) RunScript(w http.ResponseWriter, r *http.Request) {
	namespace, userID, ok := userContext(r)
	if !ok {
		writeJSON(w, http.StatusUnauthorized, errResp("unauthorized"))
		return
	}

	if err := r.ParseMultipartForm(4 << 20); err != nil {
		_ = r.ParseForm()
	}
	script := r.FormValue("script")
	scriptName := r.FormValue("script_name")
	execCmd := r.FormValue("execution_command")

	if scriptName == "" || scriptName == "null" {
		scriptName = "script.py"
	}
	if execCmd == "" || execCmd == "null" {
		execCmd = "python"
	}

	slog.Info("run script", "user", userID, "script_name", scriptName, "exec_cmd", execCmd)

	// Write the script to the pod via stdin, then execute it.
	// Step 1: copy script into pod using cat > scriptName
	_, stderr, err := h.execWithStdin(
		r.Context(), namespace, userID,
		[]string{"/bin/sh", "-c", fmt.Sprintf("cat > %s", shellQuote(scriptName))},
		strings.NewReader(script),
	)
	if err != nil {
		writeJSON(w, http.StatusInternalServerError, errResp("copy failed: "+string(stderr)))
		return
	}

	// Step 2: execute the script with k8s-env vars stripped.
	runCtx, cancel := context.WithTimeout(r.Context(), 20*time.Second)
	defer cancel()

	stripAndRun := fmt.Sprintf(
		"unset KUBERNETES_SERVICE_PORT KUBERNETES_PORT HOSTNAME GPG_KEY PYTHON_SHA256 "+
			"KUBERNETES_PORT_443_TCP_ADDR KUBERNETES_PORT_443_TCP_PORT KUBERNETES_PORT_443_TCP_PROTO "+
			"LANG PYTHON_VERSION KUBERNETES_SERVICE_PORT_HTTPS KUBERNETES_PORT_443_TCP "+
			"KUBERNETES_SERVICE_HOST PWD; %s %s",
		execCmd, shellQuote(scriptName),
	)

	stdout, stderr, err := h.exec(runCtx, namespace, userID, []string{"/bin/sh", "-c", stripAndRun})
	if err != nil {
		if runCtx.Err() == context.DeadlineExceeded {
			writeJSON(w, http.StatusRequestTimeout, map[string]string{"error": "execution timed out", "timeout_seconds": "20s"})
			return
		}
		if len(stderr) > 0 {
			w.Header().Set("Content-Type", "text/plain")
			_, _ = w.Write(stderr)
			return
		}
	}
	w.Header().Set("Content-Type", "text/plain")
	if len(stderr) > 0 {
		_, _ = w.Write(stderr)
		return
	}
	_, _ = w.Write(stdout)
}

// CheckLab handles GET /compute/check-lab
func (h *Handler) CheckLab(w http.ResponseWriter, r *http.Request) {
	namespace, userID, ok := userContext(r)
	if !ok {
		writeJSON(w, http.StatusUnauthorized, errResp("unauthorized"))
		return
	}

	stdout, stderr, err := h.exec(r.Context(), namespace, userID, []string{"/bin/sh", "-c", "./check_lab.sh"})
	if err != nil {
		writeJSON(w, http.StatusOK, map[string]any{
			"status":  "error",
			"output":  string(stderr),
			"message": fmt.Sprintf("command failed: %v", err),
		})
		return
	}
	writeJSON(w, http.StatusOK, map[string]any{
		"status":  "success",
		"output":  string(stdout),
		"message": "lab check executed successfully",
	})
}

// --- helpers ---

func (h *Handler) exec(ctx context.Context, namespace, podName string, cmd []string) ([]byte, []byte, error) {
	ctx, cancel := context.WithTimeout(ctx, execTimeout)
	defer cancel()
	p, err := h.k8s.GetPod(ctx, namespace, podName)
	if err != nil {
		return nil, nil, err
	}
	container, err := k8sclient.ContainerName(p)
	if err != nil {
		return nil, nil, err
	}
	return h.k8s.ExecCapture(ctx, namespace, podName, container, cmd)
}

func (h *Handler) execWithStdin(ctx context.Context, namespace, podName string, cmd []string, stdin io.Reader) ([]byte, []byte, error) {
	ctx, cancel := context.WithTimeout(ctx, execTimeout)
	defer cancel()
	p, err := h.k8s.GetPod(ctx, namespace, podName)
	if err != nil {
		return nil, nil, err
	}
	container, err := k8sclient.ContainerName(p)
	if err != nil {
		return nil, nil, err
	}
	var stdout, stderr bytes.Buffer
	err = h.k8s.Exec(ctx, k8sclient.ExecOptions{
		Namespace: namespace,
		Pod:       podName,
		Container: container,
		Command:   cmd,
		Stdin:     stdin,
		Stdout:    &stdout,
		Stderr:    &stderr,
	})
	return stdout.Bytes(), stderr.Bytes(), err
}

func userContext(r *http.Request) (namespace, userID string, ok bool) {
	info, ok := auth.FromContext(r.Context())
	if !ok {
		return "", "", false
	}
	return pod.OrgNamespace(info.OrgID), info.UserID, true
}

func parseListOutput(out, dirPath string) []map[string]string {
	base := strings.TrimRight(dirPath, "/")
	if base == "" {
		base = "/"
	}
	var entries []map[string]string
	for _, line := range strings.Split(out, "\n") {
		name := strings.TrimSpace(line)
		if name == "" {
			continue
		}
		isDir := strings.HasSuffix(name, "/")
		clean := strings.TrimSuffix(name, "/")
		var fullPath string
		if base == "/" {
			fullPath = "/" + clean
		} else {
			fullPath = base + "/" + clean
		}
		if strings.HasPrefix(fullPath, "./") {
			fullPath = fullPath[2:]
		}
		t := "file"
		if isDir {
			t = "dir"
		}
		entries = append(entries, map[string]string{
			"name": clean,
			"path": fullPath,
			"type": t,
		})
	}
	// dirs first, then alpha
	sortEntries(entries)
	return entries
}

func sortEntries(entries []map[string]string) {
	for i := 1; i < len(entries); i++ {
		for j := i; j > 0; j-- {
			a, b := entries[j-1], entries[j]
			aScore := 1
			if a["type"] == "dir" {
				aScore = 0
			}
			bScore := 1
			if b["type"] == "dir" {
				bScore = 0
			}
			if aScore > bScore || (aScore == bScore && strings.ToLower(a["name"]) > strings.ToLower(b["name"])) {
				entries[j-1], entries[j] = entries[j], entries[j-1]
			} else {
				break
			}
		}
	}
}

func shellQuote(s string) string {
	return "'" + strings.ReplaceAll(s, "'", "'\\''") + "'"
}

func writeJSON(w http.ResponseWriter, status int, v any) {
	w.Header().Set("Content-Type", "application/json")
	w.WriteHeader(status)
	_ = json.NewEncoder(w).Encode(v)
}

func errResp(msg string) map[string]string { return map[string]string{"error": msg} }

