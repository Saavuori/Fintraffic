package tie

import (
	"context"
	"encoding/json"
	"log"
	"sync"
	"time"

	"fintraffic/internal/core/cache"
)

// Store stands between visitors and Digitraffic: the pollers write here,
// handlers read here. Values live in the shared cache (Redis or memory) under
// tie-prefixed keys, and every value is additionally mirrored in this process
// so a Redis outage degrades to "serving slightly stale data" rather than an
// error page.
type Store struct {
	cache cache.Cache

	mu                 sync.RWMutex
	tmsFallback        []StationWithData
	poiFallback        map[string]POICollection
	parkingFallback    []ParkingFacility
	weathercamFallback []WeathercamStation
	chargingFallback   []ChargingStation
	speedSignFallback  []VariableSpeedSign
}

const (
	tmsKey        = "fintraffic:tie:tms"
	poiKeyPrefix  = "fintraffic:tie:poi:" // + "roadworks" | "incidents"
	parkingKey    = "fintraffic:tie:parking"
	weathercamKey = "fintraffic:tie:weathercams"
	chargingKey   = "fintraffic:tie:charging"
	speedSignKey  = "fintraffic:tie:speedsigns"

	// TTLs are generous relative to the poll cadence — they exist to stop truly
	// ancient data being served forever if a poller dies, not to force refreshes.
	tmsTTL        = 5 * time.Minute
	poiTTL        = 10 * time.Minute
	parkingTTL    = 5 * time.Minute
	weathercamTTL = 30 * time.Minute
	chargingTTL   = 15 * time.Minute
	speedSignTTL  = 10 * time.Minute
)

func NewStore(c cache.Cache) *Store {
	return &Store{
		cache:       c,
		poiFallback: make(map[string]POICollection),
	}
}

func (s *Store) set(ctx context.Context, key string, value any, ttl time.Duration) {
	bytes, err := json.Marshal(value)
	if err != nil {
		log.Printf("Tie: marshal for %s failed: %v", key, err)
		return
	}
	if err := s.cache.SetValue(ctx, key, bytes, ttl); err != nil {
		log.Printf("Tie: cache set failed for %s (memory fallback holds): %v", key, err)
	}
}

func getJSON[T any](ctx context.Context, s *Store, key string) (T, bool) {
	var out T
	bytes, err := s.cache.GetValue(ctx, key)
	if err != nil || bytes == nil {
		return out, false
	}
	if err := json.Unmarshal(bytes, &out); err != nil {
		log.Printf("Tie: cache returned unparseable payload for %s: %v", key, err)
		return out, false
	}
	return out, true
}

func (s *Store) SetTMSData(ctx context.Context, data []StationWithData) {
	s.mu.Lock()
	s.tmsFallback = data
	s.mu.Unlock()
	s.set(ctx, tmsKey, data, tmsTTL)
}

func (s *Store) GetTMSData(ctx context.Context) ([]StationWithData, bool) {
	if data, ok := getJSON[[]StationWithData](ctx, s, tmsKey); ok {
		return data, true
	}
	s.mu.RLock()
	defer s.mu.RUnlock()
	return s.tmsFallback, s.tmsFallback != nil
}

func (s *Store) SetPOIs(ctx context.Context, key string, data POICollection) {
	s.mu.Lock()
	s.poiFallback[key] = data
	s.mu.Unlock()
	s.set(ctx, poiKeyPrefix+key, data, poiTTL)
}

func (s *Store) GetPOIs(ctx context.Context, key string) (POICollection, bool) {
	if data, ok := getJSON[POICollection](ctx, s, poiKeyPrefix+key); ok {
		return data, true
	}
	s.mu.RLock()
	defer s.mu.RUnlock()
	data, ok := s.poiFallback[key]
	return data, ok
}

func (s *Store) SetParkingData(ctx context.Context, data []ParkingFacility) {
	s.mu.Lock()
	s.parkingFallback = data
	s.mu.Unlock()
	s.set(ctx, parkingKey, data, parkingTTL)
}

func (s *Store) GetParkingData(ctx context.Context) ([]ParkingFacility, bool) {
	if data, ok := getJSON[[]ParkingFacility](ctx, s, parkingKey); ok {
		return data, true
	}
	s.mu.RLock()
	defer s.mu.RUnlock()
	return s.parkingFallback, s.parkingFallback != nil
}

func (s *Store) SetWeathercamData(ctx context.Context, data []WeathercamStation) {
	s.mu.Lock()
	s.weathercamFallback = data
	s.mu.Unlock()
	s.set(ctx, weathercamKey, data, weathercamTTL)
}

func (s *Store) GetWeathercamData(ctx context.Context) ([]WeathercamStation, bool) {
	if data, ok := getJSON[[]WeathercamStation](ctx, s, weathercamKey); ok {
		return data, true
	}
	s.mu.RLock()
	defer s.mu.RUnlock()
	return s.weathercamFallback, s.weathercamFallback != nil
}

func (s *Store) SetChargingData(ctx context.Context, data []ChargingStation) {
	s.mu.Lock()
	s.chargingFallback = data
	s.mu.Unlock()
	s.set(ctx, chargingKey, data, chargingTTL)
}

func (s *Store) GetChargingData(ctx context.Context) ([]ChargingStation, bool) {
	if data, ok := getJSON[[]ChargingStation](ctx, s, chargingKey); ok {
		return data, true
	}
	s.mu.RLock()
	defer s.mu.RUnlock()
	return s.chargingFallback, s.chargingFallback != nil
}

func (s *Store) SetSpeedSignData(ctx context.Context, data []VariableSpeedSign) {
	s.mu.Lock()
	s.speedSignFallback = data
	s.mu.Unlock()
	s.set(ctx, speedSignKey, data, speedSignTTL)
}

func (s *Store) GetSpeedSignData(ctx context.Context) ([]VariableSpeedSign, bool) {
	if data, ok := getJSON[[]VariableSpeedSign](ctx, s, speedSignKey); ok {
		return data, true
	}
	s.mu.RLock()
	defer s.mu.RUnlock()
	return s.speedSignFallback, s.speedSignFallback != nil
}
