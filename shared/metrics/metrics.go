// Package metrics provides a Prometheus metrics handler for labbrly services.
package metrics

import (
	"net/http"

	"github.com/prometheus/client_golang/prometheus/promhttp"
)

// Handler returns the standard Prometheus metrics HTTP handler.
// Mount it at /metrics on the service router.
func Handler() http.Handler {
	return promhttp.Handler()
}
