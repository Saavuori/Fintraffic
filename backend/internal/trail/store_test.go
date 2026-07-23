package trail

import (
	"context"
	"path/filepath"
	"testing"
)

// waitFlush closes the store, which drains and flushes the writer queue, then
// reopens against the same handle is not possible with :memory:, so tests that
// need to read call flushNow instead.
func flushNow(t *testing.T, s *Store, pts []input) {
	t.Helper()
	if err := s.flush(pts); err != nil {
		t.Fatalf("flush: %v", err)
	}
}

func openTestStore(t *testing.T, intervalSec int64) *Store {
	t.Helper()
	s, err := Open(filepath.Join(t.TempDir(), "trail.db"), intervalSec)
	if err != nil {
		t.Fatalf("Open: %v", err)
	}
	t.Cleanup(func() { s.Close() })
	return s
}

func TestDownsampleGate(t *testing.T) {
	s := openTestStore(t, 60)

	// t=1000 records; t=1030 (30s later) is inside the 60s gate and is dropped;
	// t=1060 records again.
	if got := s.gatePasses(1, 1000); !got {
		t.Fatal("first point should pass the gate")
	}
	if got := s.gatePasses(1, 1030); got {
		t.Fatal("point 30s later should be gated out")
	}
	if got := s.gatePasses(1, 1060); !got {
		t.Fatal("point 60s later should pass")
	}
	// Different vessel is independent.
	if got := s.gatePasses(2, 1030); !got {
		t.Fatal("other vessel should pass its own first point")
	}
	// Out-of-order timestamp is rejected.
	if got := s.gatePasses(1, 1050); got {
		t.Fatal("out-of-order timestamp should be gated out")
	}
}

func TestTrackRoundTrip(t *testing.T) {
	s := openTestStore(t, 60)

	pts := []input{
		{mmsi: 42, ts: 1000, lat: 60.161234, lng: 24.934567, sog: 12.3, cog: 187.4},
		{mmsi: 42, ts: 1060, lat: 60.170000, lng: 24.940000, sog: 11.0, cog: 190.0},
		{mmsi: 99, ts: 1000, lat: 59.0, lng: 22.0, sog: 5.0, cog: 90.0},
	}
	flushNow(t, s, pts)

	got, err := s.Track(context.Background(), 42, 0, 2000, 1000)
	if err != nil {
		t.Fatalf("Track: %v", err)
	}
	if len(got) != 2 {
		t.Fatalf("expected 2 points for vessel 42, got %d", len(got))
	}
	if got[0].Ts != 1000 || got[1].Ts != 1060 {
		t.Fatalf("points out of order: %+v", got)
	}
	// Scaling round-trips within the 1e6 / 10 quantization.
	if d := got[0].Lat - 60.161234; d > 1e-6 || d < -1e-6 {
		t.Fatalf("lat round-trip off: got %v", got[0].Lat)
	}
	if got[0].Sog != 12.3 {
		t.Fatalf("sog round-trip off: got %v", got[0].Sog)
	}

	// Time-window filter excludes the second point.
	windowed, err := s.Track(context.Background(), 42, 0, 1030, 1000)
	if err != nil {
		t.Fatalf("Track windowed: %v", err)
	}
	if len(windowed) != 1 {
		t.Fatalf("window should return 1 point, got %d", len(windowed))
	}
}

func TestFleetTrack(t *testing.T) {
	s := openTestStore(t, 60)
	flushNow(t, s, []input{
		{mmsi: 42, ts: 1000, lat: 60.1, lng: 24.9, sog: 12, cog: 180},
		{mmsi: 42, ts: 1060, lat: 60.2, lng: 24.95, sog: 11, cog: 185},
		{mmsi: 99, ts: 1000, lat: 59.0, lng: 22.0, sog: 5, cog: 90},
		{mmsi: 99, ts: 2000, lat: 59.5, lng: 22.5, sog: 6, cog: 95}, // outside [0,1500]
	})

	tracks, truncated, err := s.FleetTrack(context.Background(), 0, 1500, 1000, 100000)
	if err != nil {
		t.Fatalf("FleetTrack: %v", err)
	}
	if truncated {
		t.Fatal("should not be truncated")
	}
	if len(tracks) != 2 {
		t.Fatalf("expected 2 vessels, got %d", len(tracks))
	}
	if len(tracks[42]) != 2 {
		t.Fatalf("vessel 42 should have 2 points, got %d", len(tracks[42]))
	}
	// Each vessel's sub-track must be ascending by time.
	if tracks[42][0].Ts != 1000 || tracks[42][1].Ts != 1060 {
		t.Fatalf("vessel 42 track not ascending: %+v", tracks[42])
	}
	// The window excludes vessel 99's t=2000 point.
	if len(tracks[99]) != 1 || tracks[99][0].Ts != 1000 {
		t.Fatalf("vessel 99 window wrong: %+v", tracks[99])
	}
}

func TestFleetTrackTruncation(t *testing.T) {
	s := openTestStore(t, 1)
	pts := make([]input, 0, 10)
	for i := 0; i < 10; i++ {
		pts = append(pts, input{mmsi: 1, ts: int64(1000 + i), lat: 60, lng: 24, sog: 1, cog: 1})
	}
	flushNow(t, s, pts)

	// Cap of 5 rows over 10 stored points → truncated, keeping the most recent.
	tracks, truncated, err := s.FleetTrack(context.Background(), 0, 100000, 1000, 5)
	if err != nil {
		t.Fatalf("FleetTrack: %v", err)
	}
	if !truncated {
		t.Fatal("expected truncated=true when the cap is exceeded")
	}
	got := tracks[1]
	if len(got) != 5 {
		t.Fatalf("expected 5 kept points, got %d", len(got))
	}
	// Most recent points are kept, still ascending.
	if got[0].Ts != 1005 || got[len(got)-1].Ts != 1009 {
		t.Fatalf("truncation kept wrong window: %+v", got)
	}
}

func TestPrune(t *testing.T) {
	s := openTestStore(t, 60)
	flushNow(t, s, []input{
		{mmsi: 7, ts: 100, lat: 60, lng: 24},
		{mmsi: 7, ts: 200, lat: 60, lng: 24},
		{mmsi: 7, ts: 300, lat: 60, lng: 24},
	})

	n, err := s.Prune(context.Background(), 250)
	if err != nil {
		t.Fatalf("Prune: %v", err)
	}
	if n != 2 {
		t.Fatalf("expected 2 pruned, got %d", n)
	}
	remaining, _ := s.Track(context.Background(), 7, 0, 1000, 1000)
	if len(remaining) != 1 || remaining[0].Ts != 300 {
		t.Fatalf("prune left wrong data: %+v", remaining)
	}
}

func TestDecimate(t *testing.T) {
	pts := make([]Point, 1000)
	for i := range pts {
		pts[i] = Point{Ts: int64(i)}
	}
	got := decimate(pts, 100)
	if len(got) > 101 {
		t.Fatalf("decimate exceeded cap: %d", len(got))
	}
	if got[0].Ts != 0 {
		t.Fatalf("first point not kept: %d", got[0].Ts)
	}
	if got[len(got)-1].Ts != 999 {
		t.Fatalf("last point not kept: %d", got[len(got)-1].Ts)
	}

	// Below the cap, returned unchanged.
	small := pts[:50]
	if len(decimate(small, 100)) != 50 {
		t.Fatal("small slice should be returned as-is")
	}
}
