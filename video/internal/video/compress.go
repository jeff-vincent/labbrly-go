package video

import (
	"fmt"
	"log/slog"
	"os"
	"os/exec"
	"path/filepath"
	"strconv"
)

type compressionConfig struct {
	Enabled      bool
	CRF          int
	Preset       string
	MaxWidth     int
	AudioBitrate string
}

func defaultCompressionConfig() compressionConfig {
	enabled := os.Getenv("VIDEO_COMPRESSION_ENABLED")
	crf := 28
	if v := os.Getenv("VIDEO_CRF"); v != "" {
		if n, err := strconv.Atoi(v); err == nil {
			crf = n
		}
	}
	preset := os.Getenv("VIDEO_PRESET")
	if preset == "" {
		preset = "veryfast"
	}
	maxWidth := 1280
	if v := os.Getenv("VIDEO_MAX_WIDTH"); v != "" {
		if n, err := strconv.Atoi(v); err == nil {
			maxWidth = n
		}
	}
	audioBitrate := os.Getenv("VIDEO_AUDIO_BITRATE")
	if audioBitrate == "" {
		audioBitrate = "128k"
	}
	return compressionConfig{
		Enabled:      enabled != "0" && enabled != "false" && enabled != "False",
		CRF:          crf,
		Preset:       preset,
		MaxWidth:     maxWidth,
		AudioBitrate: audioBitrate,
	}
}

// CompressVideo runs the input bytes through ffmpeg (H.264 + AAC).
// Returns the compressed bytes on success, or the original bytes if ffmpeg is
// unavailable or fails.
func CompressVideo(raw []byte) []byte {
	cfg := defaultCompressionConfig()
	if !cfg.Enabled {
		return raw
	}

	dir, err := os.MkdirTemp("", "video-compress-*")
	if err != nil {
		slog.Warn("compression: failed to create temp dir", "err", err)
		return raw
	}
	defer os.RemoveAll(dir)

	inPath := filepath.Join(dir, "in.bin")
	outPath := filepath.Join(dir, "out.mp4")

	if err := os.WriteFile(inPath, raw, 0600); err != nil {
		slog.Warn("compression: failed to write input", "err", err)
		return raw
	}

	vf := fmt.Sprintf("scale='min(%d,iw)':-2", cfg.MaxWidth)
	args := []string{
		"-v", "error", "-y",
		"-i", inPath,
		"-c:v", "libx264", "-preset", cfg.Preset, "-crf", strconv.Itoa(cfg.CRF),
		"-vf", vf,
		"-c:a", "aac", "-b:a", cfg.AudioBitrate,
		"-movflags", "+faststart",
		outPath,
	}

	cmd := exec.Command("ffmpeg", args...)
	out, err := cmd.CombinedOutput()
	if err != nil {
		if execErr, ok := err.(*exec.Error); ok && execErr.Err == exec.ErrNotFound {
			slog.Warn("ffmpeg not found in PATH — storing original video without compression")
		} else {
			slog.Warn("ffmpeg failed, using original", "stderr", string(out), "err", err)
		}
		return raw
	}

	compressed, err := os.ReadFile(outPath)
	if err != nil || len(compressed) == 0 {
		slog.Warn("compression: output missing or empty, using original")
		return raw
	}
	slog.Info("video compressed", "original_bytes", len(raw), "compressed_bytes", len(compressed))
	return compressed
}
