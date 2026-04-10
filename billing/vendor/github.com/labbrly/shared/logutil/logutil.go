// Package logutil configures the global slog logger for labbrly services.
package logutil

import (
	"log/slog"
	"os"
)

// Setup configures the global slog logger with a JSON handler.
// The log level is read from the LOG_LEVEL environment variable;
// valid values are DEBUG, INFO (default), WARN, ERROR.
func Setup() {
	level := slog.LevelInfo
	switch os.Getenv("LOG_LEVEL") {
	case "DEBUG":
		level = slog.LevelDebug
	case "WARN":
		level = slog.LevelWarn
	case "ERROR":
		level = slog.LevelError
	}
	slog.SetDefault(slog.New(slog.NewJSONHandler(os.Stdout, &slog.HandlerOptions{Level: level})))
}
