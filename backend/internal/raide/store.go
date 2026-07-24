package raide

import (
	"context"
	"encoding/json"
	"log"
	"sync"
	"time"

	"fintraffic/internal/core/cache"
)

// Store stands between visitors and Digitraffic: the pollers write here,
// handlers read here, and nothing a visitor does triggers an upstream request.
// Values live in the shared cache (Redis or memory) under raide-prefixed keys,
// and every value is additionally mirrored in this process so a Redis outage
// degrades to "serving slightly stale data" rather than an error page.
type Store struct {
	cache cache.Cache

	mu            sync.RWMutex
	trainsFallb   []Train
	stationsFallb []Station
	liveFallb     []LiveTrain
}

const (
	trainsKey   = "fintraffic:raide:trains"
	stationsKey = "fintraffic:raide:stations"
	liveKey     = "fintraffic:raide:livetrains"

	// TTLs are generous relative to the poll cadence — they exist to stop truly
	// ancient data being served forever if a poller dies, not to force
	// refreshes. The pollers own the refresh cadence.
	trainsTTL   = 10 * time.Minute
	stationsTTL = 7 * 24 * time.Hour
	liveTTL     = 30 * time.Minute
)

func NewStore(c cache.Cache) *Store {
	return &Store{cache: c}
}

func (s *Store) set(ctx context.Context, key string, value any, ttl time.Duration) {
	bytes, err := json.Marshal(value)
	if err != nil {
		log.Printf("Raide: marshal for %s failed: %v", key, err)
		return
	}
	if err := s.cache.SetValue(ctx, key, bytes, ttl); err != nil {
		log.Printf("Raide: cache set failed for %s (memory fallback holds): %v", key, err)
	}
}

func getJSON[T any](ctx context.Context, s *Store, key string) ([]T, bool) {
	bytes, err := s.cache.GetValue(ctx, key)
	if err != nil || bytes == nil {
		return nil, false
	}
	var out []T
	if err := json.Unmarshal(bytes, &out); err != nil {
		log.Printf("Raide: cache returned unparseable payload for %s: %v", key, err)
		return nil, false
	}
	return out, true
}

func (s *Store) SetTrains(ctx context.Context, trains []Train) {
	s.mu.Lock()
	s.trainsFallb = trains
	s.mu.Unlock()
	s.set(ctx, trainsKey, trains, trainsTTL)
}

func (s *Store) GetTrains(ctx context.Context) ([]Train, bool) {
	if trains, ok := getJSON[Train](ctx, s, trainsKey); ok {
		return trains, true
	}
	s.mu.RLock()
	defer s.mu.RUnlock()
	return s.trainsFallb, s.trainsFallb != nil
}

func (s *Store) SetStations(ctx context.Context, stations []Station) {
	s.mu.Lock()
	s.stationsFallb = stations
	s.mu.Unlock()
	s.set(ctx, stationsKey, stations, stationsTTL)
}

func (s *Store) GetStations(ctx context.Context) ([]Station, bool) {
	if stations, ok := getJSON[Station](ctx, s, stationsKey); ok {
		return stations, true
	}
	s.mu.RLock()
	defer s.mu.RUnlock()
	return s.stationsFallb, s.stationsFallb != nil
}

func (s *Store) SetLiveTrains(ctx context.Context, live []LiveTrain) {
	s.mu.Lock()
	s.liveFallb = live
	s.mu.Unlock()
	s.set(ctx, liveKey, live, liveTTL)
}

func (s *Store) GetLiveTrains(ctx context.Context) ([]LiveTrain, bool) {
	if live, ok := getJSON[LiveTrain](ctx, s, liveKey); ok {
		return live, true
	}
	s.mu.RLock()
	defer s.mu.RUnlock()
	return s.liveFallb, s.liveFallb != nil
}
