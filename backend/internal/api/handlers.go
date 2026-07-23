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

	apiCache *ResponseCache
	sfGroup  *singleflight.Group
}

func NewHandlers(c cache.Cache, dt *DigitrafficClient, mqtt interface{ IsConnected() bool }) *Handlers {
	return &Handlers{
		cache:    c,
		dt:       dt,
		mqtt:     mqtt,
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
}

func (h *Handlers) Health(w http.ResponseWriter, r *http.Request) {
	redisConnected := h.cache.Ping(r.Context()) == nil
	mqttConnected := h.mqtt.IsConnected()

	activeVessels := 0
	if positions, err := h.cache.GetAllPositions(r.Context()); err == nil {
		activeVessels = len(positions)
	}

	res := HealthResponse{
		Status:         "healthy",
		MQTTConnected:  mqttConnected,
		RedisConnected: redisConnected,
		ActiveVessels:  activeVessels,
		UptimeSeconds:  int64(time.Since(startTime).Seconds()),
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

// SeaState proxies the sea state estimation (buoy) measurements.
func (h *Handlers) SeaState(w http.ResponseWriter, r *http.Request) {
	h.proxyCached(w, r, "sea-state", "/api/sse/v1/measurements", 15*time.Minute, nil)
}

// AtonFaults proxies aids-to-navigation faults.
func (h *Handlers) AtonFaults(w http.ResponseWriter, r *http.Request) {
	h.proxyCached(w, r, "aton-faults", "/api/aton/v1/faults", 5*time.Minute, nil)
}
