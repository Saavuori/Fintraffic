package cache

import (
	"context"
	"time"
)

// Cache is the shared live-data cache. Position methods serve stream-style
// modes (meri) that keep one hash of id -> latest payload; the generic
// key/value methods serve poll-style modes (raide, tie) that cache whole
// snapshot blobs under mode-prefixed keys (e.g. "fintraffic:raide:trains").
type Cache interface {
	SetPosition(ctx context.Context, mmsi string, payload []byte) error
	GetAllPositions(ctx context.Context) (map[string][]byte, error)
	DeletePosition(ctx context.Context, mmsi string) error

	// SetValue stores payload under key with a TTL. GetValue returns nil with
	// no error when the key is missing or expired.
	SetValue(ctx context.Context, key string, payload []byte, ttl time.Duration) error
	GetValue(ctx context.Context, key string) ([]byte, error)

	Ping(ctx context.Context) error
	Close() error
}
