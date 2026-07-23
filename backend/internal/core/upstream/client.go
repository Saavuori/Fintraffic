package upstream

import (
	"context"
	"fmt"
	"io"
	"net/http"
	"time"

	"fintraffic/internal/core/config"
)

// Client is a thin JSON GET client for a Digitraffic REST API host. It sets
// the Digitraffic-User header per the API etiquette; Go's default transport
// handles gzip transparently. Each mode constructs one against its own base
// URL (meri/rata/tie .digitraffic.fi).
type Client struct {
	httpClient *http.Client
	baseURL    string
}

func NewClient(baseURL string) *Client {
	return &Client{
		httpClient: &http.Client{Timeout: 30 * time.Second},
		baseURL:    baseURL,
	}
}

// Get fetches baseURL+path and returns the raw response body.
func (c *Client) Get(ctx context.Context, path string) ([]byte, error) {
	req, err := http.NewRequestWithContext(ctx, http.MethodGet, c.baseURL+path, nil)
	if err != nil {
		return nil, err
	}
	req.Header.Set("Digitraffic-User", config.DigitrafficUserAgent)

	resp, err := c.httpClient.Do(req)
	if err != nil {
		return nil, err
	}
	defer resp.Body.Close()

	if resp.StatusCode != http.StatusOK {
		return nil, fmt.Errorf("digitraffic GET %s: status %d", path, resp.StatusCode)
	}

	return io.ReadAll(resp.Body)
}
