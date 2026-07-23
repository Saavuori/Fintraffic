package main

import (
	"context"
	"encoding/json"
	"errors"
	"log"
	"net/http"
	"os"
	"os/signal"
	"syscall"
	"time"

	"marinetraffic/internal/ais"
	"marinetraffic/internal/api"
	"marinetraffic/internal/cache"
	"marinetraffic/internal/config"
	"marinetraffic/internal/trail"
	"marinetraffic/internal/ws"
)

func main() {
	log.Println("Starting Marinetraffic live vessel tracker backend...")

	// 1. Load config
	cfg := config.LoadConfig()

	// 2. Initialize Cache
	var liveCache cache.Cache
	if cfg.NoRedis {
		log.Println("Redis is disabled (--no-redis). Using in-memory cache.")
		liveCache = cache.NewMemoryCache()
	} else {
		log.Printf("Connecting to Redis at %s...\n", cfg.RedisURL)
		var err error
		liveCache, err = cache.NewRedisCache(cfg.RedisURL)
		if err != nil {
			log.Printf("WARNING: Redis connection failed: %v. Falling back to in-memory cache.\n", err)
			liveCache = cache.NewMemoryCache()
		} else {
			log.Println("Connected to Redis successfully.")
		}
	}
	defer liveCache.Close()

	// 3. Create context for background tasks lifecycle
	ctx, cancel := context.WithCancel(context.Background())
	defer cancel()

	// 3b. Initialize the trail history store (vessel track persistence).
	var trailStore *trail.Store
	if cfg.TrailDBPath == "" {
		log.Println("Trail recording disabled (TRAIL_DB_PATH is empty).")
	} else {
		log.Printf("Opening trail store at %s (retention %dd, interval %ds)...\n",
			cfg.TrailDBPath, cfg.TrailRetentionDays, cfg.TrailIntervalSec)
		var err error
		trailStore, err = trail.Open(cfg.TrailDBPath, cfg.TrailIntervalSec)
		if err != nil {
			log.Printf("WARNING: trail store open failed: %v. Trail recording disabled.\n", err)
			trailStore = nil
		} else {
			defer trailStore.Close()
		}
	}

	// 4. Initialize AIS ingestion worker (MQTT over WSS)
	log.Printf("Starting AIS ingestion from broker: %s...\n", cfg.MQTTBroker)
	aisWorker := ais.NewIngestionWorker(cfg.MQTTBroker, liveCache)
	aisWorker.SetTrailStore(trailStore)
	if err := aisWorker.Start(ctx); err != nil {
		log.Printf("ERROR starting AIS worker: %v\n", err)
	}
	defer aisWorker.Stop()

	// 5. Hydrate the fleet from REST so the map isn't empty until slow AIS
	// reporters trickle in.
	go aisWorker.Hydrate(ctx)

	// 6. Initialize WebSocket Hub
	wsHub := ws.NewHub(liveCache)
	go wsHub.Run(ctx)

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
				cleanupStaleVessels(ctx, liveCache)
			}
		}
	}()

	// Background trail retention: prune points older than the retention window,
	// once at startup and then daily.
	go func() {
		ticker := time.NewTicker(24 * time.Hour)
		defer ticker.Stop()
		prune := func() {
			if trailStore == nil {
				return
			}
			before := time.Now().AddDate(0, 0, -cfg.TrailRetentionDays).Unix()
			pruneCtx, pruneCancel := context.WithTimeout(ctx, 5*time.Minute)
			defer pruneCancel()
			if n, err := trailStore.Prune(pruneCtx, before); err != nil {
				log.Printf("Trail prune error: %v\n", err)
			} else if n > 0 {
				log.Printf("Trail: pruned %d points older than %d days\n", n, cfg.TrailRetentionDays)
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

	// 7. Setup REST handlers and Digitraffic proxy client
	dtClient := api.NewDigitrafficClient()
	handlers := api.NewHandlers(liveCache, dtClient, aisWorker, trailStore)

	// 8. Setup router
	router := api.NewRouter(handlers, wsHub)

	server := &http.Server{
		Addr:    ":" + cfg.Port,
		Handler: router,
	}

	// 9. Handle OS shutdown signals for graceful termination
	shutdownChan := make(chan os.Signal, 1)
	signal.Notify(shutdownChan, os.Interrupt, syscall.SIGTERM)

	go func() {
		log.Printf("Listening on http://localhost:%s\n", cfg.Port)
		if err := server.ListenAndServe(); err != nil && !errors.Is(err, http.ErrServerClosed) {
			log.Fatalf("Server listen failed: %v\n", err)
		}
	}()

	sig := <-shutdownChan
	log.Printf("Received signal: %s. Initiating graceful shutdown...\n", sig)

	shutdownCtx, shutdownCancel := context.WithTimeout(context.Background(), 10*time.Second)
	defer shutdownCancel()

	cancel()

	if err := server.Shutdown(shutdownCtx); err != nil {
		log.Printf("Server shutdown error: %v\n", err)
	}

	log.Println("Marinetraffic backend stopped.")
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
