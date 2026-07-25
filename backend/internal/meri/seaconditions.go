package meri

import (
	"context"
	"encoding/json"
	"log"
	"net/http"
	"sync"
	"time"

	"fintraffic/internal/core/cache"
	"fintraffic/internal/meri/fmi"
)

const (
	seaConditionsKey = "fintraffic:meri:sea-conditions"

	// The TTL is generous next to the poll interval: it exists to stop truly
	// ancient readings being served forever if the poller dies, not to force
	// refreshes.
	seaConditionsTTL = 45 * time.Minute

	// The coastal stations report every 10 minutes, the wave buoys every 30.
	seaConditionsInterval = 10 * time.Minute
)

// ConditionsStore holds the latest FMI sea conditions snapshot. It follows the
// raide/tie pattern — the poller writes, the handler reads — with the shared
// cache as the primary home and an in-process copy so a Redis outage degrades
// to slightly stale data rather than an empty map.
type ConditionsStore struct {
	cache cache.Cache

	mu       sync.RWMutex
	fallback *fmi.Conditions
}

func NewConditionsStore(c cache.Cache) *ConditionsStore {
	return &ConditionsStore{cache: c}
}

func (s *ConditionsStore) Set(ctx context.Context, data fmi.Conditions) {
	s.mu.Lock()
	s.fallback = &data
	s.mu.Unlock()

	payload, err := json.Marshal(data)
	if err != nil {
		log.Printf("Meri: marshalling sea conditions failed: %v", err)
		return
	}
	if err := s.cache.SetValue(ctx, seaConditionsKey, payload, seaConditionsTTL); err != nil {
		log.Printf("Meri: caching sea conditions failed (memory fallback holds): %v", err)
	}
}

func (s *ConditionsStore) Get(ctx context.Context) (fmi.Conditions, bool) {
	if payload, err := s.cache.GetValue(ctx, seaConditionsKey); err == nil && payload != nil {
		var out fmi.Conditions
		if err := json.Unmarshal(payload, &out); err == nil {
			return out, true
		}
		log.Printf("Meri: cache returned unparseable sea conditions: %v", err)
	}

	s.mu.RLock()
	defer s.mu.RUnlock()
	if s.fallback == nil {
		return fmi.Conditions{}, false
	}
	return *s.fallback, true
}

// pollSeaConditions refreshes the snapshot immediately and then on a ticker
// until ctx is cancelled.
func pollSeaConditions(ctx context.Context, client *fmi.Client, store *ConditionsStore) {
	refresh := func() {
		fetchCtx, cancel := context.WithTimeout(ctx, 60*time.Second)
		defer cancel()

		data, err := client.Fetch(fetchCtx)
		if err != nil {
			log.Printf("Meri: sea conditions fetch failed: %v", err)
			return
		}
		// A partial result still gets stored — one dead source shouldn't blank
		// the whole layer — but it's worth a line in the log.
		for _, src := range data.Sources {
			if !src.OK {
				log.Printf("Meri: FMI source %q unavailable: %s", src.Key, src.Error)
			}
		}
		store.Set(ctx, data)
	}

	refresh()
	ticker := time.NewTicker(seaConditionsInterval)
	defer ticker.Stop()
	for {
		select {
		case <-ctx.Done():
			return
		case <-ticker.C:
			refresh()
		}
	}
}

// SeaConditions serves the FMI marine observations snapshot.
func (h *Handlers) SeaConditions(w http.ResponseWriter, r *http.Request) {
	data, ok := h.conditions.Get(r.Context())
	if !ok {
		// Nothing cached yet — the first poll hasn't finished, or every
		// source is down. Either way there is nothing to render.
		http.Error(w, `{"error":"sea conditions unavailable"}`, http.StatusServiceUnavailable)
		return
	}

	w.Header().Set("Content-Type", "application/json")
	// Half the poll interval: long enough to absorb a page refresh, short
	// enough that a browser never shows a reading the server has replaced.
	w.Header().Set("Cache-Control", "public, max-age=300")
	json.NewEncoder(w).Encode(data)
}
