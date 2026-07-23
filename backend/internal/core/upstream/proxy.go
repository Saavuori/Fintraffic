package upstream

import (
	"log"
	"net/http"
	"sync"
	"time"

	"golang.org/x/sync/singleflight"
)

// responseCacheItem represents a cached HTTP response payload
type responseCacheItem struct {
	data      []byte
	expiresAt time.Time
}

// ResponseCache is a thread-safe in-memory cache for API payloads
type ResponseCache struct {
	mu    sync.RWMutex
	items map[string]responseCacheItem
}

func NewResponseCache() *ResponseCache {
	return &ResponseCache{
		items: make(map[string]responseCacheItem),
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
	c.items[key] = responseCacheItem{
		data:      data,
		expiresAt: time.Now().Add(ttl),
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

// Client returns the underlying upstream client for direct (uncached) calls.
func (p *CachedProxy) Client() *Client {
	return p.client
}

// GetCached fetches a payload through the cache without writing a response,
// for handlers that compose the payload into a larger reply.
func (p *CachedProxy) GetCached(r *http.Request, key, upstreamPath string, ttl time.Duration) ([]byte, error) {
	if cached, ok := p.cache.Get(key); ok {
		return cached, nil
	}
	data, err, _ := p.sf.Do(key, func() (interface{}, error) {
		if cached, ok := p.cache.Get(key); ok {
			return cached, nil
		}
		body, err := p.client.Get(r.Context(), upstreamPath)
		if err != nil {
			return nil, err
		}
		p.cache.Set(key, body, ttl)
		return body, nil
	})
	if err != nil {
		return nil, err
	}
	return data.([]byte), nil
}

// Serve writes a cached-or-fetched upstream payload to the response. transform
// (optional) rewrites the upstream body before caching, e.g. to thin a huge
// payload.
func (p *CachedProxy) Serve(w http.ResponseWriter, r *http.Request, key, upstreamPath string, ttl time.Duration, transform func([]byte) ([]byte, error)) {
	if cached, ok := p.cache.Get(key); ok {
		w.Header().Set("Content-Type", "application/json")
		w.Write(cached)
		return
	}

	data, err, _ := p.sf.Do(key, func() (interface{}, error) {
		// Double-check cache inside singleflight
		if cached, ok := p.cache.Get(key); ok {
			return cached, nil
		}

		body, err := p.client.Get(r.Context(), upstreamPath)
		if err != nil {
			return nil, err
		}

		if transform != nil {
			body, err = transform(body)
			if err != nil {
				return nil, err
			}
		}

		p.cache.Set(key, body, ttl)
		return body, nil
	})

	if err != nil {
		log.Printf("Proxy error for %s: %v\n", key, err)
		http.Error(w, `{"error":"upstream request failed"}`, http.StatusBadGateway)
		return
	}

	w.Header().Set("Content-Type", "application/json")
	w.Write(data.([]byte))
}
