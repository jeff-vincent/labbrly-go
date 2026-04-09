// Package terminal bridges a gorilla/websocket connection to a Kubernetes pod
// exec session (SPDY), giving the user a live interactive shell.
package terminal

import (
	"context"
	"encoding/json"
	"io"
	"log/slog"
	"net/http"
	"sync"

	"github.com/go-chi/chi/v5"
	"github.com/gorilla/websocket"
	k8sclient "github.com/labbrly/compute/internal/k8s"
	"github.com/labbrly/compute/internal/pod"
)

var upgrader = websocket.Upgrader{
	CheckOrigin: func(r *http.Request) bool { return true },
}

// Handler manages WebSocket terminal sessions.
type Handler struct {
	k8s *k8sclient.Client
}

func NewHandler(k8s *k8sclient.Client) *Handler {
	return &Handler{k8s: k8s}
}

// message is the JSON envelope exchanged with the frontend.
type message struct {
	Type    string `json:"type"`    // "command" | "cancel" | "resize" | (raw)
	Content string `json:"content"` // payload
}

// wsReadWriter implements io.ReadWriter over a gorilla websocket connection
// using a goroutine-safe pipe so the k8s exec stream can read stdin while we
// also write stdout/stderr back over the same websocket.
type wsWriter struct {
	conn *websocket.Conn
	mu   sync.Mutex
}

func (w *wsWriter) Write(p []byte) (int, error) {
	w.mu.Lock()
	defer w.mu.Unlock()
	if err := w.conn.WriteMessage(websocket.TextMessage, p); err != nil {
		return 0, err
	}
	return len(p), nil
}

// Terminal handles WS /compute/terminal/{user_id}
//
// Protocol (client → server):
//   - First frame: JSON {"namespace":"<org_id>"}  (auth handshake)
//   - Subsequent frames: either raw text (passed directly to the shell) or
//     JSON {"type":"command","content":"..."} / {"type":"cancel"}
func (h *Handler) Terminal(w http.ResponseWriter, r *http.Request) {
	userID := chi.URLParam(r, "user_id")

	conn, err := upgrader.Upgrade(w, r, nil)
	if err != nil {
		slog.Warn("ws upgrade failed", "err", err)
		return
	}
	defer conn.Close()

	// First frame: auth/namespace handshake.
	_, authFrame, err := conn.ReadMessage()
	if err != nil {
		sendWSError(conn, "failed to read auth frame")
		return
	}
	var authMsg struct {
		Namespace string `json:"namespace"`
	}
	if err := json.Unmarshal(authFrame, &authMsg); err != nil || authMsg.Namespace == "" {
		sendWSError(conn, "invalid namespace")
		return
	}
	namespace := pod.OrgNamespace(authMsg.Namespace)

	// Confirm pod exists.
	p, err := h.k8s.GetPod(r.Context(), namespace, userID)
	if err != nil {
		sendWSError(conn, "pod not found: "+err.Error())
		return
	}
	container, err := k8sclient.ContainerName(p)
	if err != nil {
		sendWSError(conn, err.Error())
		return
	}

	// Pipe: WS reads → stdin of exec
	stdinR, stdinW := io.Pipe()
	stdoutW := &wsWriter{conn: conn}

	ctx, cancel := context.WithCancel(r.Context())
	defer cancel()

	// goroutine: run the exec session
	execDone := make(chan error, 1)
	go func() {
		execDone <- h.k8s.Exec(ctx, k8sclient.ExecOptions{
			Namespace: namespace,
			Pod:       userID,
			Container: container,
			Command:   pod.StripK8sEnvVars,
			Stdin:     stdinR,
			Stdout:    stdoutW,
			Stderr:    stdoutW,
			TTY:       true,
		})
		_ = conn.WriteMessage(websocket.CloseMessage,
			websocket.FormatCloseMessage(websocket.CloseNormalClosure, "shell exited"))
	}()

	// Main loop: read WebSocket frames and forward to exec stdin.
	for {
		_, rawMsg, err := conn.ReadMessage()
		if err != nil {
			slog.Info("ws terminal read closed", "user", userID, "err", err)
			cancel()
			_ = stdinW.Close()
			break
		}

		input := decodeFrame(rawMsg)
		if input == "\x00" {
			// cancel signal
			_, _ = stdinW.Write([]byte("\x03"))
			continue
		}
		if _, err := stdinW.Write([]byte(input)); err != nil {
			slog.Warn("ws terminal stdin write error", "user", userID, "err", err)
			break
		}
	}

	<-execDone
}

// decodeFrame parses a WebSocket frame from the client.
// Tries JSON {"type","content"} first; falls back to treating the raw bytes as input.
func decodeFrame(raw []byte) string {
	var msg message
	if err := json.Unmarshal(raw, &msg); err == nil {
		switch msg.Type {
		case "command":
			return msg.Content + "\n"
		case "cancel":
			return "\x00" // sentinel for Ctrl+C
		default:
			if msg.Content != "" {
				return msg.Content
			}
		}
	}
	// Raw passthrough (xterm.js sends raw key sequences)
	return string(raw)
}

func sendWSError(conn *websocket.Conn, msg string) {
	payload, _ := json.Marshal(map[string]string{"type": "error", "content": msg})
	_ = conn.WriteMessage(websocket.TextMessage, payload)
	_ = conn.WriteMessage(websocket.CloseMessage,
		websocket.FormatCloseMessage(websocket.CloseInternalServerErr, msg))
}

