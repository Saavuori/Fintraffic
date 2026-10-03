package tie

import (
	"encoding/json"
	"testing"
)

func routeSegment(t *testing.T, id int64, prev *int64, start string, tasks []string, coords [][]float64) rawMaintenanceFeature {
	t.Helper()
	raw, err := json.Marshal(coords)
	if err != nil {
		t.Fatal(err)
	}
	var f rawMaintenanceFeature
	f.Geometry.Type = "LineString"
	f.Geometry.Coordinates = raw
	f.Properties = rawMaintenanceProperties{
		ID:         id,
		PreviousID: prev,
		StartTime:  start,
		EndTime:    start,
		Tasks:      tasks,
	}
	return f
}

func ptr(v int64) *int64 { return &v }

func TestMergeMaintenanceRoutesJoinsChains(t *testing.T) {
	plough := []string{"PLOUGHING_AND_SLUSH_REMOVAL", "SALTING"}
	features := []rawMaintenanceFeature{
		// Delivered out of order: the merge must sort by start time first.
		routeSegment(t, 2, ptr(1), "2026-01-01T10:05:00Z", []string{"SALTING", "PLOUGHING_AND_SLUSH_REMOVAL"},
			[][]float64{{25.00002, 60.1, 0}, {25.1, 60.2, 0}}),
		routeSegment(t, 1, nil, "2026-01-01T10:00:00Z", plough,
			[][]float64{{24.9, 60.0, 0}, {25.000021, 60.1, 0}}),
		// Same vehicle, but the task changed: a new trail starts.
		routeSegment(t, 3, ptr(2), "2026-01-01T10:10:00Z", []string{"LINE_SANDING"},
			[][]float64{{25.1, 60.2, 0}, {25.2, 60.3, 0}}),
		// Another vehicle whose predecessor is outside the window.
		routeSegment(t, 10, ptr(9), "2026-01-01T10:01:00Z", plough,
			[][]float64{{22, 61, 0}, {22.1, 61.1, 0}}),
	}

	routes := mergeMaintenanceRoutes(features)
	if len(routes) != 3 {
		t.Fatalf("got %d routes, want 3", len(routes))
	}

	joined := routes[0]
	if got := len(joined.Geometry.Coordinates); got != 3 {
		t.Errorf("joined trail has %d points, want 3 (shared vertex deduplicated after rounding)", got)
	}
	if joined.Properties.EndTime != "2026-01-01T10:05:00Z" {
		t.Errorf("joined trail ends %q, want the later segment's end", joined.Properties.EndTime)
	}
	if routes[2].Properties.Tasks[0] != "LINE_SANDING" {
		t.Errorf("task change should start a new trail, got %v", routes[2].Properties.Tasks)
	}
}

func TestMergeMaintenanceRoutesSkipsNonLines(t *testing.T) {
	point := routeSegment(t, 1, nil, "2026-01-01T10:00:00Z", nil, nil)
	point.Geometry.Type = "Point"
	point.Geometry.Coordinates = json.RawMessage(`[25, 60, 0]`)
	short := routeSegment(t, 2, nil, "2026-01-01T10:00:00Z", nil, [][]float64{{25, 60}})

	if routes := mergeMaintenanceRoutes([]rawMaintenanceFeature{point, short}); len(routes) != 0 {
		t.Fatalf("got %d routes, want none", len(routes))
	}
}
