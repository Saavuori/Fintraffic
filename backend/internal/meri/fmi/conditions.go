package fmi

import (
	"context"
	"fmt"
	"math"
	"net/url"
	"sort"
	"strconv"
	"strings"
	"time"
)

// Station is one observation site with its newest marine readings. Every
// measurement is a pointer: a wave buoy has no anemometer, a mareograph has no
// wave sensor, and a buoy that has been lifted out for the winter reports
// nothing at all. Absent has to stay distinguishable from zero — "flat calm"
// and "no wave sensor here" are different things to a mariner.
//
// Keep in sync with SeaConditionsStation in frontend/src/modes/meri/types.
type Station struct {
	ID       string   `json:"id"`
	Name     string   `json:"name"`
	Lat      float64  `json:"lat"`
	Lon      float64  `json:"lon"`
	Kinds    []string `json:"kinds"`    // any of "wave", "wind", "waterLevel"
	Observed string   `json:"observed"` // RFC3339, newest reading at this site

	WaveHeight *float64 `json:"waveHeight,omitempty"` // significant wave height, m
	WavePeriod *float64 `json:"wavePeriod,omitempty"` // modal period, s
	WaveDir    *float64 `json:"waveDir,omitempty"`    // degrees the waves travel FROM
	WaterTemp  *float64 `json:"waterTemp,omitempty"`  // °C
	WindSpeed  *float64 `json:"windSpeed,omitempty"`  // m/s, 10 min mean
	WindGust   *float64 `json:"windGust,omitempty"`   // m/s, 10 min max
	WindDir    *float64 `json:"windDir,omitempty"`    // degrees the wind blows FROM
	AirTemp    *float64 `json:"airTemp,omitempty"`    // °C
	WaterLevel *float64 `json:"waterLevel,omitempty"` // cm from theoretical mean sea level
}

// SourceStatus reports how one upstream query fared. It is surfaced in both
// the API response and the health payload so a silently empty layer can be
// told apart from a working one with nothing to say — FMI lifts the wave buoys
// out of the water for the winter, so "no wave data" is a normal state for
// several months a year, not a fault.
type SourceStatus struct {
	Key      string `json:"key"`
	OK       bool   `json:"ok"`
	Stations int    `json:"stations"`
	Error    string `json:"error,omitempty"`
}

// Conditions is the assembled snapshot served to the frontend.
type Conditions struct {
	Updated  string         `json:"updated"`
	Stations []Station      `json:"stations"`
	Sources  []SourceStatus `json:"sources"`
}

// reading tracks the newest value seen for one field at one site.
type reading struct {
	value float64
	at    time.Time
}

type site struct {
	lat      float64
	lon      float64
	kinds    map[string]bool
	readings map[string]reading
}

// siteKey buckets observations by position. FMI republishes a station at a
// constant position, so rounding to ~10 m groups its readings without merging
// genuinely distinct neighbours.
func siteKey(lat, lon float64) string {
	return fmt.Sprintf("%.4f,%.4f", lat, lon)
}

// Fetch runs every source and folds the results into one snapshot. It only
// fails if *every* source failed: a partial result is more useful than none,
// and the per-source status says what is missing.
func (c *Client) Fetch(ctx context.Context) (Conditions, error) {
	sites := map[string]*site{}
	statuses := make([]SourceStatus, 0, len(Sources))
	anyOK := false

	for _, src := range Sources {
		params := url.Values{}
		if len(src.FMISIDs) > 0 {
			params.Set("fmisid", strings.Join(src.FMISIDs, ","))
		} else {
			params.Set("bbox", SeaAreaBBox)
		}
		if len(src.Params) > 0 {
			params.Set("parameters", strings.Join(src.Params, ","))
		}
		if src.Timestep > 0 {
			params.Set("timestep", strconv.Itoa(src.Timestep))
		}

		obs, err := c.FetchSimple(ctx, src.StoredQuery, params, src.Window)
		if err != nil {
			statuses = append(statuses, SourceStatus{Key: src.Key, OK: false, Error: err.Error()})
			continue
		}
		anyOK = true

		seen := map[string]bool{}
		for _, o := range obs {
			field := canonicalField(o.Param)
			if field == "" {
				continue
			}

			key := siteKey(o.Lat, o.Lon)
			seen[key] = true
			s := sites[key]
			if s == nil {
				s = &site{
					lat:      o.Lat,
					lon:      o.Lon,
					kinds:    map[string]bool{},
					readings: map[string]reading{},
				}
				sites[key] = s
			}
			s.kinds[src.Key] = true
			if prev, ok := s.readings[field]; !ok || o.Time.After(prev.at) {
				s.readings[field] = reading{value: o.Value, at: o.Time}
			}
		}
		statuses = append(statuses, SourceStatus{Key: src.Key, OK: true, Stations: len(seen)})
	}

	if !anyOK {
		return Conditions{}, fmt.Errorf("all %d FMI sources failed", len(Sources))
	}

	return Conditions{
		Updated:  time.Now().UTC().Format(time.RFC3339),
		Stations: buildStations(sites),
		Sources:  statuses,
	}, nil
}

func buildStations(sites map[string]*site) []Station {
	stations := make([]Station, 0, len(sites))
	for key, s := range sites {
		// A site whose every reading was dropped carries no information.
		if len(s.readings) == 0 {
			continue
		}

		st := Station{
			ID:   key,
			Name: stationName(s.lat, s.lon),
			Lat:  s.lat,
			Lon:  s.lon,
		}
		for _, kind := range []string{"wave", "wind", "waterLevel"} {
			if s.kinds[kind] {
				st.Kinds = append(st.Kinds, kind)
			}
		}

		var newest time.Time
		for field, r := range s.readings {
			if r.at.After(newest) {
				newest = r.at
			}
			v := r.value
			switch field {
			case "waveHeight":
				st.WaveHeight = &v
			case "wavePeriod":
				st.WavePeriod = &v
			case "waveDir":
				st.WaveDir = &v
			case "waterTemp":
				st.WaterTemp = &v
			case "windSpeed":
				st.WindSpeed = &v
			case "windGust":
				st.WindGust = &v
			case "windDir":
				st.WindDir = &v
			case "airTemp":
				st.AirTemp = &v
			case "waterLevel":
				// FMI publishes mareograph level in millimetres; centimetres
				// are what Finnish sea level is quoted in everywhere else.
				cm := v / 10
				st.WaterLevel = &cm
			}
		}
		if !newest.IsZero() {
			st.Observed = newest.UTC().Format(time.RFC3339)
		}
		stations = append(stations, st)
	}

	// Stable order so the payload doesn't churn between polls (map iteration
	// is randomised), which would defeat any client-side diffing.
	sort.Slice(stations, func(i, j int) bool { return stations[i].ID < stations[j].ID })
	return stations
}

// canonicalField maps an FMI parameter name onto our field name, or "" for a
// parameter we don't use.
func canonicalField(param string) string {
	param = strings.TrimSpace(param)
	for name, field := range paramFields {
		if strings.EqualFold(name, param) {
			return field
		}
	}
	return ""
}

// nearestKnown returns the closest known station within matchTolerance.
// Nearest rather than first: the two Turku mareographs sit inside one
// tolerance radius of each other, so "first match wins" would be decided by
// table order.
func nearestKnown(lat, lon float64) *KnownStation {
	var best *KnownStation
	bestDist := math.Inf(1)
	for i := range KnownStations {
		ks := &KnownStations[i]
		dLat, dLon := math.Abs(ks.Lat-lat), math.Abs(ks.Lon-lon)
		if dLat > matchTolerance || dLon > matchTolerance {
			continue
		}
		if d := dLat*dLat + dLon*dLon; d < bestDist {
			best, bestDist = ks, d
		}
	}
	return best
}

// stationName prefers the known name and falls back to the position, so a
// buoy that isn't in the table still reads as a place rather than an opaque id.
func stationName(lat, lon float64) string {
	if ks := nearestKnown(lat, lon); ks != nil {
		return ks.Name
	}
	ns, ew := "N", "E"
	if lat < 0 {
		ns = "S"
	}
	if lon < 0 {
		ew = "W"
	}
	return fmt.Sprintf("%.2f°%s %.2f°%s", math.Abs(lat), ns, math.Abs(lon), ew)
}
