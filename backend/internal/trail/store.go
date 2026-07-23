// Package trail persists a downsampled position history per vessel in an
// embedded SQLite database, so the frontend can draw where a vessel has been.
//
// Writes are decoupled from the MQTT ingest path: Add applies a per-vessel
// downsample gate and hands surviving points to a background writer that
// batch-inserts them in WAL transactions. Reads (Track) are served directly
// from the connection pool and decimated to a caller-supplied point cap.
package trail

import (
	"context"
	"database/sql"
	"fmt"
	"log"
	"sync"
	"time"

	_ "modernc.org/sqlite"
)

// Point is one recorded trail fix, decoded back into human units.
type Point struct {
	Ts  int64   `json:"ts"`
	Lat float64 `json:"lat"`
	Lng float64 `json:"lng"`
	Sog float64 `json:"sog"`
	Cog float64 `json:"cog"`
}

// input is a raw point queued for the writer (pre-scaling, post-downsample).
type input struct {
	mmsi int
	ts   int64
	lat  float64
	lng  float64
	sog  float64
	cog  float64
}

// Store is a trail history backed by SQLite. A nil *Store is a valid no-op
// (all methods guard on it), so callers can stay oblivious to whether trail
// recording is enabled.
type Store struct {
	db          *sql.DB
	intervalSec int64

	ch      chan input
	closeCh chan struct{}
	wg      sync.WaitGroup

	mu     sync.Mutex
	lastTs map[int]int64 // last recorded ts per mmsi — the downsample gate
}

const schema = `
CREATE TABLE IF NOT EXISTS trail (
	mmsi INTEGER NOT NULL,
	ts   INTEGER NOT NULL,
	lat  INTEGER NOT NULL, -- degrees * 1e6
	lng  INTEGER NOT NULL, -- degrees * 1e6
	sog  INTEGER NOT NULL, -- knots   * 10
	cog  INTEGER NOT NULL, -- degrees * 10
	PRIMARY KEY (mmsi, ts)
) WITHOUT ROWID;`

// Open creates/opens the trail database at path and starts the background
// writer. intervalSec is the minimum spacing between recorded points per
// vessel. Use ":memory:" for tests.
func Open(path string, intervalSec int64) (*Store, error) {
	if intervalSec < 1 {
		intervalSec = 1
	}
	// WAL + NORMAL sync: durable enough for trail data, fast concurrent reads.
	// modernc treats everything before '?' as the filename, so a raw path
	// (including Windows drive letters) works without file-URI escaping.
	dsn := path + "?_pragma=journal_mode(WAL)&_pragma=synchronous(NORMAL)&_pragma=busy_timeout(5000)"
	db, err := sql.Open("sqlite", dsn)
	if err != nil {
		return nil, fmt.Errorf("open trail db: %w", err)
	}
	if _, err := db.Exec(schema); err != nil {
		db.Close()
		return nil, fmt.Errorf("create trail schema: %w", err)
	}

	s := &Store{
		db:          db,
		intervalSec: intervalSec,
		ch:          make(chan input, 4096),
		closeCh:     make(chan struct{}),
		lastTs:      make(map[int]int64),
	}
	s.wg.Add(1)
	go s.writer()
	return s, nil
}

// gatePasses reports whether ts clears the per-vessel downsample gate for
// mmsi, recording it as the new last-seen timestamp when it does. Rejects
// out-of-order and too-close timestamps.
func (s *Store) gatePasses(mmsi int, ts int64) bool {
	s.mu.Lock()
	defer s.mu.Unlock()
	last, ok := s.lastTs[mmsi]
	if ok && ts-last < s.intervalSec {
		return false
	}
	s.lastTs[mmsi] = ts
	return true
}

// Add records a position if it clears the per-vessel downsample gate. It never
// blocks: if the writer is backed up, the point is dropped. Out-of-order or
// duplicate timestamps are ignored by the gate.
func (s *Store) Add(mmsi int, ts int64, lat, lng, sog, cog float64) {
	if s == nil || ts <= 0 {
		return
	}
	if !s.gatePasses(mmsi, ts) {
		return
	}

	select {
	case s.ch <- input{mmsi, ts, lat, lng, sog, cog}:
	default:
		// Writer is saturated; drop rather than stall ingest. Next fix past the
		// gate will record instead.
	}
}

func (s *Store) writer() {
	defer s.wg.Done()
	ticker := time.NewTicker(5 * time.Second)
	defer ticker.Stop()

	buf := make([]input, 0, 1024)
	flush := func() {
		if len(buf) == 0 {
			return
		}
		if err := s.flush(buf); err != nil {
			log.Printf("trail: flush of %d points failed: %v", len(buf), err)
		}
		buf = buf[:0]
	}

	for {
		select {
		case <-s.closeCh:
			// Drain whatever is queued, then flush and exit.
			for {
				select {
				case p := <-s.ch:
					buf = append(buf, p)
				default:
					flush()
					return
				}
			}
		case p := <-s.ch:
			buf = append(buf, p)
			if len(buf) >= 1024 {
				flush()
			}
		case <-ticker.C:
			flush()
		}
	}
}

func (s *Store) flush(pts []input) error {
	ctx, cancel := context.WithTimeout(context.Background(), 30*time.Second)
	defer cancel()

	tx, err := s.db.BeginTx(ctx, nil)
	if err != nil {
		return err
	}
	stmt, err := tx.PrepareContext(ctx,
		`INSERT OR IGNORE INTO trail (mmsi, ts, lat, lng, sog, cog) VALUES (?, ?, ?, ?, ?, ?)`)
	if err != nil {
		tx.Rollback()
		return err
	}
	defer stmt.Close()

	for _, p := range pts {
		if _, err := stmt.ExecContext(ctx, p.mmsi, p.ts,
			int64(p.lat*1e6), int64(p.lng*1e6), int64(p.sog*10), int64(p.cog*10)); err != nil {
			tx.Rollback()
			return err
		}
	}
	return tx.Commit()
}

// Track returns vessel mmsi's recorded points in [from, to] (epoch seconds),
// ascending by time, decimated to at most maxPoints (evenly strided, the most
// recent point always kept).
func (s *Store) Track(ctx context.Context, mmsi int, from, to int64, maxPoints int) ([]Point, error) {
	if s == nil {
		return nil, nil
	}
	if maxPoints < 2 {
		maxPoints = 2
	}

	rows, err := s.db.QueryContext(ctx,
		`SELECT ts, lat, lng, sog, cog FROM trail WHERE mmsi = ? AND ts >= ? AND ts <= ? ORDER BY ts`,
		mmsi, from, to)
	if err != nil {
		return nil, err
	}
	defer rows.Close()

	var all []Point
	for rows.Next() {
		var ts int64
		var lat, lng, sog, cog int64
		if err := rows.Scan(&ts, &lat, &lng, &sog, &cog); err != nil {
			return nil, err
		}
		all = append(all, Point{
			Ts:  ts,
			Lat: float64(lat) / 1e6,
			Lng: float64(lng) / 1e6,
			Sog: float64(sog) / 10,
			Cog: float64(cog) / 10,
		})
	}
	if err := rows.Err(); err != nil {
		return nil, err
	}

	return decimate(all, maxPoints), nil
}

// decimate evenly strides pts down to at most maxPoints, always keeping the
// first and last so the drawn track spans the full window.
func decimate(pts []Point, maxPoints int) []Point {
	if len(pts) <= maxPoints {
		return pts
	}
	stride := (len(pts) + maxPoints - 1) / maxPoints
	out := make([]Point, 0, maxPoints+1)
	for i := 0; i < len(pts); i += stride {
		out = append(out, pts[i])
	}
	if last := pts[len(pts)-1]; out[len(out)-1].Ts != last.Ts {
		out = append(out, last)
	}
	return out
}

// Prune deletes points older than `before` (epoch seconds) and returns the
// number removed.
func (s *Store) Prune(ctx context.Context, before int64) (int64, error) {
	if s == nil {
		return 0, nil
	}
	res, err := s.db.ExecContext(ctx, `DELETE FROM trail WHERE ts < ?`, before)
	if err != nil {
		return 0, err
	}
	return res.RowsAffected()
}

// Close stops the writer, flushing any queued points, and closes the database.
func (s *Store) Close() error {
	if s == nil {
		return nil
	}
	close(s.closeCh)
	s.wg.Wait()
	return s.db.Close()
}
