package raide

import (
	"encoding/json"
	"net/http"
	"strings"
	"time"
)

// Handlers serves the raide-mode REST endpoints (trains, stations, boards).
type Handlers struct {
	store *Store
}

func NewHandlers(store *Store) *Handlers {
	return &Handlers{store: store}
}

func writeJSON(w http.ResponseWriter, value any) {
	w.Header().Set("Access-Control-Allow-Origin", "*")
	w.Header().Set("Content-Type", "application/json")
	json.NewEncoder(w).Encode(value)
}

// serviceUnavailable is the cold-start answer: no poll has succeeded yet. The
// frontend shows it as a loading state, not an error.
func serviceUnavailable(w http.ResponseWriter) {
	w.Header().Set("Access-Control-Allow-Origin", "*")
	http.Error(w, "data not available yet", http.StatusServiceUnavailable)
}

func (h *Handlers) Trains(w http.ResponseWriter, r *http.Request) {
	trains, ok := h.store.GetTrains(r.Context())
	if !ok {
		serviceUnavailable(w)
		return
	}
	writeJSON(w, trains)
}

func (h *Handlers) Stations(w http.ResponseWriter, r *http.Request) {
	stations, ok := h.store.GetStations(r.Context())
	if !ok {
		serviceUnavailable(w)
		return
	}
	writeJSON(w, stations)
}

// Board serves /api/raide/departures/{shortCode}, computed on demand from the
// cached live-trains snapshot — a visitor clicking stations never triggers an
// upstream request.
func (h *Handlers) Board(w http.ResponseWriter, r *http.Request) {
	station := strings.ToUpper(r.PathValue("shortCode"))
	if station == "" {
		http.NotFound(w, r)
		return
	}
	live, ok := h.store.GetLiveTrains(r.Context())
	if !ok {
		serviceUnavailable(w)
		return
	}
	stations, _ := h.store.GetStations(r.Context())
	names := make(map[string]string, len(stations))
	for _, s := range stations {
		names[s.Code] = s.Name
	}
	writeJSON(w, BuildBoard(station, live, names, time.Now()))
}
