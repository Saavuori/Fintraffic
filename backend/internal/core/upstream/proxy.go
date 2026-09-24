package upstream

import (
	"context"
	"log"
	"net/http"
	"sync"
	"time"

	"golang.org/x/sync/singleflight"
)

// sweepInterval is how often Set drops expired entries. Keys include
// visitor-supplied path segments (an MMSI, a locode), so without a sweep every
// key ever requested would stay in memory for the life of the process.
const sweepInterval = 10 * time.Minute

// responseCacheItem represents a cached HTTP response payload
type responseCacheItem struct {
	data      []byte
	expiresAt time.Time
}

// ResponseCache is a thread-safe in-memory cache for API payloads
type ResponseCache struct {
	mu        sync.RWMutex
	items     map[string]responseCacheItem
	lastSweep time.Time
}

func NewResponseCache() *ResponseCache {
	return &ResponseCache{
		items:     make(map[string]responseCacheItem),
		lastSweep: time.Now(),
	}
}

func (c *ResponseCache) Get(key string) ([]byte, bool) {
	c.mu.RLock()
	defer c.mu.RUnlock()
	item, ok := c.items[key]
	if !ok || time.Now().After(item.expiresAt) {
		return nil, false
	}
	return item.data, true
}

func (c *ResponseCache) Set(key string, data []byte, ttl time.Duration) {
	c.mu.Lock()
	defer c.mu.Unlock()
	now := time.Now()
	if now.Sub(c.lastSweep) >= sweepInterval {
		for k, item := range c.items {
			if now.After(item.expiresAt) {
				delete(c.items, k)
			}
		}
		c.lastSweep = now
	}
	c.items[key] = responseCacheItem{
		data:      data,
		expiresAt: now.Add(ttl),
	}
}

// CachedProxy serves upstream payloads through a TTL cache with singleflight
// request coalescing, so a burst of visitors triggers at most one upstream call
// per key.
type CachedProxy struct {
	client *Client
	cache  *ResponseCache
	sf     singleflight.Group
}

func NewCachedProxy(client *Client) *CachedProxy {
	return &CachedProxy{
		client: client,
		cache:  NewResponseCache(),
	}
}

// GetCached fetches a payload through the cache without writing a response,
// for handlers that compose the payload into a larger reply. transform
// (optional) rewrites the upstream body before caching, e.g. to thin a huge
// payload.
func (p *CachedProxy) GetCached(r *http.Request, key, upstreamPath string, ttl time.Duration, transform func([]byte) ([]byte, error)) ([]byte, error) {
	if cached, ok := p.cache.Get(key); ok {
		return cached, nil
	}
	// The fetch is shared by every request waiting on this key, so it must not
	// die with whichever visitor happened to start it: detach it from that
	// request's cancellation (the client's own timeout still bounds it).
	ctx := context.WithoutCancel(r.Context())
	data, err, _ := p.sf.Do(key, func() (interface{}, error) {
		// Double-check cache inside singleflight
		if cached, ok := p.cache.Get(key); ok {
			return cached, nil
		}
		body, err := p.client.Get(ctx, upstreamPath)
		if err != nil {
			return nil, err
		}
		if transform != nil {
			if body, err = transform(body); err != nil {
				return nil, err
			}
		}
		p.cache.Set(key, body, ttl)
		return body, nil
	})
	if err != nil {
		return nil, err
	}
	return data.([]byte), nil
}

// Serve writes a cached-or-fetched upstream payload to the response; see
// GetCached for transform.
func (p *CachedProxy) Serve(w http.ResponseWriter, r *http.Request, key, upstreamPath string, ttl time.Duration, transform func([]byte) ([]byte, error)) {
	data, err := p.GetCached(r, key, upstreamPath, ttl, transform)
	if err != nil {
		log.Printf("Proxy error for %s: %v\n", key, err)
		http.Error(w, `{"error":"upstream request failed"}`, http.StatusBadGateway)
		return
	}
	w.Header().Set("Content-Type", "application/json")
	w.Write(data)
}
