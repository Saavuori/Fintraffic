package tie

import (
	"context"
	"math"
)

const (
	weatherStationsURL = "https://tie.digitraffic.fi/api/weather/v1/stations"
	weatherDataURL     = "https://tie.digitraffic.fi/api/weather/v1/stations/data"
)

// curatedWeatherSensors is the ordered set of road-weather sensors surfaced on a
// camera screen. Digitraffic reuses ambiguous shortNames, so sensors are matched
// by stable numeric id (same rule as the TMS speed/volume sensors). The label is
// an English display name since the coded Finnish descriptions only exist for a
// few enumerated sensors (e.g. road condition).
var curatedWeatherSensors = []struct {
	id    int
	label string
}{
	{1, "Air temperature"},
	{3, "Road surface temp"},
	{21, "Humidity"},
	{16, "Wind speed"},
	{23, "Precipitation"},
	{27, "Road condition"},
	{26, "Visibility"},
}

// WeatherStationObs is a road weather station's location plus its curated current
// readings, used to find the nearest station to each weather camera.
type WeatherStationObs struct {
	ID           int
	Name         string
	Longitude    float64
	Latitude     float64
	MeasuredTime string
	Readings     []WeatherReading
}

type rawWeatherStationProperties struct {
	ID   int    `json:"id"`
	Name string `json:"name"`
}

type rawWeatherStationFeature struct {
	Geometry   Geometry                    `json:"geometry"`
	Properties rawWeatherStationProperties `json:"properties"`
}

type rawWeatherStationsCollection struct {
	Features []rawWeatherStationFeature `json:"features"`
}

type rawWeatherSensorValue struct {
	ID                       int     `json:"id"`
	Value                    float64 `json:"value"`
	Unit                     string  `json:"unit"`
	MeasuredTime             string  `json:"measuredTime"`
	SensorValueDescriptionFi string  `json:"sensorValueDescriptionFi"`
}

type rawWeatherStationData struct {
	ID           int                     `json:"id"`
	SensorValues []rawWeatherSensorValue `json:"sensorValues"`
}

type rawWeatherDataResponse struct {
	Stations []rawWeatherStationData `json:"stations"`
}

// FetchWeatherStations fetches all road weather stations and merges each
// station's location metadata with its live curated sensor readings, mirroring
// the metadata+data merge used for TMS and parking. Stations without location or
// without any curated reading are skipped.
func FetchWeatherStations(ctx context.Context) ([]WeatherStationObs, error) {
	var meta rawWeatherStationsCollection
	if err := fetchJSON(ctx, weatherStationsURL, &meta); err != nil {
		return nil, err
	}

	var data rawWeatherDataResponse
	if err := fetchJSON(ctx, weatherDataURL, &data); err != nil {
		return nil, err
	}

	dataByID := make(map[int]rawWeatherStationData, len(data.Stations))
	for _, s := range data.Stations {
		dataByID[s.ID] = s
	}

	stations := make([]WeatherStationObs, 0, len(meta.Features))
	for _, f := range meta.Features {
		if len(f.Geometry.Coordinates) < 2 {
			continue
		}
		sd, ok := dataByID[f.Properties.ID]
		if !ok {
			continue
		}

		byID := make(map[int]rawWeatherSensorValue, len(sd.SensorValues))
		for _, sv := range sd.SensorValues {
			byID[sv.ID] = sv
		}

		var measuredTime string
		readings := make([]WeatherReading, 0, len(curatedWeatherSensors))
		for _, c := range curatedWeatherSensors {
			sv, ok := byID[c.id]
			if !ok {
				continue
			}
			if measuredTime == "" {
				measuredTime = sv.MeasuredTime
			}
			readings = append(readings, WeatherReading{
				Label:       c.label,
				Value:       sv.Value,
				Unit:        cleanWeatherUnit(sv.Unit),
				Description: sv.SensorValueDescriptionFi,
			})
		}
		if len(readings) == 0 {
			continue
		}

		stations = append(stations, WeatherStationObs{
			ID:           f.Properties.ID,
			Name:         f.Properties.Name,
			Longitude:    f.Geometry.Coordinates[0],
			Latitude:     f.Geometry.Coordinates[1],
			MeasuredTime: measuredTime,
			Readings:     readings,
		})
	}
	return stations, nil
}

// cleanWeatherUnit drops Digitraffic's placeholder units (e.g. "***", "///",
// "???", "###") used for enumerated/coded sensors, whose meaning is carried by
// the textual description instead.
func cleanWeatherUnit(unit string) string {
	switch unit {
	case "***", "///", "???", "###", "":
		return ""
	default:
		return unit
	}
}

// NearestWeatherObservation returns a compact weather summary from the station in
// stations closest to (lon, lat), or nil if stations is empty. Distances use the
// haversine formula; at Finland's latitudes this is accurate enough to pick the
// nearest of a few hundred stations.
func NearestWeatherObservation(lon, lat float64, stations []WeatherStationObs) *WeatherObservation {
	var best *WeatherStationObs
	bestDist := math.MaxFloat64
	for i := range stations {
		d := haversineKm(lat, lon, stations[i].Latitude, stations[i].Longitude)
		if d < bestDist {
			bestDist = d
			best = &stations[i]
		}
	}
	if best == nil {
		return nil
	}
	return &WeatherObservation{
		StationID:    best.ID,
		StationName:  best.Name,
		DistanceKm:   math.Round(bestDist*10) / 10,
		MeasuredTime: best.MeasuredTime,
		Readings:     best.Readings,
	}
}

func haversineKm(lat1, lon1, lat2, lon2 float64) float64 {
	const earthRadiusKm = 6371.0
	dLat := (lat2 - lat1) * math.Pi / 180
	dLon := (lon2 - lon1) * math.Pi / 180
	a := math.Sin(dLat/2)*math.Sin(dLat/2) +
		math.Cos(lat1*math.Pi/180)*math.Cos(lat2*math.Pi/180)*
			math.Sin(dLon/2)*math.Sin(dLon/2)
	return earthRadiusKm * 2 * math.Atan2(math.Sqrt(a), math.Sqrt(1-a))
}
