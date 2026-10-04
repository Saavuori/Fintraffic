package ilma

import (
	"encoding/json"
	"net/http"
	"strings"
	"time"
)

// Handlers serves the ilma-mode REST endpoints (aircraft, trails, airports).
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

func (h *Handlers) Aircraft(w http.ResponseWriter, r *http.Request) {
	aircraft, ok := h.store.GetAircraft(r.Context())
	if !ok {
		serviceUnavailable(w)
		return
	}
	writeJSON(w, Snapshot{Time: time.Now().UnixMilli(), Aircraft: aircraft})
}

// Trail serves /api/ilma/aircraft/{hex}/trail: the aircraft's last 30 minutes,
// oldest first. An aircraft that has only just appeared has an empty trail,
// not a 404.
func (h *Handlers) Trail(w http.ResponseWriter, r *http.Request) {
	hex := strings.ToLower(r.PathValue("hex"))
	if hex == "" {
		http.NotFound(w, r)
		return
	}
	points, _ := h.store.GetTrail(hex)
	if points == nil {
		points = []TrailPoint{}
	}
	writeJSON(w, points)
}

func (h *Handlers) Airports(w http.ResponseWriter, r *http.Request) {
	writeJSON(w, airports)
}
