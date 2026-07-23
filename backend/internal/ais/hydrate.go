package ais

import (
	"context"
	"encoding/json"
	"fmt"
	"io"
	"log"
	"net/http"
	"time"

	"marinetraffic/internal/config"
)

const restBase = "https://meri.digitraffic.fi"

// Hydrate fills the metadata map and cache from the Digitraffic REST API so
// the map is fully populated at startup instead of waiting for slow AIS
// reporters (anchored ships transmit only every few minutes). Errors are
// non-fatal: MQTT will fill the gaps eventually.
func (w *IngestionWorker) Hydrate(ctx context.Context) {
	start := time.Now()

	metaCount, err := w.hydrateMetadata(ctx)
	if err != nil {
		log.Printf("Hydration: metadata fetch failed (non-fatal): %v\n", err)
	}

	posCount, err := w.hydrateLocations(ctx)
	if err != nil {
		log.Printf("Hydration: locations fetch failed (non-fatal): %v\n", err)
	}

	log.Printf("Hydration complete: %d vessels with metadata, %d positions cached (%.1fs)\n",
		metaCount, posCount, time.Since(start).Seconds())
}

func (w *IngestionWorker) hydrateMetadata(ctx context.Context) (int, error) {
	body, err := fetchJSON(ctx, restBase+"/api/ais/v1/vessels")
	if err != nil {
		return 0, err
	}

	var vessels []mqttMetadata
	if err := json.Unmarshal(body, &vessels); err != nil {
		return 0, fmt.Errorf("unmarshal vessels: %w", err)
	}

	w.mu.Lock()
	for i := range vessels {
		v := &vessels[i]
		if v.MMSI == 0 {
			continue
		}
		// Don't clobber metadata that already arrived via MQTT (it is fresher).
		if _, exists := w.meta[v.MMSI]; !exists {
			w.meta[v.MMSI] = v.toMetadata()
		}
	}
	count := len(w.meta)
	w.mu.Unlock()

	return count, nil
}

type locationFeatureCollection struct {
	Features []struct {
		MMSI     int `json:"mmsi"`
		Geometry struct {
			Coordinates []float64 `json:"coordinates"` // [lon, lat]
		} `json:"geometry"`
		Properties struct {
			Sog               float64 `json:"sog"`
			Cog               float64 `json:"cog"`
			NavStat           int     `json:"navStat"`
			Rot               float64 `json:"rot"`
			Heading           int     `json:"heading"`
			TimestampExternal int64   `json:"timestampExternal"` // epoch ms
		} `json:"properties"`
	} `json:"features"`
}

func (w *IngestionWorker) hydrateLocations(ctx context.Context) (int, error) {
	body, err := fetchJSON(ctx, restBase+"/api/ais/v1/locations")
	if err != nil {
		return 0, err
	}

	var fc locationFeatureCollection
	if err := json.Unmarshal(body, &fc); err != nil {
		return 0, fmt.Errorf("unmarshal locations: %w", err)
	}

	count := 0
	for _, f := range fc.Features {
		if f.MMSI == 0 || len(f.Geometry.Coordinates) < 2 {
			continue
		}
		lon, lat := f.Geometry.Coordinates[0], f.Geometry.Coordinates[1]
		if !validCoords(lat, lon) {
			continue
		}

		pos := VesselPosition{
			MMSI:    f.MMSI,
			Lat:     lat,
			Lng:     lon,
			Sog:     f.Properties.Sog,
			Cog:     f.Properties.Cog,
			NavStat: f.Properties.NavStat,
			Rot:     f.Properties.Rot,
			Ts:      f.Properties.TimestampExternal / 1000,
		}
		if f.Properties.Heading >= 0 && f.Properties.Heading < 360 {
			h := f.Properties.Heading
			pos.Hdg = &h
		}

		w.mu.Lock()
		// Skip if MQTT already delivered a fresher fix for this vessel.
		if existing, ok := w.lastPos[f.MMSI]; ok && existing.Ts >= pos.Ts {
			w.mu.Unlock()
			continue
		}
		if m, ok := w.meta[f.MMSI]; ok {
			pos.applyMeta(m)
		}
		w.lastPos[f.MMSI] = pos
		w.mu.Unlock()

		w.writePosition(pos)
		count++
	}

	return count, nil
}

func fetchJSON(ctx context.Context, url string) ([]byte, error) {
	reqCtx, cancel := context.WithTimeout(ctx, 30*time.Second)
	defer cancel()

	req, err := http.NewRequestWithContext(reqCtx, http.MethodGet, url, nil)
	if err != nil {
		return nil, err
	}
	req.Header.Set("Digitraffic-User", config.DigitrafficUserAgent)

	resp, err := http.DefaultClient.Do(req)
	if err != nil {
		return nil, err
	}
	defer resp.Body.Close()

	if resp.StatusCode != http.StatusOK {
		return nil, fmt.Errorf("GET %s: status %d", url, resp.StatusCode)
	}

	return io.ReadAll(resp.Body)
}
