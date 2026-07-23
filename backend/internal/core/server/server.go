package server

import (
	"context"
	"encoding/json"
	"net/http"
	"time"

	"github.com/prometheus/client_golang/prometheus/promhttp"

	"fintraffic/internal/core/cache"
)

// Version metadata, injected at build time via -ldflags.
var (
	Version   = "dev"
	BuildDate = "unknown"
	GitCommit = "unknown"
)

var startTime = time.Now()

// ModeHealth is one mode's contribution to the global health report.
type ModeHealth struct {
	Status  string         `json:"status"` // "healthy" or "degraded"
	Details map[string]any `json:"details,omitempty"`
}

// Mode is a traffic mode (meri, raide, tie) mounted into the shared server.
// Each mode registers its routes under /api/<name>/ and reports its own health.
type Mode interface {
	Name() string
	Register(mux *http.ServeMux)
	Health(ctx context.Context) ModeHealth
}

// Handlers serves the global (mode-independent) endpoints.
type Handlers struct {
	cache cache.Cache
	modes []Mode
}

func NewHandlers(c cache.Cache, modes ...Mode) *Handlers {
	return &Handlers{cache: c, modes: modes}
}

type healthResponse struct {
	Status         string                `json:"status"`
	RedisConnected bool                  `json:"redis_connected"`
	UptimeSeconds  int64                 `json:"uptime_seconds"`
	Modes          map[string]ModeHealth `json:"modes"`
}

func (h *Handlers) Health(w http.ResponseWriter, r *http.Request) {
	redisConnected := h.cache.Ping(r.Context()) == nil

	res := healthResponse{
		Status:         "healthy",
		RedisConnected: redisConnected,
		UptimeSeconds:  int64(time.Since(startTime).Seconds()),
		Modes:          make(map[string]ModeHealth, len(h.modes)),
	}
	if !redisConnected {
		res.Status = "degraded"
	}
	for _, m := range h.modes {
		mh := m.Health(r.Context())
		res.Modes[m.Name()] = mh
		if mh.Status != "healthy" {
			res.Status = "degraded"
		}
	}

	w.Header().Set("Content-Type", "application/json")
	json.NewEncoder(w).Encode(res)
}

type versionResponse struct {
	Version   string `json:"version"`
	BuildDate string `json:"build_date"`
	GitCommit string `json:"git_sha"`
}

func (h *Handlers) VersionHandler(w http.ResponseWriter, r *http.Request) {
	res := versionResponse{
		Version:   Version,
		BuildDate: BuildDate,
		GitCommit: GitCommit,
	}
	w.Header().Set("Content-Type", "application/json")
	json.NewEncoder(w).Encode(res)
}

// NewRouter assembles the shared mux: global endpoints, each mode's routes
// under /api/<name>/, and the embedded frontend as the fallback.
func NewRouter(h *Handlers) *http.ServeMux {
	mux := http.NewServeMux()

	mux.HandleFunc("GET /api/health", h.Health)
	mux.HandleFunc("GET /api/version", h.VersionHandler)
	mux.Handle("GET /metrics", promhttp.Handler())

	for _, m := range h.modes {
		m.Register(mux)
	}

	mux.HandleFunc("/", ServeStatic)

	return mux
}
