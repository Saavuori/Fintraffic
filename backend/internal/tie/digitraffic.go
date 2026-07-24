package tie

import (
	"compress/gzip"
	"context"
	"encoding/json"
	"fmt"
	"io"
	"net/http"
	"time"

	"fintraffic/internal/core/config"
)

const (
	metadataURL        = "https://tie.digitraffic.fi/api/tms/v1/stations"
	dataURL            = "https://tie.digitraffic.fi/api/tms/v1/stations/data"
	sensorConstantsURL = "https://tie.digitraffic.fi/api/tms/v1/stations/sensor-constants"
	sensorMetaURL      = "https://tie.digitraffic.fi/api/tms/v1/sensors"
	RoadworksURL       = "https://tie.digitraffic.fi/api/traffic-message/v2/roadworks"
	IncidentsURL       = "https://tie.digitraffic.fi/api/traffic-message/v2/traffic-announcements"
)

// fetchJSON stays local (rather than using core/upstream) because tie talks to
// several hosts (tie.digitraffic.fi, parking.fintraffic.fi, afir.digitraffic.fi)
// with full URLs, and tie.digitraffic.fi gzips regardless of Accept-Encoding.
func fetchJSON(ctx context.Context, url string, target interface{}) error {
	req, err := http.NewRequestWithContext(ctx, "GET", url, nil)
	if err != nil {
		return err
	}
	req.Header.Set("Accept-Encoding", "gzip")
	req.Header.Set("User-Agent", config.DigitrafficUserAgent)
	req.Header.Set("Digitraffic-User", config.DigitrafficUserAgent)

	client := &http.Client{Timeout: 10 * time.Second}
	resp, err := client.Do(req)
	if err != nil {
		return err
	}
	defer resp.Body.Close()

	if resp.StatusCode != http.StatusOK {
		return fmt.Errorf("unexpected status code: %d", resp.StatusCode)
	}

	// tie.digitraffic.fi always gzips despite the Accept-Encoding hint being
	// advisory; parking.fintraffic.fi (a different host/service) doesn't, so
	// only unwrap gzip when the server actually used it.
	var body io.Reader = resp.Body
	if resp.Header.Get("Content-Encoding") == "gzip" {
		reader, err := gzip.NewReader(resp.Body)
		if err != nil {
			return err
		}
		defer reader.Close()
		body = reader
	}

	return json.NewDecoder(body).Decode(target)
}

func FetchTMSMetadata(ctx context.Context) (map[int]Feature, error) {
	var coll FeatureCollection
	if err := fetchJSON(ctx, metadataURL, &coll); err != nil {
		return nil, err
	}

	stationMap := make(map[int]Feature)
	for _, f := range coll.Features {
		stationMap[f.Properties.ID] = f
	}
	return stationMap, nil
}

type dataResponse struct {
	Stations []TmsStationData `json:"stations"`
}

func FetchTMSData(ctx context.Context) ([]TmsStationData, error) {
	var res dataResponse
	if err := fetchJSON(ctx, dataURL, &res); err != nil {
		return nil, err
	}
	return res.Stations, nil
}

// FetchSensorMeta fetches the static description/unit for every TMS sensor
// type (e.g. id 5116 -> "AjoneuvomÃ¤Ã¤rÃ¤ suunta 1 (-5 min)", "kpl/h").
func FetchSensorMeta(ctx context.Context) (map[int]SensorMeta, error) {
	var res SensorMetaResponse
	if err := fetchJSON(ctx, sensorMetaURL, &res); err != nil {
		return nil, err
	}

	result := make(map[int]SensorMeta, len(res.Sensors))
	for _, s := range res.Sensors {
		result[s.ID] = SensorMeta{DescriptionFI: s.Description, Unit: s.Unit}
	}
	return result, nil
}

// RoadConstants holds the per-station road bearing and seasonal free-flow
// speed baseline used for relative-speed coloring.
type RoadConstants struct {
	Bearing   *float64
	FreeFlow1 *float64
	FreeFlow2 *float64
}

func FetchSensorConstants(ctx context.Context) (map[int]RoadConstants, error) {
	var res StationConstantsResponse
	if err := fetchJSON(ctx, sensorConstantsURL, &res); err != nil {
		return nil, err
	}

	now := time.Now()
	result := make(map[int]RoadConstants, len(res.Stations))
	for _, st := range res.Stations {
		var rc RoadConstants
		for _, v := range st.SensorConstantValues {
			value := v.Value
			switch v.Name {
			case "Tien_suunta":
				rc.Bearing = &value
			case "VVAPAAS1":
				if isDateInSeason(now, v.ValidFrom, v.ValidTo) {
					rc.FreeFlow1 = &value
				}
			case "VVAPAAS2":
				if isDateInSeason(now, v.ValidFrom, v.ValidTo) {
					rc.FreeFlow2 = &value
				}
			}
		}
		result[st.ID] = rc
	}
	return result, nil
}

// isDateInSeason reports whether now's month-day falls within [from, to]
// (both "MM-DD"), handling ranges that wrap across the new year (e.g. 11-01..03-31).
func isDateInSeason(now time.Time, from, to string) bool {
	const layout = "01-02"
	f, err1 := time.Parse(layout, from)
	t, err2 := time.Parse(layout, to)
	if err1 != nil || err2 != nil {
		return true
	}
	nowMD, _ := time.Parse(layout, now.Format(layout))
	if !f.After(t) {
		return !nowMD.Before(f) && !nowMD.After(t)
	}
	// Range wraps around the year boundary (e.g. Nov-Mar).
	return !nowMD.Before(f) || !nowMD.After(t)
}

// rawPOIFeature mirrors the subset of Digitraffic's Datex2-derived JSON we
// need; the full structure is much deeper (locations, phases, contacts, ...).
type rawPOIRestriction struct {
	Type        string `json:"type"`
	Restriction struct {
		Quantity *float64 `json:"quantity"`
		Unit     string   `json:"unit"`
	} `json:"restriction"`
}

type rawPOIAnnouncement struct {
	Language string `json:"language"`
	Title    string `json:"title"`
	Location struct {
		Description string `json:"description"`
	} `json:"location"`
	RoadWorkPhases []struct {
		Restrictions []rawPOIRestriction `json:"restrictions"`
	} `json:"roadWorkPhases"`
}

// workZoneSpeedLimit returns the lowest "speed limit" restriction (km/h)
// declared across an announcement's road-work phases, or nil if none is.
func workZoneSpeedLimit(a rawPOIAnnouncement) *float64 {
	var min *float64
	for _, ph := range a.RoadWorkPhases {
		for _, r := range ph.Restrictions {
			q := r.Restriction.Quantity
			if r.Type != "speed limit" || q == nil || *q <= 0 {
				continue
			}
			if min == nil || *q < *min {
				min = q
			}
		}
	}
	return min
}

type rawPOIFeature struct {
	Type       string          `json:"type"`
	Geometry   json.RawMessage `json:"geometry"`
	Properties struct {
		SituationID   string               `json:"situationId"`
		SituationType string               `json:"situationType"`
		ReleaseTime   string               `json:"releaseTime"`
		VersionTime   string               `json:"versionTime"`
		Announcements []rawPOIAnnouncement `json:"announcements"`
	} `json:"properties"`
}

type rawPOICollection struct {
	Type     string          `json:"type"`
	Features []rawPOIFeature `json:"features"`
}

// FetchPOIs fetches a Digitraffic traffic-message GeoJSON feed (roadworks or
// traffic-announcements) and flattens it into POICollection.
func FetchPOIs(ctx context.Context, url string) (POICollection, error) {
	var raw rawPOICollection
	if err := fetchJSON(ctx, url, &raw); err != nil {
		return POICollection{}, err
	}

	out := POICollection{Type: "FeatureCollection", Features: []POIFeature{}}
	for _, f := range raw.Features {
		var chosen *rawPOIAnnouncement
		for i := range f.Properties.Announcements {
			a := &f.Properties.Announcements[i]
			if chosen == nil {
				chosen = a
			}
			if a.Language == "fi" {
				chosen = a
				break
			}
		}
		var title, desc string
		var speedLimit *float64
		if chosen != nil {
			title, desc = chosen.Title, chosen.Location.Description
			speedLimit = workZoneSpeedLimit(*chosen)
		}
		out.Features = append(out.Features, POIFeature{
			Type:     "Feature",
			Geometry: f.Geometry,
			Properties: POIProperties{
				ID:            f.Properties.SituationID,
				Title:         title,
				Description:   desc,
				SituationType: f.Properties.SituationType,
				ReleaseTime:   f.Properties.ReleaseTime,
				VersionTime:   f.Properties.VersionTime,
				SpeedLimit:    speedLimit,
			},
		})
	}
	return out, nil
}
