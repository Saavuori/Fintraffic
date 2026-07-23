package api

import (
	"context"
	"fmt"
	"io"
	"net/http"
	"time"

	"marinetraffic/internal/config"
)

const digitrafficBase = "https://meri.digitraffic.fi"

// DigitrafficClient is a thin JSON GET client for the Digitraffic marine REST
// API. It sets the Digitraffic-User header per the API etiquette; Go's default
// transport handles gzip transparently.
type DigitrafficClient struct {
	httpClient *http.Client
	baseURL    string
}

func NewDigitrafficClient() *DigitrafficClient {
	return &DigitrafficClient{
		httpClient: &http.Client{Timeout: 30 * time.Second},
		baseURL:    digitrafficBase,
	}
}

// Get fetches baseURL+path and returns the raw response body.
func (c *DigitrafficClient) Get(ctx context.Context, path string) ([]byte, error) {
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
