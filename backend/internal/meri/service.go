package meri

import (
	"context"
	"encoding/json"
	"log"
	"net/http"
	"time"

	"fintraffic/internal/core/cache"
	"fintraffic/internal/core/config"
	"fintraffic/internal/core/server"
	"fintraffic/internal/core/upstream"
	"fintraffic/internal/meri/ais"
	"fintraffic/internal/meri/trail"
	"fintraffic/internal/meri/ws"
)

const digitrafficBase = "https://meri.digitraffic.fi"

// RedisHashKey is the meri mode's namespace in the shared Redis cache.
const RedisHashKey = "fintraffic:meri:positions"

// Service is the meri (marine vessel tracking) mode: AIS ingest over MQTT,
// live position cache, trail history, WebSocket hub and REST handlers.
// It implements server.Mode.
type Service struct {
	cfg      *config.Config
	cache    cache.Cache
	worker   *ais.IngestionWorker
	trail    *trail.Store
	hub      *ws.Hub
	handlers *Handlers
}

func NewService(cfg *config.Config, liveCache cache.Cache) *Service {
	// Trail history store (vessel track persistence). A nil store is a valid
	// no-op — recording is simply disabled.
	var trailStore *trail.Store
	if cfg.TrailDBPath == "" {
		log.Println("Meri: trail recording disabled (TRAIL_DB_PATH is empty).")
	} else {
		log.Printf("Meri: opening trail store at %s (retention %dd, interval %ds)...\n",
			cfg.TrailDBPath, cfg.TrailRetentionDays, cfg.TrailIntervalSec)
		var err error
		trailStore, err = trail.Open(cfg.TrailDBPath, cfg.TrailIntervalSec)
		if err != nil {
			log.Printf("WARNING: trail store open failed: %v. Trail recording disabled.\n", err)
			trailStore = nil
		}
	}

	worker := ais.NewIngestionWorker(cfg.MQTTBroker, liveCache)
	worker.SetTrailStore(trailStore)

	proxy := upstream.NewCachedProxy(upstream.NewClient(digitrafficBase))

	return &Service{
		cfg:      cfg,
		cache:    liveCache,
		worker:   worker,
		trail:    trailStore,
		hub:      ws.NewHub(liveCache),
		handlers: NewHandlers(liveCache, proxy, worker, trailStore),
	}
}

// Start launches the AIS ingest, REST hydration, WebSocket hub and the
// background cleanup/prune loops. They all stop when ctx is cancelled.
func (s *Service) Start(ctx context.Context) error {
	log.Printf("Meri: starting AIS ingestion from broker: %s...\n", s.cfg.MQTTBroker)
	if err := s.worker.Start(ctx); err != nil {
		log.Printf("ERROR starting AIS worker: %v\n", err)
	}

	// Hydrate the fleet from REST so the map isn't empty until slow AIS
	// reporters trickle in.
	go s.worker.Hydrate(ctx)

	go s.hub.Run(ctx)

	// Background stale vessel cleanup: ships at anchor report every 3-6 min,
	// so anything silent for 15 min is gone.
	go func() {
		ticker := time.NewTicker(60 * time.Second)
		defer ticker.Stop()
		for {
			select {
			case <-ctx.Done():
				return
			case <-ticker.C:
				cleanupStaleVessels(ctx, s.cache)
			}
		}
	}()

	// Background trail retention: prune points older than the retention window,
	// once at startup and then daily.
	go func() {
		ticker := time.NewTicker(24 * time.Hour)
		defer ticker.Stop()
		prune := func() {
			if s.trail == nil {
				return
			}
			before := time.Now().AddDate(0, 0, -s.cfg.TrailRetentionDays).Unix()
			pruneCtx, pruneCancel := context.WithTimeout(ctx, 5*time.Minute)
			defer pruneCancel()
			if n, err := s.trail.Prune(pruneCtx, before); err != nil {
				log.Printf("Trail prune error: %v\n", err)
			} else if n > 0 {
				log.Printf("Trail: pruned %d points older than %d days\n", n, s.cfg.TrailRetentionDays)
			}
		}
		prune()
		for {
			select {
			case <-ctx.Done():
				return
			case <-ticker.C:
				prune()
			}
		}
	}()

	return nil
}

func (s *Service) Stop() {
	s.worker.Stop()
	if s.trail != nil {
		s.trail.Close()
	}
}

// Name implements server.Mode.
func (s *Service) Name() string { return "meri" }

// Register mounts the meri routes under /api/meri/.
func (s *Service) Register(mux *http.ServeMux) {
	mux.HandleFunc("GET /api/meri/ports", s.handlers.Ports)
	mux.HandleFunc("GET /api/meri/port-calls/{locode}", s.handlers.PortCalls)
	mux.HandleFunc("GET /api/meri/vessel/{mmsi}", s.handlers.Vessel)
	mux.HandleFunc("GET /api/meri/vessel/{mmsi}/trail", s.handlers.VesselTrail)
	mux.HandleFunc("GET /api/meri/replay", s.handlers.FleetReplay)
	mux.HandleFunc("GET /api/meri/sea-state", s.handlers.SeaState)
	mux.HandleFunc("GET /api/meri/aton-faults", s.handlers.AtonFaults)
	mux.Handle("GET /api/meri/stream", s.hub)
}

// Health implements server.Mode.
func (s *Service) Health(ctx context.Context) server.ModeHealth {
	return s.handlers.Health(ctx)
}

func cleanupStaleVessels(ctx context.Context, c cache.Cache) {
	positions, err := c.GetAllPositions(ctx)
	if err != nil {
		log.Printf("Cleanup error getting positions: %v\n", err)
		return
	}

	now := time.Now().Unix()
	const staleThresholdSeconds = 900 // 15 minutes

	for mmsi, payload := range positions {
		var pos struct {
			Ts int64 `json:"ts"`
		}
		if err := json.Unmarshal(payload, &pos); err != nil {
			log.Printf("Cleanup error unmarshaling position for vessel %s: %v\n", mmsi, err)
			continue
		}

		if now-pos.Ts > staleThresholdSeconds {
			if err := c.DeletePosition(ctx, mmsi); err != nil {
				log.Printf("Cleanup error deleting stale vessel %s: %v\n", mmsi, err)
			}
		}
	}
}
