package builder

import (
	"context"
	"fmt"
	"io"
	"log/slog"
	"mime/multipart"
	"os"
	"path/filepath"
	"strings"
)

// contextBackground is a shim so k8s.go can call it without importing context directly.
func contextBackground() context.Context { return context.Background() }

const buildRoot = "/builds"

// debugSave controls verbose logging of saved files.
var debugSave = os.Getenv("BUILDER_DEBUG_SAVE") == "1"

// SaveBuildContext writes the Dockerfile and uploaded files to a job-scoped
// directory under buildRoot. Returns the directory path.
// Files are sanitized to prevent path traversal attacks.
func SaveBuildContext(jobID, dockerfileContent string, files []*multipart.FileHeader) (string, error) {
	ctxDir := filepath.Join(buildRoot, jobID)
	if err := os.RemoveAll(ctxDir); err != nil {
		return "", fmt.Errorf("clean context dir: %w", err)
	}
	if err := os.MkdirAll(ctxDir, 0750); err != nil {
		return "", fmt.Errorf("create context dir: %w", err)
	}

	// Write Dockerfile.
	if err := os.WriteFile(filepath.Join(ctxDir, "Dockerfile"), []byte(dockerfileContent), 0640); err != nil {
		return "", fmt.Errorf("write Dockerfile: %w", err)
	}

	for _, fh := range files {
		if err := saveFile(ctxDir, fh); err != nil {
			slog.Warn("skipped file during context save", "filename", fh.Filename, "err", err)
		}
	}
	return ctxDir, nil
}

func saveFile(ctxDir string, fh *multipart.FileHeader) error {
	// Normalize path: convert backslashes, strip leading slashes and drive letters.
	raw := strings.ReplaceAll(fh.Filename, "\\", "/")
	// Remove Windows drive letters like C:
	if len(raw) >= 2 && raw[1] == ':' {
		raw = raw[2:]
	}
	raw = strings.TrimLeft(raw, "/")

	// Resolve to remove .. segments, anchored to root.
	normalized := filepath.Clean("/" + raw)
	normalized = strings.TrimPrefix(normalized, "/")

	if normalized == "" || normalized == "." {
		return nil
	}
	// Don't overwrite the Dockerfile we already wrote.
	if strings.EqualFold(normalized, "Dockerfile") {
		return nil
	}

	dest := filepath.Join(ctxDir, normalized)
	// Confirm destination is inside ctxDir (prevent traversal).
	if !strings.HasPrefix(filepath.Clean(dest)+string(os.PathSeparator), filepath.Clean(ctxDir)+string(os.PathSeparator)) {
		return fmt.Errorf("path traversal rejected: %s", fh.Filename)
	}

	if err := os.MkdirAll(filepath.Dir(dest), 0750); err != nil {
		return err
	}

	src, err := fh.Open()
	if err != nil {
		return err
	}
	defer src.Close()

	data, err := io.ReadAll(src)
	if err != nil {
		return err
	}
	if err := os.WriteFile(dest, data, 0640); err != nil {
		return err
	}
	if debugSave {
		slog.Info("builder saved file", "path", normalized, "bytes", len(data))
	}
	return nil
}
