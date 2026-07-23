package meri

import (
	"encoding/json"
	"net/http"
	"net/http/httptest"
	"path/filepath"
	"testing"

	"fintraffic/internal/meri/trail"
)

// seedTrailStore opens a trail store on disk, records points, and flushes them
// by closing it, then reopens a fresh reader over the same file for the handler
// to query. This keeps the async writer out of the assertion path.
func seedTrailStore(t *testing.T, points []struct {
	mmsi     int
	ts       int64
	lat, lng float64
}) *trail.Store {
	t.Helper()
	path := filepath.Join(t.TempDir(), "trail.db")

	w, err := trail.Open(path, 1)
	if err != nil {
		t.Fatalf("open writer: %v", err)
	}
	for _, p := range points {
		w.Add(p.mmsi, p.ts, p.lat, p.lng, 5, 90)
	}
	w.Close() // drains + flushes the writer queue

	r, err := trail.Open(path, 1)
	if err != nil {
		t.Fatalf("open reader: %v", err)
	}
	t.Cleanup(func() { r.Close() })
	return r
}

func TestFleetReplayHandler(t *testing.T) {
	store := seedTrailStore(t, []struct {
		mmsi     int
		ts       int64
		lat, lng float64
	}{
		{mmsi: 42, ts: 1000, lat: 60.10, lng: 24.90},
		{mmsi: 42, ts: 1060, lat: 60.20, lng: 24.95},
		{mmsi: 99, ts: 1000, lat: 59.00, lng: 22.00},
	})
	h := &Handlers{trail: store}

	req := httptest.NewRequest(http.MethodGet, "/api/meri/replay?from=1&to=2000", nil)
	rec := httptest.NewRecorder()
	h.FleetReplay(rec, req)

	if rec.Code != http.StatusOK {
		t.Fatalf("status = %d, want 200; body=%s", rec.Code, rec.Body.String())
	}

	var resp struct {
		From      int64                   `json:"from"`
		To        int64                   `json:"to"`
		Truncated bool                    `json:"truncated"`
		Vessels   map[string][][4]float64 `json:"vessels"`
	}
	if err := json.Unmarshal(rec.Body.Bytes(), &resp); err != nil {
		t.Fatalf("decode: %v", err)
	}
	if len(resp.Vessels) != 2 {
		t.Fatalf("expected 2 vessels, got %d: %+v", len(resp.Vessels), resp.Vessels)
	}
	track := resp.Vessels["42"]
	if len(track) != 2 {
		t.Fatalf("vessel 42 should have 2 points, got %d", len(track))
	}
	// Tuple order is [lng, lat, ts, cog], ascending by ts.
	if track[0][0] != 24.90 || track[0][1] != 60.10 || track[0][2] != 1000 {
		t.Fatalf("tuple layout wrong: %+v", track[0])
	}
	if track[1][2] != 1060 {
		t.Fatalf("track not ascending by ts: %+v", track)
	}
}

func TestFleetReplayHandlerRejectsBadWindow(t *testing.T) {
	h := &Handlers{trail: seedTrailStore(t, nil)}
	req := httptest.NewRequest(http.MethodGet, "/api/meri/replay?from=2000&to=1000", nil)
	rec := httptest.NewRecorder()
	h.FleetReplay(rec, req)
	if rec.Code != http.StatusBadRequest {
		t.Fatalf("status = %d, want 400", rec.Code)
	}
}
