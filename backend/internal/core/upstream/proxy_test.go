package upstream

import (
	"context"
	"net/http"
	"net/http/httptest"
	"sync"
	"testing"
	"time"
)

// A request that starts a shared fetch and then goes away (the visitor closed
// the tab) must not fail the other requests coalesced onto that fetch.
func TestGetCachedSurvivesTheFirstCallerCancelling(t *testing.T) {
	release := make(chan struct{})
	upstream := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		<-release
		w.Write([]byte(`{"ok":true}`))
	}))
	defer upstream.Close()
	p := NewCachedProxy(NewClient(upstream.URL))

	firstCtx, cancelFirst := context.WithCancel(context.Background())
	first := httptest.NewRequest(http.MethodGet, "/x", nil).WithContext(firstCtx)
	second := httptest.NewRequest(http.MethodGet, "/x", nil)

	var wg sync.WaitGroup
	var secondErr error
	var secondBody []byte
	wg.Add(2)
	go func() {
		defer wg.Done()
		p.GetCached(first, "k", "/x", time.Minute, nil)
	}()
	time.Sleep(50 * time.Millisecond) // let the first caller own the flight
	go func() {
		defer wg.Done()
		secondBody, secondErr = p.GetCached(second, "k", "/x", time.Minute, nil)
	}()
	time.Sleep(50 * time.Millisecond)
	cancelFirst()
	close(release)
	wg.Wait()

	if secondErr != nil {
		t.Fatalf("coalesced request failed with the first caller's cancellation: %v", secondErr)
	}
	if string(secondBody) != `{"ok":true}` {
		t.Fatalf("body = %q", secondBody)
	}
}

func TestResponseCacheSweepsExpiredEntries(t *testing.T) {
	c := NewResponseCache()
	c.Set("old", []byte("a"), time.Millisecond)
	time.Sleep(5 * time.Millisecond)

	c.lastSweep = time.Now().Add(-sweepInterval) // due for a sweep
	c.Set("new", []byte("b"), time.Minute)

	if _, ok := c.items["old"]; ok {
		t.Fatal("expired entry survived the sweep")
	}
	if _, ok := c.Get("new"); !ok {
		t.Fatal("fresh entry missing")
	}
}
