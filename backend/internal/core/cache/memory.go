package cache

import (
	"context"
	"sync"
	"time"
)

type memoryValue struct {
	payload   []byte
	expiresAt time.Time
}

type MemoryCache struct {
	mu        sync.RWMutex
	positions map[string][]byte
	values    map[string]memoryValue
}

func NewMemoryCache() *MemoryCache {
	return &MemoryCache{
		positions: make(map[string][]byte),
		values:    make(map[string]memoryValue),
	}
}

func (m *MemoryCache) SetPosition(ctx context.Context, mmsi string, payload []byte) error {
	m.mu.Lock()
	defer m.mu.Unlock()
	m.positions[mmsi] = payload
	return nil
}

func (m *MemoryCache) GetAllPositions(ctx context.Context) (map[string][]byte, error) {
	m.mu.RLock()
	defer m.mu.RUnlock()

	// Return a copy to avoid concurrent modification issues
	copyMap := make(map[string][]byte, len(m.positions))
	for k, v := range m.positions {
		copyMap[k] = v
	}
	return copyMap, nil
}

func (m *MemoryCache) DeletePosition(ctx context.Context, mmsi string) error {
	m.mu.Lock()
	defer m.mu.Unlock()
	delete(m.positions, mmsi)
	return nil
}

func (m *MemoryCache) SetValue(ctx context.Context, key string, payload []byte, ttl time.Duration) error {
	m.mu.Lock()
	defer m.mu.Unlock()
	m.values[key] = memoryValue{payload: payload, expiresAt: time.Now().Add(ttl)}
	return nil
}

func (m *MemoryCache) GetValue(ctx context.Context, key string) ([]byte, error) {
	m.mu.RLock()
	defer m.mu.RUnlock()
	v, ok := m.values[key]
	if !ok || time.Now().After(v.expiresAt) {
		return nil, nil
	}
	return v.payload, nil
}

func (m *MemoryCache) Ping(ctx context.Context) error {
	return nil
}

func (m *MemoryCache) Close() error {
	return nil
}
