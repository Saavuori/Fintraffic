package api

import (
	"net/http"

	"github.com/prometheus/client_golang/prometheus/promhttp"
	"marinetraffic/internal/ws"
)

func NewRouter(h *Handlers, hub *ws.Hub) *http.ServeMux {
	mux := http.NewServeMux()

	// REST API Endpoints
	mux.HandleFunc("GET /api/v1/health", h.Health)
	mux.HandleFunc("GET /api/v1/version", h.Version)
	mux.HandleFunc("GET /api/v1/ports", h.Ports)
	mux.HandleFunc("GET /api/v1/port-calls/{locode}", h.PortCalls)
	mux.HandleFunc("GET /api/v1/vessel/{mmsi}", h.Vessel)
	mux.HandleFunc("GET /api/v1/vessel/{mmsi}/trail", h.VesselTrail)
	mux.HandleFunc("GET /api/v1/sea-state", h.SeaState)
	mux.HandleFunc("GET /api/v1/aton-faults", h.AtonFaults)

	// Metrics Endpoint
	mux.Handle("GET /metrics", promhttp.Handler())

	// WebSocket Streaming Endpoint
	mux.Handle("GET /api/v1/stream", hub)

	// Static Frontend fallback
	mux.HandleFunc("/", ServeStatic)

	return mux
}
