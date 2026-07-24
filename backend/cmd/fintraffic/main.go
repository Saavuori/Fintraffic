package main

import (
	"context"
	"errors"
	"log"
	"net/http"
	"os"
	"os/signal"
	"syscall"
	"time"

	"fintraffic/internal/core/cache"
	"fintraffic/internal/core/config"
	"fintraffic/internal/core/server"
	"fintraffic/internal/meri"
	"fintraffic/internal/raide"
)

func main() {
	log.Println("Starting Fintraffic backend...")

	// 1. Load config
	cfg := config.LoadConfig()

	// 2. Initialize the shared live cache
	var liveCache cache.Cache
	if cfg.NoRedis {
		log.Println("Redis is disabled (--no-redis). Using in-memory cache.")
		liveCache = cache.NewMemoryCache()
	} else {
		log.Printf("Connecting to Redis at %s...\n", cfg.RedisURL)
		var err error
		liveCache, err = cache.NewRedisCache(cfg.RedisURL, meri.RedisHashKey)
		if err != nil {
			log.Printf("WARNING: Redis connection failed: %v. Falling back to in-memory cache.\n", err)
			liveCache = cache.NewMemoryCache()
		} else {
			log.Println("Connected to Redis successfully.")
		}
	}
	defer liveCache.Close()

	// 3. Context for background tasks lifecycle
	ctx, cancel := context.WithCancel(context.Background())
	defer cancel()

	// 4. Wire and start the traffic modes. Tie mounts here when it is ported.
	meriService := meri.NewService(cfg, liveCache)
	if err := meriService.Start(ctx); err != nil {
		log.Printf("ERROR starting meri mode: %v\n", err)
	}
	defer meriService.Stop()

	raideService := raide.NewService(liveCache)
	if err := raideService.Start(ctx); err != nil {
		log.Printf("ERROR starting raide mode: %v\n", err)
	}
	defer raideService.Stop()

	// 5. Assemble the shared router: global endpoints + each mode's routes.
	handlers := server.NewHandlers(liveCache, meriService, raideService)
	router := server.NewRouter(handlers)

	srv := &http.Server{
		Addr:    ":" + cfg.Port,
		Handler: router,
	}

	// 6. Handle OS shutdown signals for graceful termination
	shutdownChan := make(chan os.Signal, 1)
	signal.Notify(shutdownChan, os.Interrupt, syscall.SIGTERM)

	go func() {
		log.Printf("Listening on http://localhost:%s\n", cfg.Port)
		if err := srv.ListenAndServe(); err != nil && !errors.Is(err, http.ErrServerClosed) {
			log.Fatalf("Server listen failed: %v\n", err)
		}
	}()

	sig := <-shutdownChan
	log.Printf("Received signal: %s. Initiating graceful shutdown...\n", sig)

	shutdownCtx, shutdownCancel := context.WithTimeout(context.Background(), 10*time.Second)
	defer shutdownCancel()

	cancel()

	if err := srv.Shutdown(shutdownCtx); err != nil {
		log.Printf("Server shutdown error: %v\n", err)
	}

	log.Println("Fintraffic backend stopped.")
}
