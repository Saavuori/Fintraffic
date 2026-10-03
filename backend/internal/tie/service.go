package tie

import (
	"context"
	"log"
	"net/http"
	"sync"
	"sync/atomic"
	"time"

	"fintraffic/internal/core/cache"
	"fintraffic/internal/core/server"
)

// Service is the tie (road traffic) mode: REST polling of the Digitraffic
// road APIs (TMS stations, traffic messages, variable signs, road weather,
// weathercams, maintenance vehicles) plus parking.fintraffic.fi and the AFIR charging network. It implements
// server.Mode.
type Service struct {
	store    *Store
	handlers *Handlers

	roadConstantsMu sync.RWMutex
	roadConstants   map[int]RoadConstants

	sensorMetaMu sync.RWMutex
	sensorMeta   map[int]SensorMeta

	// Health bookkeeping: unix seconds of the last successful TMS poll and the
	// size of the last combined station set.
	lastTMS        atomic.Int64
	activeStations atomic.Int64
	// Sizes of the last road-weather and maintenance snapshots, -1 until the
	// first successful poll.
	weatherStations     atomic.Int64
	maintenanceVehicles atomic.Int64
}

func NewService(liveCache cache.Cache) *Service {
	store := NewStore(liveCache)
	s := &Service{
		store:    store,
		handlers: NewHandlers(store),
	}
	s.weatherStations.Store(-1)
	s.maintenanceVehicles.Store(-1)
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

func (s *Service) refreshRoadConstants(ctx context.Context) {
	rc, err := FetchSensorConstants(ctx)
	if err != nil {
		log.Printf("Tie: error fetching sensor constants: %v", err)
		return
	}
	s.roadConstantsMu.Lock()
	s.roadConstants = rc
	s.roadConstantsMu.Unlock()
	log.Printf("Tie: refreshed road constants (bearing + free-flow speed) for %d stations", len(rc))
}

func (s *Service) refreshSensorMeta(ctx context.Context) {
	meta, err := FetchSensorMeta(ctx)
	if err != nil {
		log.Printf("Tie: error fetching sensor metadata: %v", err)
		return
	}
	s.sensorMetaMu.Lock()
	s.sensorMeta = meta
	s.sensorMetaMu.Unlock()
	log.Printf("Tie: refreshed sensor metadata (description + unit) for %d sensor types", len(meta))
}

func (s *Service) pollPOIs(ctx context.Context, cacheKey, url, label string) {
	for {
		data, err := FetchPOIs(ctx, url)
		if err != nil {
			log.Printf("Tie: error fetching %s: %v", label, err)
		} else {
			s.store.SetPOIs(ctx, cacheKey, data)
		}
		if !sleepCtx(ctx, 2*time.Minute) {
			return
		}
	}
}

// pollSpeedSigns keeps the variable speed-limit sign layer live. The displayed
// limits change with traffic/weather conditions, so poll on the same 1-min
// cadence as the TMS data.
func (s *Service) pollSpeedSigns(ctx context.Context) {
	for {
		signs, err := FetchVariableSpeedSigns(ctx)
		if err != nil {
			log.Printf("Tie: error fetching variable speed signs: %v", err)
		} else {
			s.store.SetSpeedSignData(ctx, signs)
		}
		if !sleepCtx(ctx, 1*time.Minute) {
			return
		}
	}
}

// pollWeather keeps both weather-backed layers live from one weather fetch: the
// road weather stations themselves, and the weather cameras, which carry no
// sensors of their own and are enriched with their nearest station's readings.
func (s *Service) pollWeather(ctx context.Context) {
	for {
		weatherStations, err := FetchWeatherStations(ctx)
		if err != nil {
			log.Printf("Tie: error fetching weather stations: %v", err)
		} else {
			s.store.SetRoadWeatherData(ctx, weatherStations)
			s.weatherStations.Store(int64(len(weatherStations)))
		}

		// If the weather fetch failed, still serve the cameras (just without
		// the weather summary).
		cameras, err := FetchWeathercamStations(ctx)
		if err != nil {
			log.Printf("Tie: error fetching weathercam stations: %v", err)
		} else {
			if weatherStations != nil {
				for i := range cameras {
					cameras[i].Weather = NearestWeatherObservation(
						cameras[i].Longitude, cameras[i].Latitude, weatherStations)
				}
			}
			s.store.SetWeathercamData(ctx, cameras)
		}

		// Camera presets rarely change, but road weather does; stations report
		// every few minutes.
		if !sleepCtx(ctx, 3*time.Minute) {
			return
		}
	}
}

// pollMaintenance keeps the maintenance-vehicle layer live. Vehicles report
// every few seconds to minutes and their points reach Digitraffic within a
// couple of minutes, so a 1-min cadence keeps the map close to the feed.
func (s *Service) pollMaintenance(ctx context.Context) {
	for {
		snap, err := FetchMaintenance(ctx, time.Now())
		if err != nil {
			log.Printf("Tie: error fetching maintenance tracking: %v", err)
		} else {
			s.store.SetMaintenanceData(ctx, snap)
			s.maintenanceVehicles.Store(int64(len(snap.Vehicles)))
		}
		if !sleepCtx(ctx, 1*time.Minute) {
			return
		}
	}
}

func (s *Service) pollParking(ctx context.Context) {
	for {
		facilities, err := FetchParkingFacilities(ctx)
		if err != nil {
			log.Printf("Tie: error fetching parking facilities: %v", err)
			if !sleepCtx(ctx, 30*time.Second) {
				return
			}
			continue
		}

		utilizations, err := FetchParkingUtilizations(ctx)
		if err != nil {
			log.Printf("Tie: error fetching parking utilizations: %v", err)
			if !sleepCtx(ctx, 30*time.Second) {
				return
			}
			continue
		}

		combined := make([]ParkingFacility, 0, len(facilities))
		for _, f := range facilities {
			if u, ok := utilizations[f.ID]; ok {
				available, open := u.SpacesAvailable, u.OpenNow
				f.SpacesAvailable = &available
				f.OpenNow = &open
				f.UpdatedAt = u.Timestamp
			}
			combined = append(combined, f)
		}

		s.store.SetParkingData(ctx, combined)

		if !sleepCtx(ctx, 2*time.Minute) {
			return
		}
	}
}

// pollCharging fetches AFIR EV-charging locations and merges live per-EVSE
// availability into each station, the same metadata+live-data shape as parking.
func (s *Service) pollCharging(ctx context.Context) {
	for {
		stations, err := FetchChargingLocations(ctx)
		if err != nil {
			log.Printf("Tie: error fetching charging locations: %v", err)
			if !sleepCtx(ctx, 30*time.Second) {
				return
			}
			continue
		}

		statuses, err := FetchChargingStatuses(ctx)
		if err != nil {
			log.Printf("Tie: error fetching charging statuses: %v", err)
			// Serve locations without availability rather than nothing.
			statuses = map[string]string{}
		}

		for i := range stations {
			var available, known int
			for _, id := range stations[i].EvseIDs {
				if st, ok := statuses[id]; ok {
					known++
					if st == "AVAILABLE" {
						available++
					}
				}
			}
			if known > 0 {
				stations[i].Available = &available
			}
		}

		s.store.SetChargingData(ctx, stations)

		if !sleepCtx(ctx, 5*time.Minute) {
			return
		}
	}
}

func (s *Service) pollTMS(ctx context.Context) {
	for {
		metadata, err := FetchTMSMetadata(ctx)
		if err != nil {
			log.Printf("Tie: error fetching TMS metadata: %v", err)
			if !sleepCtx(ctx, 30*time.Second) {
				return
			}
			continue
		}

		data, err := FetchTMSData(ctx)
		if err != nil {
			log.Printf("Tie: error fetching TMS data: %v", err)
			if !sleepCtx(ctx, 30*time.Second) {
				return
			}
			continue
		}

		s.roadConstantsMu.RLock()
		constants := s.roadConstants
		s.roadConstantsMu.RUnlock()

		s.sensorMetaMu.RLock()
		sensorDescriptions := s.sensorMeta
		s.sensorMetaMu.RUnlock()

		var combined []StationWithData
		for _, d := range data {
			meta, ok := metadata[d.ID]
			if !ok || len(meta.Geometry.Coordinates) < 2 {
				continue
			}

			sensorValues := d.SensorValues
			for i, sv := range sensorValues {
				if m, ok := sensorDescriptions[sv.ID]; ok {
					sensorValues[i].SensorValueDescriptionFI = m.DescriptionFI
					sensorValues[i].Unit = m.Unit
				}
			}

			station := StationWithData{
				ID:        d.ID,
				Name:      meta.Properties.Name,
				Longitude: meta.Geometry.Coordinates[0],
				Latitude:  meta.Geometry.Coordinates[1],
				Data:      sensorValues,
			}

			if c, ok := constants[d.ID]; ok {
				station.Bearing = c.Bearing
				station.FreeFlow1 = c.FreeFlow1
				station.FreeFlow2 = c.FreeFlow2
			}

			combined = append(combined, station)
		}

		s.store.SetTMSData(ctx, combined)
		s.lastTMS.Store(time.Now().Unix())
		s.activeStations.Store(int64(len(combined)))

		if !sleepCtx(ctx, 1*time.Minute) {
			return
		}
	}
}

// Start launches all polling loops. They all stop when ctx is cancelled.
func (s *Service) Start(ctx context.Context) error {
	log.Println("Tie: starting Digitraffic road-data polling...")

	// Road bearing / free-flow speed baseline and sensor descriptions change
	// rarely (seasonal at most), so refresh them once up front and then on a
	// slow, separate cadence.
	s.refreshRoadConstants(ctx)
	s.refreshSensorMeta(ctx)
	go func() {
		for {
			if !sleepCtx(ctx, 6*time.Hour) {
				return
			}
			s.refreshRoadConstants(ctx)
			s.refreshSensorMeta(ctx)
		}
	}()

	// Road works and traffic incidents.
	go s.pollPOIs(ctx, "roadworks", RoadworksURL, "road works")
	go s.pollPOIs(ctx, "incidents", IncidentsURL, "incidents")

	go s.pollSpeedSigns(ctx)
	go s.pollParking(ctx)
	go s.pollCharging(ctx)

	// Road weather stations, and the weather camera stations/presets they
	// enrich (image list, not the images themselves — the frontend fetches
	// those directly from weathercam.digitraffic.fi).
	go s.pollWeather(ctx)

	// Snowploughs, gritters and other road-maintenance vehicles.
	go s.pollMaintenance(ctx)

	// TMS traffic-measurement stations, the primary layer.
	go s.pollTMS(ctx)

	return nil
}

func (s *Service) Stop() {}

// Name implements server.Mode.
func (s *Service) Name() string { return "tie" }

// Register mounts the tie routes under /api/tie/.
func (s *Service) Register(mux *http.ServeMux) {
	mux.HandleFunc("GET /api/tie/tms", s.handlers.TMS)
	mux.HandleFunc("GET /api/tie/roadworks", s.handlers.POIs("roadworks"))
	mux.HandleFunc("GET /api/tie/incidents", s.handlers.POIs("incidents"))
	mux.HandleFunc("GET /api/tie/speedlimits", s.handlers.SpeedSigns)
	mux.HandleFunc("GET /api/tie/parking", s.handlers.Parking)
	mux.HandleFunc("GET /api/tie/weathercams", s.handlers.Weathercams)
	mux.HandleFunc("GET /api/tie/charging", s.handlers.Charging)
	mux.HandleFunc("GET /api/tie/weather", s.handlers.RoadWeather)
	mux.HandleFunc("GET /api/tie/maintenance", s.handlers.Maintenance)
}

// Health implements server.Mode. The mode is healthy once the TMS poll has
// succeeded recently; before the first success it reports degraded (cold
// start), which the frontend shows as a loading state.
func (s *Service) Health(ctx context.Context) server.ModeHealth {
	last := s.lastTMS.Load()
	age := int64(-1)
	if last > 0 {
		age = time.Now().Unix() - last
	}

	status := "healthy"
	// Degraded when we've never polled successfully, or the feed has been
	// failing for several cadences.
	if last == 0 || age > 300 {
		status = "degraded"
	}

	return server.ModeHealth{
		Status: status,
		Details: map[string]any{
			"active_stations":  s.activeStations.Load(),
			"tms_poll_age_sec": age, // -1 until the first successful poll
			// Both -1 until their first successful poll.
			"weather_stations":     s.weatherStations.Load(),
			"maintenance_vehicles": s.maintenanceVehicles.Load(),
		},
	}
}
