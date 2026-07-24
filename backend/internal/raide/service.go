package raide

import (
	"context"
	"log"
	"net/http"
	"sync"
	"sync/atomic"
	"time"

	"fintraffic/internal/core/cache"
	"fintraffic/internal/core/server"
	"fintraffic/internal/core/upstream"
)

// Digitraffic's own recommendation for the location feed is ~once per few
// seconds over MQTT; polling REST every 10 s keeps the map lively without
// hammering them. Timetables (delays, tracks, estimates) move much slower, and
// the station register barely ever changes.
const (
	locationsInterval = 10 * time.Second
	liveInterval      = 60 * time.Second
	stationsInterval  = 6 * time.Hour
	retryInterval     = 30 * time.Second
)

// stationNames caches the code→name mapping for the merge/board helpers; it is
// refreshed by the stations poller and read by the locations poller.
type stationNames struct {
	mu    sync.RWMutex
	names map[string]string
}

func (s *stationNames) set(stations []Station) {
	names := make(map[string]string, len(stations))
	for _, st := range stations {
		names[st.Code] = st.Name
	}
	s.mu.Lock()
	s.names = names
	s.mu.Unlock()
}

func (s *stationNames) get() map[string]string {
	s.mu.RLock()
	defer s.mu.RUnlock()
	return s.names
}

// liveSnapshot mirrors the latest live-trains fetch for the locations poller,
// so the every-10-s merge never has to read the cache.
type liveSnapshot struct {
	mu     sync.RWMutex
	trains []LiveTrain
}

func (l *liveSnapshot) set(trains []LiveTrain) {
	l.mu.Lock()
	l.trains = trains
	l.mu.Unlock()
}

func (l *liveSnapshot) get() []LiveTrain {
	l.mu.RLock()
	defer l.mu.RUnlock()
	return l.trains
}

// Service is the raide (railway) mode: REST polling of rata.digitraffic.fi,
// GPS/timetable merging and station boards. It implements server.Mode.
type Service struct {
	client   *upstream.Client
	store    *Store
	handlers *Handlers

	names *stationNames
	live  *liveSnapshot

	// Health bookkeeping: unix seconds of the last successful poll per feed,
	// and the size of the last merged train set.
	lastLocations atomic.Int64
	activeTrains  atomic.Int64
}

func NewService(liveCache cache.Cache) *Service {
	store := NewStore(liveCache)
	return &Service{
		client:   upstream.NewClient(digitrafficBase),
		store:    store,
		handlers: NewHandlers(store),
		names:    &stationNames{},
		live:     &liveSnapshot{},
	}
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

func (s *Service) pollStations(ctx context.Context) {
	for {
		stations, err := fetchStations(ctx, s.client)
		if err != nil {
			log.Printf("Raide: error fetching stations: %v", err)
			if !sleepCtx(ctx, retryInterval) {
				return
			}
			continue
		}
		s.names.set(stations)
		s.store.SetStations(ctx, stations)
		log.Printf("Raide: cached %d stations", len(stations))
		if !sleepCtx(ctx, stationsInterval) {
			return
		}
	}
}

func (s *Service) pollLiveTrains(ctx context.Context) {
	for {
		trains, err := fetchLiveTrains(ctx, s.client)
		if err != nil {
			log.Printf("Raide: error fetching live trains: %v", err)
			if !sleepCtx(ctx, retryInterval) {
				return
			}
			continue
		}
		s.live.set(trains)
		s.store.SetLiveTrains(ctx, trains)
		if !sleepCtx(ctx, liveInterval) {
			return
		}
	}
}

func (s *Service) pollLocations(ctx context.Context) {
	logged := false
	for {
		locations, err := fetchTrainLocations(ctx, s.client)
		if err != nil {
			log.Printf("Raide: error fetching train locations: %v", err)
			if !sleepCtx(ctx, retryInterval) {
				return
			}
			continue
		}
		trains := MergeTrains(locations, s.live.get(), s.names.get())
		s.store.SetTrains(ctx, trains)
		s.lastLocations.Store(time.Now().Unix())
		s.activeTrains.Store(int64(len(trains)))
		if !logged {
			log.Printf("Raide: cached %d train positions", len(trains))
			logged = true
		}
		if !sleepCtx(ctx, locationsInterval) {
			return
		}
	}
}

// Start launches the three polling loops. They all stop when ctx is cancelled.
func (s *Service) Start(ctx context.Context) error {
	log.Println("Raide: starting rata.digitraffic.fi polling...")
	go s.pollStations(ctx)
	go s.pollLiveTrains(ctx)
	// Give the slower feeds a head start so the very first merge already has
	// timetables and station names to join against.
	go func() {
		if !sleepCtx(ctx, 3*time.Second) {
			return
		}
		s.pollLocations(ctx)
	}()
	return nil
}

func (s *Service) Stop() {}

// Name implements server.Mode.
func (s *Service) Name() string { return "raide" }

// Register mounts the raide routes under /api/raide/.
func (s *Service) Register(mux *http.ServeMux) {
	mux.HandleFunc("GET /api/raide/trains", s.handlers.Trains)
	mux.HandleFunc("GET /api/raide/stations", s.handlers.Stations)
	mux.HandleFunc("GET /api/raide/departures/{shortCode}", s.handlers.Board)
}

// Health implements server.Mode. The mode is healthy once the locations poll
// has succeeded recently; before the first success it reports degraded (cold
// start), which the frontend shows as a loading state.
func (s *Service) Health(ctx context.Context) server.ModeHealth {
	last := s.lastLocations.Load()
	age := int64(-1)
	if last > 0 {
		age = time.Now().Unix() - last
	}

	status := "healthy"
	// Degraded when we've never polled successfully, or the feed has been
	// failing for several cadences.
	if last == 0 || age > 60 {
		status = "degraded"
	}

	return server.ModeHealth{
		Status: status,
		Details: map[string]any{
			"active_trains":          s.activeTrains.Load(),
			"locations_poll_age_sec": age, // -1 until the first successful poll
		},
	}
}
