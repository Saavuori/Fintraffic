package meri

import (
	"context"
	"encoding/json"
	"fmt"
	"log"
	"net/http"
	"net/url"
	"strconv"
	"time"

	"fintraffic/internal/core/cache"
	"fintraffic/internal/core/server"
	"fintraffic/internal/core/upstream"
	"fintraffic/internal/meri/trail"
)

// Handlers serves the meri-mode REST endpoints (vessels, ports, sea state).
type Handlers struct {
	cache cache.Cache
	proxy *upstream.CachedProxy
	mqtt  interface {
		IsConnected() bool
	}
	trail *trail.Store // nil when trail recording is disabled; nil-safe
}

func NewHandlers(c cache.Cache, proxy *upstream.CachedProxy, mqtt interface{ IsConnected() bool }, tr *trail.Store) *Handlers {
	return &Handlers{
		cache: c,
		proxy: proxy,
		mqtt:  mqtt,
		trail: tr,
	}
}

// Health reports the meri mode's slice of the global health endpoint.
func (h *Handlers) Health(ctx context.Context) server.ModeHealth {
	mqttConnected := h.mqtt.IsConnected()

	activeVessels := 0
	if positions, err := h.cache.GetAllPositions(ctx); err == nil {
		activeVessels = len(positions)
	}

	// A nil trail store means recording is disabled (empty path or open failed).
	trailEnabled := h.trail != nil
	var trailPoints, trailAge int64 = 0, -1
	if trailEnabled {
		if count, newest, err := h.trail.Stats(ctx); err != nil {
			log.Printf("Trail stats error: %v\n", err)
		} else {
			trailPoints = count
			if newest > 0 {
				trailAge = time.Now().Unix() - newest
			}
		}
	}

	status := "healthy"
	if !mqttConnected {
		status = "degraded"
	}

	return server.ModeHealth{
		Status: status,
		Details: map[string]any{
			"mqtt_connected":          mqttConnected,
			"active_vessels":          activeVessels,
			"trail_enabled":           trailEnabled,
			"trail_points":            trailPoints,
			"trail_newest_ts_age_sec": trailAge, // seconds since newest point; -1 when none
		},
	}
}

// Ports returns Finnish ports (with coordinates) thinned from the huge
// world-wide Portnet location registry (~13 MB upstream).
func (h *Handlers) Ports(w http.ResponseWriter, r *http.Request) {
	h.proxy.Serve(w, r, "ports", "/api/port-call/v1/ports", 24*time.Hour, thinPorts)
}

type thinnedPort struct {
	Locode string  `json:"locode"`
	Name   string  `json:"name"`
	Lat    float64 `json:"lat"`
	Lng    float64 `json:"lng"`
}

func thinPorts(body []byte) ([]byte, error) {
	var raw struct {
		SsnLocations struct {
			Features []struct {
				Locode   string `json:"locode"`
				Geometry *struct {
					Coordinates []float64 `json:"coordinates"`
				} `json:"geometry"`
				Properties struct {
					LocationName string `json:"locationName"`
					Country      string `json:"country"`
				} `json:"properties"`
			} `json:"features"`
		} `json:"ssnLocations"`
	}
	if err := json.Unmarshal(body, &raw); err != nil {
		return nil, fmt.Errorf("unmarshal ports: %w", err)
	}

	ports := make([]thinnedPort, 0, 64)
	for _, f := range raw.SsnLocations.Features {
		if f.Properties.Country != "Finland" || f.Geometry == nil || len(f.Geometry.Coordinates) < 2 {
			continue
		}
		ports = append(ports, thinnedPort{
			Locode: f.Locode,
			Name:   f.Properties.LocationName,
			Lat:    f.Geometry.Coordinates[1],
			Lng:    f.Geometry.Coordinates[0],
		})
	}

	return json.Marshal(ports)
}

// PortCalls proxies port calls for one locode.
func (h *Handlers) PortCalls(w http.ResponseWriter, r *http.Request) {
	locode := r.PathValue("locode")
	if len(locode) != 5 {
		http.Error(w, `{"error":"invalid locode"}`, http.StatusBadRequest)
		return
	}
	path := "/api/port-call/v1/port-calls?locode=" + url.QueryEscape(locode)
	h.proxy.Serve(w, r, "port-calls:"+locode, path, 3*time.Minute, nil)
}

// Vessel returns upstream metadata for one vessel merged with its live
// position from the cache.
func (h *Handlers) Vessel(w http.ResponseWriter, r *http.Request) {
	mmsiStr := r.PathValue("mmsi")
	if _, err := strconv.Atoi(mmsiStr); err != nil {
		http.Error(w, `{"error":"invalid mmsi"}`, http.StatusBadRequest)
		return
	}

	var metadata json.RawMessage
	body, err := h.proxy.GetCached(r, "vessel:"+mmsiStr, "/api/ais/v1/vessels/"+mmsiStr, 10*time.Minute)
	if err != nil {
		log.Printf("Vessel metadata error for %s: %v\n", mmsiStr, err)
		metadata = json.RawMessage("null")
	} else {
		metadata = body
	}

	var position json.RawMessage = json.RawMessage("null")
	if positions, err := h.cache.GetAllPositions(r.Context()); err == nil {
		if pos, ok := positions[mmsiStr]; ok {
			position = pos
		}
	}

	w.Header().Set("Content-Type", "application/json")
	fmt.Fprintf(w, `{"metadata":%s,"position":%s}`, metadata, position)
}

// VesselTrail returns the recorded position history for one vessel as an array
// of [lng, lat, ts] tuples (ascending by time), ready to drop into a GeoJSON
// LineString. Query params: from, to (epoch seconds), maxPoints.
func (h *Handlers) VesselTrail(w http.ResponseWriter, r *http.Request) {
	mmsi, err := strconv.Atoi(r.PathValue("mmsi"))
	if err != nil {
		http.Error(w, `{"error":"invalid mmsi"}`, http.StatusBadRequest)
		return
	}

	now := time.Now().Unix()
	from := now - 24*3600 // default: last 24h
	to := now
	q := r.URL.Query()
	if v, err := strconv.ParseInt(q.Get("from"), 10, 64); err == nil && v > 0 {
		from = v
	}
	if v, err := strconv.ParseInt(q.Get("to"), 10, 64); err == nil && v > 0 {
		to = v
	}
	maxPoints := 1000
	if v, err := strconv.Atoi(q.Get("maxPoints")); err == nil && v > 0 {
		if v > 20000 {
			v = 20000
		}
		maxPoints = v
	}

	points, err := h.trail.Track(r.Context(), mmsi, from, to, maxPoints)
	if err != nil {
		log.Printf("Trail query error for %d: %v\n", mmsi, err)
		http.Error(w, `{"error":"trail query failed"}`, http.StatusInternalServerError)
		return
	}

	// Compact [lng, lat, ts] tuples.
	coords := make([][3]float64, 0, len(points))
	for _, p := range points {
		coords = append(coords, [3]float64{p.Lng, p.Lat, float64(p.Ts)})
	}

	w.Header().Set("Content-Type", "application/json")
	json.NewEncoder(w).Encode(struct {
		MMSI   int          `json:"mmsi"`
		Points [][3]float64 `json:"points"`
	}{MMSI: mmsi, Points: coords})
}

// Fleet replay bounds. The window is capped so a single response can't balloon
// (every active vessel contributes points), and the total row scan is bounded
// in the store.
const (
	replayMaxWindowSec  = 24 * 3600
	replayDefaultWindow = 3 * 3600
	replayPerVesselMax  = 600
	replayTotalCap      = 400_000
)

// FleetReplay returns the recorded tracks of ALL vessels within a time window,
// for the animated playback overlay. Vessels are keyed by MMSI; each track is
// an array of compact [lng, lat, ts, cog] tuples ascending by time. Query
// params: from, to (epoch seconds). The window is clamped to replayMaxWindowSec.
func (h *Handlers) FleetReplay(w http.ResponseWriter, r *http.Request) {
	now := time.Now().Unix()
	to := now
	from := now - replayDefaultWindow
	q := r.URL.Query()
	if v, err := strconv.ParseInt(q.Get("to"), 10, 64); err == nil && v > 0 {
		to = v
	}
	if v, err := strconv.ParseInt(q.Get("from"), 10, 64); err == nil && v > 0 {
		from = v
	}
	if from >= to {
		http.Error(w, `{"error":"from must be before to"}`, http.StatusBadRequest)
		return
	}
	// Clamp an over-wide window to the most recent replayMaxWindowSec.
	if to-from > replayMaxWindowSec {
		from = to - replayMaxWindowSec
	}

	tracks, truncated, err := h.trail.FleetTrack(r.Context(), from, to, replayPerVesselMax, replayTotalCap)
	if err != nil {
		log.Printf("Fleet replay query error: %v\n", err)
		http.Error(w, `{"error":"replay query failed"}`, http.StatusInternalServerError)
		return
	}

	// Compact [lng, lat, ts, cog] tuples, keyed by MMSI as a string so the
	// object is valid JSON.
	vessels := make(map[string][][4]float64, len(tracks))
	for mmsi, pts := range tracks {
		coords := make([][4]float64, 0, len(pts))
		for _, p := range pts {
			coords = append(coords, [4]float64{p.Lng, p.Lat, float64(p.Ts), p.Cog})
		}
		vessels[strconv.Itoa(mmsi)] = coords
	}

	w.Header().Set("Content-Type", "application/json")
	json.NewEncoder(w).Encode(struct {
		From      int64                   `json:"from"`
		To        int64                   `json:"to"`
		Truncated bool                    `json:"truncated"`
		Vessels   map[string][][4]float64 `json:"vessels"`
	}{From: from, To: to, Truncated: truncated, Vessels: vessels})
}

// SeaState proxies the sea state estimation (buoy) measurements.
func (h *Handlers) SeaState(w http.ResponseWriter, r *http.Request) {
	h.proxy.Serve(w, r, "sea-state", "/api/sse/v1/measurements", 15*time.Minute, nil)
}

// AtonFaults proxies aids-to-navigation faults.
func (h *Handlers) AtonFaults(w http.ResponseWriter, r *http.Request) {
	h.proxy.Serve(w, r, "aton-faults", "/api/aton/v1/faults", 5*time.Minute, nil)
}
