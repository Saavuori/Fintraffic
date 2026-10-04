package ilma

import (
	"bytes"
	"context"
	"encoding/json"
	"fmt"
	"net/http"
	"regexp"
	"sort"
	"strings"
	"time"

	"fintraffic/internal/core/config"
)

// Ilma has no Digitraffic feed: Fintraffic's air navigation services publish no
// open live-position API. Positions come from community ADS-B networks instead,
// which aggregate volunteer receivers and publish the readsb "v2" JSON. adsb.fi
// (run from Finland, so its receiver coverage is densest exactly here) is the
// primary; adsb.lol serves the same shape and takes over when adsb.fi fails.
// Both cap a point query at a 250 NM radius and ask for at most ~1 request per
// second, so one poll is a handful of sequential requests.
type source struct {
	name string
	url  string // fmt pattern taking lat, lon, radius (NM)
}

var sources = []source{
	{name: "adsb.fi", url: "https://opendata.adsb.fi/api/v2/lat/%.2f/lon/%.2f/dist/%d"},
	{name: "adsb.lol", url: "https://api.adsb.lol/v2/lat/%.2f/lon/%.2f/dist/%d"},
}

// queryRadiusNM is the largest radius both networks accept.
const queryRadiusNM = 250

// queryPoints are the centres of the circles that together cover Finland: a
// 250 NM (463 km) circle reaches from the Gulf of Finland to Oulu, so a
// southern and a northern one span Hanko to Utsjoki with overlap to spare.
var queryPoints = [][2]float64{
	{61.0, 24.5}, // south: Helsinki, Turku, Tampere, the Gulf of Finland
	{66.8, 26.0}, // north: Oulu up to Utsjoki
}

// The circles also reach well into Sweden, Estonia and Russia; the map is about
// Finnish airspace, so anything outside this box (Finland plus a margin to see
// traffic approaching) is dropped.
const (
	minLat, maxLat = 58.8, 70.6
	minLon, maxLon = 18.5, 32.5
)

// maxPositionAge drops aircraft whose last position is older than this: a
// receiver network keeps a target listed for a while after losing it, and a
// minute-old position on a jet is 15 km wrong.
const maxPositionAge = 60 * time.Second

// rawAircraft is the subset of the readsb v2 aircraft record the app uses.
type rawAircraft struct {
	Hex       string          `json:"hex"`
	Type      string          `json:"type"`
	Flight    string          `json:"flight"`
	R         string          `json:"r"`
	T         string          `json:"t"`
	Desc      string          `json:"desc"`
	AltBaro   json.RawMessage `json:"alt_baro"` // feet, or the string "ground"
	GS        *float64        `json:"gs"`
	Track     *float64        `json:"track"`
	TrueHdg   *float64        `json:"true_heading"`
	BaroRate  *float64        `json:"baro_rate"`
	GeomRate  *float64        `json:"geom_rate"`
	Squawk    string          `json:"squawk"`
	Emergency string          `json:"emergency"`
	Category  string          `json:"category"`
	Lat       *float64        `json:"lat"`
	Lon       *float64        `json:"lon"`
	SeenPos   *float64        `json:"seen_pos"` // seconds since the position was received
	DBFlags   int             `json:"dbFlags"`  // bit 0: military
}

// rawResponse covers both networks: adsb.fi lists aircraft under "aircraft",
// adsb.lol under "ac".
type rawResponse struct {
	Aircraft []rawAircraft `json:"aircraft"`
	AC       []rawAircraft `json:"ac"`
}

var httpClient = &http.Client{Timeout: 15 * time.Second}

// fetchPoint fetches every aircraft within radius of one point from one source.
func fetchPoint(ctx context.Context, src source, lat, lon float64) ([]rawAircraft, error) {
	url := fmt.Sprintf(src.url, lat, lon, queryRadiusNM)
	req, err := http.NewRequestWithContext(ctx, http.MethodGet, url, nil)
	if err != nil {
		return nil, err
	}
	// Not Digitraffic, but the same courtesy: say who is asking.
	req.Header.Set("User-Agent", config.DigitrafficUserAgent)

	resp, err := httpClient.Do(req)
	if err != nil {
		return nil, err
	}
	defer resp.Body.Close()
	if resp.StatusCode != http.StatusOK {
		return nil, fmt.Errorf("%s: status %d", src.name, resp.StatusCode)
	}

	var raw rawResponse
	if err := json.NewDecoder(resp.Body).Decode(&raw); err != nil {
		return nil, fmt.Errorf("%s: %w", src.name, err)
	}
	if raw.Aircraft != nil {
		return raw.Aircraft, nil
	}
	return raw.AC, nil
}

// airlineCallsign matches the ICAO airline form: a three-letter operator
// designator followed by a flight number ("FIN2JA", "SAS1004"). Light aircraft
// fly their registration instead ("OHABC"), which never has a digit fourth.
var airlineCallsign = regexp.MustCompile(`^[A-Z]{3}[0-9][0-9A-Z]{0,4}$`)

// classify assigns the map group. The aircraft database's military flag wins;
// then helicopters by emitter category; then airline flights by callsign, or
// by size class when no callsign is being sent.
func classify(category, callsign string, dbFlags int) string {
	switch {
	case dbFlags&1 != 0, category == "A6":
		return GroupMilitary
	case category == "A7":
		return GroupRotorcraft
	case airlineCallsign.MatchString(callsign):
		return GroupAirline
	case callsign == "" && (category == "A3" || category == "A4" || category == "A5"):
		return GroupAirline
	default:
		return GroupGeneral
	}
}

// positionSource maps readsb's message-type field to the four kinds the
// frontend distinguishes.
func positionSource(t string) string {
	switch {
	case strings.HasPrefix(t, "adsb"), strings.HasPrefix(t, "adsr"), t == "adsc":
		return "adsb"
	case t == "mlat":
		return "mlat"
	case strings.HasPrefix(t, "tisb"):
		return "tisb"
	default:
		return "other"
	}
}

// squawkEmergency is the state implied by the three reserved transponder codes.
var squawkEmergency = map[string]string{
	"7500": "unlawful",
	"7600": "nordo",
	"7700": "general",
}

// Ground stations and vehicles that some receivers pick up and list alongside
// aircraft: tower and ground-movement transmitters, service cars.
var groundTypes = map[string]bool{"TWR": true, "GND": true, "SERV": true}

func intPtr(f *float64) *int {
	if f == nil {
		return nil
	}
	v := int(*f)
	return &v
}

// normalize turns one raw record into an Aircraft, reporting false for records
// the map should not show: no position, stale position, outside the area, or a
// surface vehicle/obstacle rather than an aircraft.
func normalize(r rawAircraft, fetched time.Time) (Aircraft, bool) {
	if r.Lat == nil || r.Lon == nil || r.Hex == "" {
		return Aircraft{}, false
	}
	lat, lon := *r.Lat, *r.Lon
	if lat < minLat || lat > maxLat || lon < minLon || lon > maxLon {
		return Aircraft{}, false
	}
	// Emitter categories C1–C7 are surface vehicles and fixed obstacles; C0
	// ("no information") is only dropped when the database knows it is a
	// ground station.
	if (strings.HasPrefix(r.Category, "C") && r.Category != "C0") || groundTypes[r.T] {
		return Aircraft{}, false
	}
	age := time.Duration(0)
	if r.SeenPos != nil {
		age = time.Duration(*r.SeenPos * float64(time.Second))
	}
	if age > maxPositionAge {
		return Aircraft{}, false
	}

	callsign := strings.TrimSpace(r.Flight)
	a := Aircraft{
		Hex:           strings.ToLower(strings.TrimSpace(r.Hex)),
		Callsign:      callsign,
		Registration:  strings.TrimSpace(r.R),
		TypeCode:      strings.TrimSpace(r.T),
		TypeName:      strings.TrimSpace(r.Desc),
		Category:      r.Category,
		Group:         classify(r.Category, callsign, r.DBFlags),
		Latitude:      lat,
		Longitude:     lon,
		GroundSpeedKt: r.GS,
		Track:         r.Track,
		Squawk:        r.Squawk,
		Source:        positionSource(r.Type),
		Timestamp:     fetched.Add(-age).UnixMilli(),
	}
	if a.Track == nil {
		// Slow or stationary targets may report a heading but no track.
		a.Track = r.TrueHdg
	}
	if a.Group == GroupAirline && len(callsign) >= 3 {
		a.Airline = airlineNames[callsign[:3]]
	}

	if bytes.Equal(bytes.TrimSpace(r.AltBaro), []byte(`"ground"`)) {
		a.OnGround = true
	} else if len(r.AltBaro) > 0 {
		var ft float64
		if err := json.Unmarshal(r.AltBaro, &ft); err == nil {
			a.AltitudeFt = intPtr(&ft)
		}
	}
	if r.BaroRate != nil {
		a.VerticalRateFpm = intPtr(r.BaroRate)
	} else {
		a.VerticalRateFpm = intPtr(r.GeomRate)
	}

	if r.Emergency != "" && r.Emergency != "none" {
		a.Emergency = r.Emergency
	} else if e, ok := squawkEmergency[r.Squawk]; ok {
		a.Emergency = e
	}
	return a, true
}

// mergeAircraft combines the per-circle results: where the circles overlap the
// same aircraft appears twice, and the fresher position wins. The result is
// sorted by hex so successive snapshots diff cleanly.
func mergeAircraft(lists ...[]Aircraft) []Aircraft {
	byHex := make(map[string]Aircraft)
	for _, list := range lists {
		for _, a := range list {
			if prev, ok := byHex[a.Hex]; !ok || a.Timestamp > prev.Timestamp {
				byHex[a.Hex] = a
			}
		}
	}
	out := make([]Aircraft, 0, len(byHex))
	for _, a := range byHex {
		out = append(out, a)
	}
	sort.Slice(out, func(i, j int) bool { return out[i].Hex < out[j].Hex })
	return out
}
