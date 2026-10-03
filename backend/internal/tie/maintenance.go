package tie

import (
	"context"
	"encoding/json"
	"math"
	"net/url"
	"slices"
	"sort"
	"time"
)

const (
	maintenanceLatestURL = "https://tie.digitraffic.fi/api/maintenance/v1/tracking/routes/latest"
	maintenanceRoutesURL = "https://tie.digitraffic.fi/api/maintenance/v1/tracking/routes"

	// maintenanceWindow is how far back both feeds reach: vehicles whose latest
	// point is older than this are gone from the map, and trails cover the
	// same hour.
	maintenanceWindow = time.Hour
)

// Maintenance Models
// MaintenanceVehicle is the latest reported point of one road-maintenance
// vehicle (snowplough, gritter, grader, ...) from Digitraffic's maintenance
// tracking. Digitraffic publishes no stable vehicle id — ID is the tracking id
// of the route the point belongs to, which changes every few minutes.
type MaintenanceVehicle struct {
	ID        int64   `json:"id"`
	Longitude float64 `json:"longitude"`
	Latitude  float64 `json:"latitude"`
	// Time is when the vehicle reported this point.
	Time string `json:"time"`
	// Tasks are Digitraffic task ids, e.g. PLOUGHING_AND_SLUSH_REMOVAL, SALTING.
	Tasks []string `json:"tasks"`
	// Direction is the heading in degrees, when the vehicle reports one.
	Direction *float64 `json:"direction,omitempty"`
	Domain    string   `json:"domain,omitempty"`
	// Source is the reporting system, e.g. "Harja/Väylävirasto".
	Source string `json:"source,omitempty"`
}

type MaintenanceRouteProperties struct {
	Tasks   []string `json:"tasks"`
	EndTime string   `json:"endTime"`
}

// MaintenanceRoute is one continuous stretch a vehicle drove doing the same
// tasks, as a GeoJSON LineString feature.
type MaintenanceRoute struct {
	Type       string                     `json:"type"`
	Geometry   MaintenanceRouteGeometry   `json:"geometry"`
	Properties MaintenanceRouteProperties `json:"properties"`
}

type MaintenanceRouteGeometry struct {
	Type        string       `json:"type"`
	Coordinates [][2]float64 `json:"coordinates"`
}

// MaintenanceSnapshot is everything the maintenance layer draws: where each
// vehicle is now, and the roads they have covered within maintenanceWindow.
type MaintenanceSnapshot struct {
	Vehicles []MaintenanceVehicle `json:"vehicles"`
	Routes   struct {
		Type     string             `json:"type"`
		Features []MaintenanceRoute `json:"features"`
	} `json:"routes"`
}

type rawMaintenanceProperties struct {
	ID         int64    `json:"id"`
	PreviousID *int64   `json:"previousId"`
	Time       string   `json:"time"`
	StartTime  string   `json:"startTime"`
	EndTime    string   `json:"endTime"`
	Tasks      []string `json:"tasks"`
	Direction  *float64 `json:"direction"`
	Domain     string   `json:"domain"`
	Source     string   `json:"source"`
}

type rawMaintenanceFeature struct {
	Geometry struct {
		Type        string          `json:"type"`
		Coordinates json.RawMessage `json:"coordinates"`
	} `json:"geometry"`
	Properties rawMaintenanceProperties `json:"properties"`
}

type rawMaintenanceCollection struct {
	Features []rawMaintenanceFeature `json:"features"`
}

// maintenanceQuery builds the shared query: every domain (state roads plus the
// municipalities that report — the API defaults to state roads only), from
// maintenanceWindow ago.
func maintenanceQuery(now time.Time) string {
	q := url.Values{}
	q.Set("domain", "all")
	q.Set("endFrom", now.Add(-maintenanceWindow).UTC().Format(time.RFC3339))
	return q.Encode()
}

// FetchMaintenance fetches the latest vehicle positions and the last hour's
// routes. A failed routes fetch still returns the vehicles (without trails)
// rather than nothing.
func FetchMaintenance(ctx context.Context, now time.Time) (MaintenanceSnapshot, error) {
	query := maintenanceQuery(now)

	var latest rawMaintenanceCollection
	if err := fetchJSON(ctx, maintenanceLatestURL+"?"+query, &latest); err != nil {
		return MaintenanceSnapshot{}, err
	}

	snap := MaintenanceSnapshot{Vehicles: make([]MaintenanceVehicle, 0, len(latest.Features))}
	snap.Routes.Type = "FeatureCollection"
	snap.Routes.Features = []MaintenanceRoute{}
	for _, f := range latest.Features {
		var coords []float64
		if f.Geometry.Type != "Point" || json.Unmarshal(f.Geometry.Coordinates, &coords) != nil || len(coords) < 2 {
			continue
		}
		p := f.Properties
		snap.Vehicles = append(snap.Vehicles, MaintenanceVehicle{
			ID:        p.ID,
			Longitude: coords[0],
			Latitude:  coords[1],
			Time:      p.Time,
			Tasks:     p.Tasks,
			Direction: p.Direction,
			Domain:    p.Domain,
			Source:    p.Source,
		})
	}

	var routes rawMaintenanceCollection
	if err := fetchJSON(ctx, maintenanceRoutesURL+"?"+query, &routes); err == nil {
		snap.Routes.Features = mergeMaintenanceRoutes(routes.Features)
	}
	return snap, nil
}

// mergeMaintenanceRoutes joins Digitraffic's route segments into continuous
// trails. Each segment covers only a few minutes and names the segment before
// it (previousId), so an hour of one vehicle's driving arrives as dozens of
// features; segments chained this way with the same task set are concatenated
// into one LineString (in practice ~25× fewer features). Coordinates drop the
// z value and are rounded to ~1 m.
func mergeMaintenanceRoutes(features []rawMaintenanceFeature) []MaintenanceRoute {
	type segment struct {
		props  rawMaintenanceProperties
		coords [][2]float64
	}
	segments := make([]segment, 0, len(features))
	for _, f := range features {
		if f.Geometry.Type != "LineString" {
			continue
		}
		var raw [][]float64
		if json.Unmarshal(f.Geometry.Coordinates, &raw) != nil {
			continue
		}
		coords := make([][2]float64, 0, len(raw))
		for _, c := range raw {
			if len(c) >= 2 {
				coords = append(coords, [2]float64{round5(c[0]), round5(c[1])})
			}
		}
		if len(coords) < 2 {
			continue
		}
		segments = append(segments, segment{props: f.Properties, coords: coords})
	}
	// Oldest first, so a segment's predecessor is always already placed.
	sort.SliceStable(segments, func(i, j int) bool {
		return segments[i].props.StartTime < segments[j].props.StartTime
	})

	var out []MaintenanceRoute
	// openRun maps the id of the last segment in a trail to that trail's index.
	openRun := make(map[int64]int)
	for _, seg := range segments {
		tasks := slices.Clone(seg.props.Tasks)
		sort.Strings(tasks)
		if prev := seg.props.PreviousID; prev != nil {
			if i, ok := openRun[*prev]; ok && slices.Equal(out[i].Properties.Tasks, tasks) {
				delete(openRun, *prev)
				route := &out[i]
				coords := seg.coords
				if last := route.Geometry.Coordinates[len(route.Geometry.Coordinates)-1]; last == coords[0] {
					coords = coords[1:]
				}
				route.Geometry.Coordinates = append(route.Geometry.Coordinates, coords...)
				route.Properties.EndTime = seg.props.EndTime
				openRun[seg.props.ID] = i
				continue
			}
		}
		out = append(out, MaintenanceRoute{
			Type:       "Feature",
			Geometry:   MaintenanceRouteGeometry{Type: "LineString", Coordinates: seg.coords},
			Properties: MaintenanceRouteProperties{Tasks: tasks, EndTime: seg.props.EndTime},
		})
		openRun[seg.props.ID] = len(out) - 1
	}
	if out == nil {
		out = []MaintenanceRoute{}
	}
	return out
}

func round5(v float64) float64 { return math.Round(v*1e5) / 1e5 }
