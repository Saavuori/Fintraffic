package ilma

import (
	"sync"
	"time"
)

// trailWindow is how much recent track each aircraft keeps: enough to show
// where a flight came from across Finland, short enough to stay in memory.
const trailWindow = 30 * time.Minute

// Trails records each aircraft's recent positions from the successive polls.
// Neither network offers a keyless history endpoint, so the track is built
// here, one poll at a time. It lives in process memory only: it is short-lived
// and rebuilds itself within half an hour of a restart, so it does not earn a
// place in Redis or on disk.
type Trails struct {
	mu     sync.RWMutex
	tracks map[string][]TrailPoint
}

func NewTrails() *Trails {
	return &Trails{tracks: make(map[string][]TrailPoint)}
}

// Record appends each aircraft's latest fix to its track (when it is a new
// fix), trims points older than the window, and forgets aircraft whose last
// point has aged out.
func (t *Trails) Record(aircraft []Aircraft, now time.Time) {
	cutoff := now.Add(-trailWindow).UnixMilli()

	t.mu.Lock()
	defer t.mu.Unlock()

	for _, a := range aircraft {
		pts := t.tracks[a.Hex]
		if n := len(pts); n > 0 && pts[n-1].Timestamp >= a.Timestamp {
			continue // same fix as last poll
		}
		alt := a.AltitudeFt
		if a.OnGround {
			zero := 0
			alt = &zero
		}
		t.tracks[a.Hex] = append(pts, TrailPoint{
			Latitude:   a.Latitude,
			Longitude:  a.Longitude,
			AltitudeFt: alt,
			Timestamp:  a.Timestamp,
		})
	}

	for hex, pts := range t.tracks {
		i := 0
		for i < len(pts) && pts[i].Timestamp < cutoff {
			i++
		}
		switch {
		case i == len(pts):
			delete(t.tracks, hex)
		case i > 0:
			// Copy rather than reslice so the dropped head can be collected.
			t.tracks[hex] = append([]TrailPoint(nil), pts[i:]...)
		}
	}
}

// Get returns a copy of one aircraft's recorded track, oldest first, and
// whether there is one.
func (t *Trails) Get(hex string) ([]TrailPoint, bool) {
	t.mu.RLock()
	defer t.mu.RUnlock()
	pts, ok := t.tracks[hex]
	if !ok {
		return nil, false
	}
	return append([]TrailPoint(nil), pts...), true
}

// Len is the number of aircraft with a recorded track.
func (t *Trails) Len() int {
	t.mu.RLock()
	defer t.mu.RUnlock()
	return len(t.tracks)
}
