package tie

import (
	"encoding/json"
	"net/http"
)

// Handlers serves the tie-mode REST endpoints, reading only from the Store —
// nothing a visitor does triggers an upstream request.
type Handlers struct {
	store *Store
}

func NewHandlers(store *Store) *Handlers {
	return &Handlers{store: store}
}

// writeData writes the payload, or the cold-start answer (no poll has
// succeeded yet) which the frontend shows as a loading state.
func writeData(w http.ResponseWriter, data any, ok bool) {
	w.Header().Set("Access-Control-Allow-Origin", "*")
	w.Header().Set("Content-Type", "application/json")
	if !ok {
		http.Error(w, `{"error":"data not available yet"}`, http.StatusServiceUnavailable)
		return
	}
	json.NewEncoder(w).Encode(data)
}

func (h *Handlers) TMS(w http.ResponseWriter, r *http.Request) {
	data, ok := h.store.GetTMSData(r.Context())
	writeData(w, data, ok)
}

func (h *Handlers) POIs(cacheKey string) http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		data, ok := h.store.GetPOIs(r.Context(), cacheKey)
		writeData(w, data, ok)
	}
}

func (h *Handlers) SpeedSigns(w http.ResponseWriter, r *http.Request) {
	data, ok := h.store.GetSpeedSignData(r.Context())
	writeData(w, data, ok)
}

func (h *Handlers) Parking(w http.ResponseWriter, r *http.Request) {
	data, ok := h.store.GetParkingData(r.Context())
	writeData(w, data, ok)
}

func (h *Handlers) Weathercams(w http.ResponseWriter, r *http.Request) {
	data, ok := h.store.GetWeathercamData(r.Context())
	writeData(w, data, ok)
}

func (h *Handlers) Charging(w http.ResponseWriter, r *http.Request) {
	data, ok := h.store.GetChargingData(r.Context())
	writeData(w, data, ok)
}
