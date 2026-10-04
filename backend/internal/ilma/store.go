package ilma

import (
	"context"
	"encoding/json"
	"log"
	"sync"
	"time"

	"fintraffic/internal/core/cache"
)

// Store stands between visitors and the ADS-B networks: the poller writes
// here, handlers read here, and nothing a visitor does triggers an upstream
// request. The aircraft snapshot lives in the shared cache (Redis or memory)
// and is mirrored in this process so a Redis outage degrades to "serving
// slightly stale data" rather than an error page. Trails are process memory
// only (see Trails).
type Store struct {
	cache  cache.Cache
	trails *Trails

	mu            sync.RWMutex
	aircraftFallb []Aircraft
}

const (
	aircraftKey = "fintraffic:ilma:aircraft"

	// Generous relative to the poll cadence — it exists to stop truly ancient
	// positions being served forever if the poller dies, and planes move fast
	// enough that anything older is misleading anyway.
	aircraftTTL = 2 * time.Minute
)

func NewStore(c cache.Cache) *Store {
	return &Store{cache: c, trails: NewTrails()}
}

func (s *Store) SetAircraft(ctx context.Context, aircraft []Aircraft) {
	s.mu.Lock()
	s.aircraftFallb = aircraft
	s.mu.Unlock()
	s.trails.Record(aircraft, time.Now())

	bytes, err := json.Marshal(aircraft)
	if err != nil {
		log.Printf("Ilma: marshal for %s failed: %v", aircraftKey, err)
		return
	}
	if err := s.cache.SetValue(ctx, aircraftKey, bytes, aircraftTTL); err != nil {
		log.Printf("Ilma: cache set failed for %s (memory fallback holds): %v", aircraftKey, err)
	}
}

func (s *Store) GetAircraft(ctx context.Context) ([]Aircraft, bool) {
	if bytes, err := s.cache.GetValue(ctx, aircraftKey); err == nil && bytes != nil {
		var out []Aircraft
		if err := json.Unmarshal(bytes, &out); err == nil {
			return out, true
		}
		log.Printf("Ilma: cache returned unparseable payload for %s", aircraftKey)
	}
	s.mu.RLock()
	defer s.mu.RUnlock()
	return s.aircraftFallb, s.aircraftFallb != nil
}

func (s *Store) GetTrail(hex string) ([]TrailPoint, bool) {
	return s.trails.Get(hex)
}
