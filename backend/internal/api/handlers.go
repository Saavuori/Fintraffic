package api

import (
	"encoding/json"
	"fmt"
	"log"
	"net/http"
	"net/url"
	"strconv"
	"sync"
	"time"

	"golang.org/x/sync/singleflight"
	"marinetraffic/internal/cache"
	"marinetraffic/internal/trail"
)

var (
	Version   = "dev"
	BuildDate = "unknown"
	GitCommit = "unknown"
)

var startTime = time.Now()

// responseCacheItem represents a cached HTTP response payload
type responseCacheItem struct {
	data      []byte
	expiresAt time.Time
}

// ResponseCache is a thread-safe in-memory cache for API payloads
type ResponseCache struct {
	mu    sync.RWMutex
	items map[string]responseCacheItem
}

func NewResponseCache() *ResponseCache {
	return &ResponseCache{
		items: make(map[string]responseCacheItem),
	}
}

func (c *ResponseCache) Get(key string) ([]byte, bool) {
	c.mu.RLock()
	defer c.mu.RUnlock()
	item, ok := c.items[key]
	if !ok || time.Now().After(item.expiresAt) {
		return nil, false
	}
	return item.data, true
}

func (c *ResponseCache) Set(key string, data []byte, ttl time.Duration) {
	c.mu.Lock()
	defer c.mu.Unlock()
	c.items[key] = responseCacheItem{
		data:      data,
		expiresAt: time.Now().Add(ttl),
	}
}

type Handlers struct {
	cache cache.Cache
	dt    *DigitrafficClient
	mqtt  interface {
		IsConnected() bool
	}
	trail *trail.Store // nil when trail recording is disabled; nil-safe

	apiCache *ResponseCache
	sfGroup  *singleflight.Group
}

func NewHandlers(c cache.Cache, dt *DigitrafficClient, mqtt interface{ IsConnected() bool }, tr *trail.Store) *Handlers {
	return &Handlers{
		cache:    c,
		dt:       dt,
		mqtt:     mqtt,
		trail:    tr,
		apiCache: NewResponseCache(),
		sfGroup:  &singleflight.Group{},
	}
}

// Health Response
type HealthResponse struct {
	Status         string `json:"status"`
	MQTTConnected  bool   `json:"mqtt_connected"`
	RedisConnected bool   `json:"redis_connected"`
	ActiveVessels  int    `json:"active_vessels"`
	UptimeSeconds  int64  `json:"uptime_seconds"`
	// Trail-recording visibility, so a silently-disabled store is diagnosable
	// from a health check instead of only the startup log.
	TrailEnabled     bool  `json:"trail_enabled"`
	TrailPoints      int64 `json:"trail_points"`
	TrailNewestTsAge int64 `json:"trail_newest_ts_age_sec"` // seconds since newest point; -1 when none
}

func (h *Handlers) Health(w http.ResponseWriter, r *http.Request) {
	redisConnected := h.cache.Ping(r.Context()) == nil
	mqttConnected := h.mqtt.IsConnected()

	activeVessels := 0
	if positions, err := h.cache.GetAllPositions(r.Context()); err == nil {
		activeVessels = len(positions)
	}

	// A nil trail store means recording is disabled (empty path or open failed).
	trailEnabled := h.trail != nil
	var trailPoints, trailAge int64 = 0, -1
	if trailEnabled {
		if count, newest, err := h.trail.Stats(r.Context()); err != nil {
			log.Printf("Trail stats error: %v\n", err)
		} else {
			trailPoints = count
			if newest > 0 {
				trailAge = time.Now().Unix() - newest
			}
		}
	}

	res := HealthResponse{
		Status:           "healthy",
		MQTTConnected:    mqttConnected,
		RedisConnected:   redisConnected,
		ActiveVessels:    activeVessels,
		UptimeSeconds:    int64(time.Since(startTime).Seconds()),
		TrailEnabled:     trailEnabled,
		TrailPoints:      trailPoints,
		TrailNewestTsAge: trailAge,
	}

	if !redisConnected || !mqttConnected {
		res.Status = "degraded"
	}

	w.Header().Set("Content-Type", "application/json")
	json.NewEncoder(w).Encode(res)
}

// Version Response
type VersionResponse struct {
	Version   string `json:"version"`
	BuildDate string `json:"build_date"`
	GitCommit string `json:"git_sha"`
}

func (h *Handlers) Version(w http.ResponseWriter, r *http.Request) {
	res := VersionResponse{
		Version:   Version,
		BuildDate: BuildDate,
		GitCommit: GitCommit,
	}
	w.Header().Set("Content-Type", "application/json")
	json.NewEncoder(w).Encode(res)
}

// proxyCached serves a cached-or-fetched upstream payload with singleflight
// request coalescing. transform (optional) rewrites the upstream body before
// caching, e.g. to thin a huge payload.
func (h *Handlers) proxyCached(w http.ResponseWriter, r *http.Request, key, upstreamPath string, ttl time.Duration, transform func([]byte) ([]byte, error)) {
	if cached, ok := h.apiCache.Get(key); ok {
		w.Header().Set("Content-Type", "application/json")
		w.Write(cached)
		return
	}

	dataInterface, err, _ := h.sfGroup.Do(key, func() (interface{}, error) {
		// Double-check cache inside singleflight
		if cached, ok := h.apiCache.Get(key); ok {
			return cached, nil
		}

		body, err := h.dt.Get(r.Context(), upstreamPath)
		if err != nil {
			return nil, err
		}

		if transform != nil {
			body, err = transform(body)
			if err != nil {
				return nil, err
			}
		}

		h.apiCache.Set(key, body, ttl)
		return body, nil
	})

	if err != nil {
		log.Printf("Proxy error for %s: %v\n", key, err)
		http.Error(w, `{"error":"upstream request failed"}`, http.StatusBadGateway)
		return
	}

	w.Header().Set("Content-Type", "application/json")
	w.Write(dataInterface.([]byte))
}

// Ports returns Finnish ports (with coordinates) thinned from the huge
// world-wide Portnet location registry (~13 MB upstream).
func (h *Handlers) Ports(w http.ResponseWriter, r *http.Request) {
	h.proxyCached(w, r, "ports", "/api/port-call/v1/ports", 24*time.Hour, thinPorts)
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
	h.proxyCached(w, r, "port-calls:"+locode, path, 3*time.Minute, nil)
}

// Vessel returns upstream metadata for one vessel merged with its live
// position from the cache.
func (h *Handlers) Vessel(w http.ResponseWriter, r *http.Request) {
	mmsiStr := r.PathValue("mmsi")
	if _, err := strconv.Atoi(mmsiStr); err != nil {
		http.Error(w, `{"error":"invalid mmsi"}`, http.StatusBadRequest)
		return
	}

	key := "vessel:" + mmsiStr
	var metadata json.RawMessage

	if cached, ok := h.apiCache.Get(key); ok {
		metadata = cached
	} else {
		dataInterface, err, _ := h.sfGroup.Do(key, func() (interface{}, error) {
			if cached, ok := h.apiCache.Get(key); ok {
				return cached, nil
			}
			body, err := h.dt.Get(r.Context(), "/api/ais/v1/vessels/"+mmsiStr)
			if err != nil {
				return nil, err
			}
			h.apiCache.Set(key, body, 10*time.Minute)
			return body, nil
		})
		if err != nil {
			log.Printf("Vessel metadata error for %s: %v\n", mmsiStr, err)
			metadata = json.RawMessage("null")
		} else {
			metadata = dataInterface.([]byte)
		}
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
	h.proxyCached(w, r, "sea-state", "/api/sse/v1/measurements", 15*time.Minute, nil)
}

// AtonFaults proxies aids-to-navigation faults.
func (h *Handlers) AtonFaults(w http.ResponseWriter, r *http.Request) {
	h.proxyCached(w, r, "aton-faults", "/api/aton/v1/faults", 5*time.Minute, nil)
}
