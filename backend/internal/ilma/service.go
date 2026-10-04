package ilma

import (
	"context"
	"fmt"
	"log"
	"net/http"
	"strings"
	"sync/atomic"
	"time"

	"fintraffic/internal/core/cache"
	"fintraffic/internal/core/server"
)

const (
	// A jet covers 2 km in 10 s; the map dead-reckons between polls, so this
	// keeps it smooth while staying far inside both networks' rate limits.
	pollInterval  = 10 * time.Second
	retryInterval = 20 * time.Second
	// Spacing between the per-circle requests: both networks ask for at most
	// about one request per second.
	requestSpacing = 1100 * time.Millisecond
)

// Service is the ilma (air traffic) mode: polling community ADS-B networks for
// every aircraft over Finland, recording short trails, and serving a static
// airport register. It implements server.Mode.
type Service struct {
	store    *Store
	handlers *Handlers

	// Health bookkeeping: unix seconds of the last successful poll, the size
	// of the last snapshot, and which network answered it.
	lastPoll       atomic.Int64
	activeAircraft atomic.Int64
	lastSource     atomic.Value // string
}

func NewService(liveCache cache.Cache) *Service {
	store := NewStore(liveCache)
	s := &Service{store: store, handlers: NewHandlers(store)}
	s.lastSource.Store("")
	return s
}

// sleepCtx sleeps for d or until ctx is cancelled, reporting whether to keep
// running.
func sleepCtx(ctx context.Context, d time.Duration) bool {
	select {
	case <-ctx.Done():
		return false
	case <-time.After(d):
		return true
	}
}

// fetchAll queries every circle, falling back to the next network for a circle
// the previous one failed. It fails as a whole if any circle has no answer at
// all: publishing a partial snapshot would blank half the country for a poll.
func (s *Service) fetchAll(ctx context.Context) ([]Aircraft, string, error) {
	lists := make([][]Aircraft, 0, len(queryPoints))
	used := make([]string, 0, len(queryPoints))

	for i, p := range queryPoints {
		if i > 0 && !sleepCtx(ctx, requestSpacing) {
			return nil, "", ctx.Err()
		}
		var errs []string
		ok := false
		for _, src := range sources {
			raw, err := fetchPoint(ctx, src, p[0], p[1])
			if err != nil {
				errs = append(errs, err.Error())
				continue
			}
			fetched := time.Now()
			list := make([]Aircraft, 0, len(raw))
			for _, r := range raw {
				if a, keep := normalize(r, fetched); keep {
					list = append(list, a)
				}
			}
			lists = append(lists, list)
			used = append(used, src.name)
			ok = true
			break
		}
		if !ok {
			return nil, "", fmt.Errorf("circle %.1f,%.1f: %s", p[0], p[1], strings.Join(errs, "; "))
		}
	}
	return mergeAircraft(lists...), strings.Join(dedupe(used), "+"), nil
}

func dedupe(names []string) []string {
	var out []string
	seen := map[string]bool{}
	for _, n := range names {
		if !seen[n] {
			seen[n] = true
			out = append(out, n)
		}
	}
	return out
}

func (s *Service) pollAircraft(ctx context.Context) {
	logged := false
	for {
		aircraft, used, err := s.fetchAll(ctx)
		if err != nil {
			if ctx.Err() != nil {
				return
			}
			log.Printf("Ilma: error fetching aircraft: %v", err)
			if !sleepCtx(ctx, retryInterval) {
				return
			}
			continue
		}
		s.store.SetAircraft(ctx, aircraft)
		s.lastPoll.Store(time.Now().Unix())
		s.activeAircraft.Store(int64(len(aircraft)))
		if prev, _ := s.lastSource.Load().(string); prev != used {
			log.Printf("Ilma: positions now from %s", used)
		}
		s.lastSource.Store(used)
		if !logged {
			log.Printf("Ilma: cached %d aircraft", len(aircraft))
			logged = true
		}
		if !sleepCtx(ctx, pollInterval) {
			return
		}
	}
}

// Start launches the polling loop. It stops when ctx is cancelled.
func (s *Service) Start(ctx context.Context) error {
	log.Println("Ilma: starting ADS-B polling (adsb.fi, adsb.lol fallback)...")
	go s.pollAircraft(ctx)
	return nil
}

func (s *Service) Stop() {}

// Name implements server.Mode.
func (s *Service) Name() string { return "ilma" }

// Register mounts the ilma routes under /api/ilma/.
func (s *Service) Register(mux *http.ServeMux) {
	mux.HandleFunc("GET /api/ilma/aircraft", s.handlers.Aircraft)
	mux.HandleFunc("GET /api/ilma/aircraft/{hex}/trail", s.handlers.Trail)
	mux.HandleFunc("GET /api/ilma/airports", s.handlers.Airports)
}

// Health implements server.Mode. The mode is healthy once the aircraft poll
// has succeeded recently; before the first success it reports degraded (cold
// start), which the frontend shows as a loading state.
func (s *Service) Health(ctx context.Context) server.ModeHealth {
	last := s.lastPoll.Load()
	age := int64(-1)
	if last > 0 {
		age = time.Now().Unix() - last
	}

	status := "healthy"
	// Degraded when we've never polled successfully, or every network has
	// been failing for several cadences.
	if last == 0 || age > 60 {
		status = "degraded"
	}

	source, _ := s.lastSource.Load().(string)
	return server.ModeHealth{
		Status: status,
		Details: map[string]any{
			"active_aircraft":       s.activeAircraft.Load(),
			"aircraft_poll_age_sec": age, // -1 until the first successful poll
			"source":                source,
			"trails":                s.store.trails.Len(),
		},
	}
}
