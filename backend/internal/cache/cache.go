package cache

import "context"

type Cache interface {
	SetPosition(ctx context.Context, mmsi string, payload []byte) error
	GetAllPositions(ctx context.Context) (map[string][]byte, error)
	DeletePosition(ctx context.Context, mmsi string) error
	Ping(ctx context.Context) error
	Close() error
}
