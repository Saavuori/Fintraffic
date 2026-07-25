// Package fmi reads marine observations from the Finnish Meteorological
// Institute's open data WFS service (opendata.fmi.fi) — significant wave
// height from the wave buoys, wind from the coastal stations, and sea level
// from the mareographs.
//
// It is deliberately separate from core/upstream: that client is a
// Digitraffic JSON proxy (it always sends the Digitraffic-User header and
// decodes JSON), whereas FMI is a different operator serving GML/XML under
// its own terms of use.
//
// Every response format here is the "simple" WFS feature (BsWfsElement): a
// flat list of (position, time, parameter, value) tuples. FMI also offers
// multipointcoverage and timevaluepair encodings of the same data, which pack
// values more densely but require walking a much deeper GML tree to recover
// which reading belongs to which station.
package fmi

import (
	"context"
	"encoding/xml"
	"fmt"
	"io"
	"math"
	"net/http"
	"net/url"
	"strconv"
	"strings"
	"time"
)

// DefaultBaseURL is FMI's open data WFS endpoint. No API key is required;
// the data is published under CC BY 4.0.
const DefaultBaseURL = "https://opendata.fmi.fi/wfs"

// Client fetches stored queries from an FMI WFS endpoint.
type Client struct {
	baseURL string
	http    *http.Client
	// userAgent identifies this app to FMI. They ask for a contactable
	// identifier the same way Digitraffic does, so we send one rather than
	// Go's default.
	userAgent string
}

func NewClient(baseURL, userAgent string) *Client {
	if baseURL == "" {
		baseURL = DefaultBaseURL
	}
	return &Client{
		baseURL:   baseURL,
		userAgent: userAgent,
		http:      &http.Client{Timeout: 20 * time.Second},
	}
}

// Observation is one reading of one parameter at one place and time.
type Observation struct {
	Lat   float64
	Lon   float64
	Time  time.Time
	Param string
	Value float64
}

// bsWfs mirrors the "simple" WFS response. Go's XML decoder matches on local
// names, so the wfs:/BsWfs: prefixes in the document don't appear here.
type bsWfsCollection struct {
	XMLName xml.Name `xml:"FeatureCollection"`
	Members []struct {
		Element struct {
			Pos   string `xml:"Location>Point>pos"`
			Time  string `xml:"Time"`
			Param string `xml:"ParameterName"`
			Value string `xml:"ParameterValue"`
		} `xml:"BsWfsElement"`
	} `xml:"member"`
}

// exceptionReport is what FMI returns (with a 4xx status) for a malformed
// query — an unknown stored query id, a bad parameter name, and so on.
type exceptionReport struct {
	XMLName    xml.Name `xml:"ExceptionReport"`
	Exceptions []struct {
		Code string   `xml:"exceptionCode,attr"`
		Text []string `xml:"ExceptionText"`
	} `xml:"Exception"`
}

func (e exceptionReport) Error() string {
	var parts []string
	for _, ex := range e.Exceptions {
		for _, t := range ex.Text {
			t = strings.TrimSpace(t)
			if t != "" {
				parts = append(parts, t)
			}
		}
	}
	if len(parts) == 0 {
		return "FMI returned an exception report with no message"
	}
	return strings.Join(parts, "; ")
}

// FetchSimple runs a "::simple" stored query and returns every non-missing
// reading it produced. window bounds the query — FMI defaults to a wide
// period, and we only ever want the newest values.
func (c *Client) FetchSimple(ctx context.Context, storedQuery string, params url.Values, window time.Duration) ([]Observation, error) {
	q := url.Values{}
	for k, v := range params {
		q[k] = v
	}
	q.Set("service", "WFS")
	q.Set("version", "2.0.0")
	q.Set("request", "getFeature")
	q.Set("storedquery_id", storedQuery)

	// FMI wants whole seconds in UTC; a sub-second fraction is rejected.
	now := time.Now().UTC().Truncate(time.Second)
	q.Set("starttime", now.Add(-window).Format(time.RFC3339))
	q.Set("endtime", now.Format(time.RFC3339))

	req, err := http.NewRequestWithContext(ctx, http.MethodGet, c.baseURL+"?"+q.Encode(), nil)
	if err != nil {
		return nil, err
	}
	req.Header.Set("User-Agent", c.userAgent)
	req.Header.Set("Accept", "application/xml")

	resp, err := c.http.Do(req)
	if err != nil {
		return nil, err
	}
	defer resp.Body.Close()

	// Cap the read: a mis-specified query (too wide a window, too many
	// stations) can return tens of megabytes, and we would rather fail the
	// poll than hold that in memory.
	body, err := io.ReadAll(io.LimitReader(resp.Body, 32<<20))
	if err != nil {
		return nil, err
	}

	if resp.StatusCode != http.StatusOK {
		var report exceptionReport
		if xml.Unmarshal(body, &report) == nil && len(report.Exceptions) > 0 {
			return nil, fmt.Errorf("FMI %s: %s", storedQuery, report.Error())
		}
		return nil, fmt.Errorf("FMI %s: unexpected status %d", storedQuery, resp.StatusCode)
	}

	return parseSimple(body)
}

func parseSimple(body []byte) ([]Observation, error) {
	// A 200 can still carry an exception report in some FMI deployments, so
	// check before assuming the happy path.
	var report exceptionReport
	if err := xml.Unmarshal(body, &report); err == nil && len(report.Exceptions) > 0 {
		return nil, fmt.Errorf("FMI: %s", report.Error())
	}

	var coll bsWfsCollection
	if err := xml.Unmarshal(body, &coll); err != nil {
		return nil, fmt.Errorf("FMI: parsing response: %w", err)
	}

	out := make([]Observation, 0, len(coll.Members))
	for _, m := range coll.Members {
		e := m.Element
		if e.Param == "" {
			continue
		}
		// Missing readings come back as NaN rather than being omitted —
		// a station that is offline still emits a row for every timestep.
		value, err := strconv.ParseFloat(strings.TrimSpace(e.Value), 64)
		if err != nil || math.IsNaN(value) || math.IsInf(value, 0) {
			continue
		}
		lat, lon, ok := parsePos(e.Pos)
		if !ok {
			continue
		}
		ts, err := time.Parse(time.RFC3339, strings.TrimSpace(e.Time))
		if err != nil {
			continue
		}
		out = append(out, Observation{
			Lat:   lat,
			Lon:   lon,
			Time:  ts,
			Param: strings.TrimSpace(e.Param),
			Value: value,
		})
	}
	return out, nil
}

// parsePos reads a "<lat> <lon>" gml:pos. FMI serves EPSG::4326 in
// latitude-first axis order, which is the opposite of the lon/lat order the
// bbox parameter and GeoJSON both use.
func parsePos(pos string) (lat, lon float64, ok bool) {
	fields := strings.Fields(pos)
	if len(fields) < 2 {
		return 0, 0, false
	}
	lat, err1 := strconv.ParseFloat(fields[0], 64)
	lon, err2 := strconv.ParseFloat(fields[1], 64)
	if err1 != nil || err2 != nil {
		return 0, 0, false
	}
	return lat, lon, true
}
