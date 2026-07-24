package raide

import (
	"context"
	"encoding/json"

	"fintraffic/internal/core/upstream"
)

const digitrafficBase = "https://rata.digitraffic.fi"

const (
	locationsPath  = "/api/v1/train-locations/latest"
	liveTrainsPath = "/api/v1/live-trains"
	stationsPath   = "/api/v1/metadata/stations"
)

// fetchJSON GETs a rata.digitraffic.fi path through the shared upstream client
// (which sets the Digitraffic-User header) and decodes the JSON body into out.
func fetchJSON(ctx context.Context, client *upstream.Client, path string, out any) error {
	body, err := client.Get(ctx, path)
	if err != nil {
		return err
	}
	return json.Unmarshal(body, out)
}

type rawStation struct {
	StationName      string  `json:"stationName"`
	StationShortCode string  `json:"stationShortCode"`
	Latitude         float64 `json:"latitude"`
	Longitude        float64 `json:"longitude"`
	PassengerTraffic bool    `json:"passengerTraffic"`
	Type             string  `json:"type"`
}

func fetchTrainLocations(ctx context.Context, client *upstream.Client) ([]TrainLocation, error) {
	var locations []TrainLocation
	if err := fetchJSON(ctx, client, locationsPath, &locations); err != nil {
		return nil, err
	}
	return locations, nil
}

// fetchLiveTrains returns every train Digitraffic considers "live" — running
// now, finished recently, or departing soon. Without parameters the endpoint
// covers the whole country in one ~300 KB response, which is exactly the
// granularity this app needs.
func fetchLiveTrains(ctx context.Context, client *upstream.Client) ([]LiveTrain, error) {
	var trains []LiveTrain
	if err := fetchJSON(ctx, client, liveTrainsPath, &trains); err != nil {
		return nil, err
	}
	return trains, nil
}

func fetchStations(ctx context.Context, client *upstream.Client) ([]Station, error) {
	var raw []rawStation
	if err := fetchJSON(ctx, client, stationsPath, &raw); err != nil {
		return nil, err
	}
	stations := make([]Station, 0, len(raw))
	for _, s := range raw {
		stations = append(stations, Station{
			Code:      s.StationShortCode,
			Name:      cleanStationName(s.StationName),
			Latitude:  s.Latitude,
			Longitude: s.Longitude,
			Passenger: s.PassengerTraffic,
			Major:     s.Type == "STATION",
		})
	}
	return stations, nil
}

// cleanStationName drops the " asema" suffix Digitraffic appends to a handful
// of station names ("Helsinki asema" → "Helsinki").
func cleanStationName(name string) string {
	const suffix = " asema"
	if len(name) > len(suffix) && name[len(name)-len(suffix):] == suffix {
		return name[:len(name)-len(suffix)]
	}
	return name
}
