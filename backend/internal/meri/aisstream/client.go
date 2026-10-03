// Package aisstream brings in the class B AIS traffic Digitraffic doesn't
// publish. Digitraffic carries class A ships only, so leisure craft and small
// work and fishing boats (class B transponders) never reach the map from it.
// aisstream.io relays them: their position reports (types 18 and 19) and their
// static data (type 24: name, type, size). Class A static data (type 5) is
// collected too, to fill fields Digitraffic leaves empty and to supply hull
// dimensions.
//
// Class A positions keep coming from Digitraffic alone; when this feed is down
// the class B boats simply age out of the map and nothing else is affected.
package aisstream

import (
	"context"
	"encoding/json"
	"fmt"
	"log"
	"strings"
	"sync"
	"time"

	"github.com/coder/websocket"
	"github.com/prometheus/client_golang/prometheus"
)

// DefaultURL is the aisstream.io WebSocket endpoint.
const DefaultURL = "wss://stream.aisstream.io/v0/stream"

// boundingBox covers Digitraffic's AIS coverage (northern Baltic, Gulf of
// Finland, Gulf of Bothnia), as [[lat, lon], [lat, lon]] corners.
var boundingBox = [2][2]float64{{54.5, 16.0}, {66.2, 34.0}}

// retention drops vessels not heard from in this long. Static reports repeat
// every six minutes, so this only sheds ships that have left the area.
const retention = 48 * time.Hour

var messagesCounter = prometheus.NewCounterVec(prometheus.CounterOpts{
	Name: "fintraffic_meri_aisstream_messages_received_total",
	Help: "Total number of AIS messages received from aisstream.io.",
}, []string{"type"})

func init() {
	prometheus.MustRegister(messagesCounter)
}

// Static is the static/voyage data aisstream has seen for one vessel. Zero
// values mean "not reported". Served as-is in /api/meri/vessel/{mmsi}.
type Static struct {
	MMSI     int     `json:"mmsi"`
	Name     string  `json:"name,omitempty"`
	CallSign string  `json:"callSign,omitempty"`
	IMO      int64   `json:"imo,omitempty"`
	ShipType int     `json:"shipType,omitempty"`
	Dest     string  `json:"dest,omitempty"`
	Draught  float64 `json:"draught,omitempty"` // meters
	ETA      string  `json:"eta,omitempty"`     // "MM-DD HH:MM" UTC
	Length   int     `json:"length,omitempty"`  // meters, bow to stern (A+B)
	Beam     int     `json:"beam,omitempty"`    // meters (C+D)
	ClassB   bool    `json:"classB,omitempty"`  // reported via type 19 or 24
	Seen     int64   `json:"seen"`              // epoch seconds of the last report
}

// Position is one class B position fix.
type Position struct {
	MMSI int
	Lat  float64
	Lng  float64
	Sog  float64 // knots; 0 when unavailable
	Cog  float64 // degrees; 0 when unavailable
	Hdg  *int    // nil when unavailable
	Ts   int64   // epoch seconds
}

// Callbacks receive the client's output. Both are called outside the client's
// lock and may be nil.
type Callbacks struct {
	// OnStatic fires after a vessel's static data changed.
	OnStatic func(mmsi int)
	// OnPosition fires for every valid class B position fix.
	OnPosition func(p Position)
}

// Client keeps a WebSocket subscription to aisstream.io open, collects the
// static data it delivers and passes class B positions on. A nil *Client is a
// valid disabled client: every method is nil-safe.
type Client struct {
	url    string
	apiKey string
	cb     Callbacks

	mu        sync.RWMutex
	vessels   map[int]Static
	connected bool
}

// New returns a client for the given API key.
func New(url, apiKey string, cb Callbacks) *Client {
	return &Client{
		url:     url,
		apiKey:  apiKey,
		cb:      cb,
		vessels: make(map[int]Static),
	}
}

// Get returns what aisstream has reported for one vessel.
func (c *Client) Get(mmsi int) (Static, bool) {
	if c == nil {
		return Static{}, false
	}
	c.mu.RLock()
	defer c.mu.RUnlock()
	s, ok := c.vessels[mmsi]
	return s, ok
}

// Len is the number of vessels with static data.
func (c *Client) Len() int {
	if c == nil {
		return 0
	}
	c.mu.RLock()
	defer c.mu.RUnlock()
	return len(c.vessels)
}

func (c *Client) IsConnected() bool {
	if c == nil {
		return false
	}
	c.mu.RLock()
	defer c.mu.RUnlock()
	return c.connected
}

func (c *Client) setConnected(v bool) {
	c.mu.Lock()
	c.connected = v
	c.mu.Unlock()
}

// Run holds the subscription open, reconnecting with backoff, until ctx is
// cancelled.
func (c *Client) Run(ctx context.Context) {
	if c == nil {
		return
	}
	go c.pruneLoop(ctx)

	backoff := 5 * time.Second
	for {
		start := time.Now()
		err := c.session(ctx)
		c.setConnected(false)
		if ctx.Err() != nil {
			return
		}
		// A session that stayed up a while was healthy; start backoff over.
		if time.Since(start) > 5*time.Minute {
			backoff = 5 * time.Second
		}
		log.Printf("aisstream: disconnected: %v (retrying in %s)\n", err, backoff)
		select {
		case <-ctx.Done():
			return
		case <-time.After(backoff):
		}
		backoff = min(backoff*2, 5*time.Minute)
	}
}

type subscription struct {
	APIKey             string          `json:"APIKey"`
	BoundingBoxes      [][2][2]float64 `json:"BoundingBoxes"`
	FilterMessageTypes []string        `json:"FilterMessageTypes"`
}

func (c *Client) session(ctx context.Context) error {
	dialCtx, cancel := context.WithTimeout(ctx, 15*time.Second)
	defer cancel()
	conn, _, err := websocket.Dial(dialCtx, c.url, nil)
	if err != nil {
		return fmt.Errorf("dial: %w", err)
	}
	defer conn.CloseNow()
	conn.SetReadLimit(1 << 20)

	// aisstream closes the socket unless the subscription arrives within
	// three seconds of connecting.
	sub, _ := json.Marshal(subscription{
		APIKey:        c.apiKey,
		BoundingBoxes: [][2][2]float64{boundingBox},
		FilterMessageTypes: []string{
			"ShipStaticData", "StaticDataReport",
			"StandardClassBPositionReport", "ExtendedClassBPositionReport",
		},
	})
	if err := conn.Write(dialCtx, websocket.MessageText, sub); err != nil {
		return fmt.Errorf("subscribe: %w", err)
	}
	c.setConnected(true)
	log.Println("aisstream: subscribed (class B positions + static data)")

	for {
		// Reports are sparse per vessel but steady across the area; a silent
		// socket this long is dead.
		readCtx, cancel := context.WithTimeout(ctx, 2*time.Minute)
		_, data, err := conn.Read(readCtx)
		cancel()
		if err != nil {
			return err
		}
		if err := c.handle(data); err != nil {
			return err
		}
	}
}

type envelope struct {
	MessageType string `json:"MessageType"`
	Error       string `json:"error"`
	MetaData    struct {
		MMSI    int    `json:"MMSI"`
		TimeUTC string `json:"time_utc"` // "2026-10-03 08:33:18.422393783 +0000 UTC"
	} `json:"MetaData"`
	Message struct {
		ShipStaticData   *shipStaticData   `json:"ShipStaticData"`
		StaticDataReport *staticDataReport `json:"StaticDataReport"`
		StandardClassB   *classBPosition   `json:"StandardClassBPositionReport"`
		ExtendedClassB   *classBPosition   `json:"ExtendedClassBPositionReport"`
	} `json:"Message"`
}

// classBPosition is AIS message 18 (standard class B position) or 19
// (extended: the same plus name, type and size).
type classBPosition struct {
	Valid       bool
	Latitude    float64
	Longitude   float64
	Sog         float64
	Cog         float64
	TrueHeading int
	Name        string
	Type        int
	Dimension   dimension
}

// position converts the report to a Position, mapping the AIS
// "unavailable" sentinels (SOG 102.3, COG 360, heading 511) away.
func (p *classBPosition) position(mmsi int, ts int64) (Position, bool) {
	lat, lon := p.Latitude, p.Longitude
	if (lat == 0 && lon == 0) || lat < -90 || lat > 90 || lon < -180 || lon > 180 {
		return Position{}, false
	}
	pos := Position{MMSI: mmsi, Lat: lat, Lng: lon, Ts: ts}
	if p.Sog >= 0 && p.Sog < 102.3 {
		pos.Sog = p.Sog
	}
	if p.Cog >= 0 && p.Cog < 360 {
		pos.Cog = p.Cog
	}
	if p.TrueHeading >= 0 && p.TrueHeading < 360 {
		h := p.TrueHeading
		pos.Hdg = &h
	}
	return pos, true
}

// metaTime parses aisstream's MetaData.time_utc, falling back to now.
func metaTime(s string) int64 {
	if t, err := time.Parse("2006-01-02 15:04:05.999999999 -0700 MST", s); err == nil {
		return t.Unix()
	}
	return time.Now().Unix()
}

type dimension struct {
	A, B, C, D int
}

func (d dimension) size() (length, beam int) {
	return d.A + d.B, d.C + d.D
}

// shipStaticData is AIS message 5 (class A static and voyage data).
type shipStaticData struct {
	Valid                bool
	Name                 string
	CallSign             string
	ImoNumber            int64
	Type                 int
	Destination          string
	MaximumStaticDraught float64
	Dimension            dimension
	Eta                  struct{ Month, Day, Hour, Minute int }
}

// staticDataReport is AIS message 24 (class B static data), sent as two
// independent parts: A carries the name, B the type, call sign and size.
type staticDataReport struct {
	Valid   bool
	ReportA struct {
		Valid bool
		Name  string
	}
	ReportB struct {
		Valid     bool
		CallSign  string
		ShipType  int
		Dimension dimension
	}
}

// handle decodes one message: static data is merged into the vessel's
// record, positions are passed on. Only a server-reported error (bad key, bad
// subscription) is returned, which drops the connection; malformed messages
// are skipped.
func (c *Client) handle(data []byte) error {
	var env envelope
	if err := json.Unmarshal(data, &env); err != nil {
		return nil
	}
	if env.Error != "" {
		return fmt.Errorf("server: %s", env.Error)
	}
	mmsi := env.MetaData.MMSI
	if mmsi <= 0 {
		return nil
	}

	var apply func(*Static)
	var pos *classBPosition
	switch {
	case env.Message.StandardClassB != nil && env.Message.StandardClassB.Valid:
		messagesCounter.WithLabelValues("StandardClassBPositionReport").Inc()
		pos = env.Message.StandardClassB
		// Carries no static data, but does prove the transponder is class B.
		apply = func(s *Static) { s.ClassB = true }
	case env.Message.ExtendedClassB != nil && env.Message.ExtendedClassB.Valid:
		messagesCounter.WithLabelValues("ExtendedClassBPositionReport").Inc()
		m := env.Message.ExtendedClassB
		pos = m
		// Only what it actually reports: a blank type 19 field must not wipe
		// what a type 24 report already supplied.
		apply = func(s *Static) {
			s.ClassB = true
			if name := cleanText(m.Name); name != "" {
				s.Name = name
			}
			if m.Type != 0 {
				s.ShipType = m.Type
			}
			if l, b := m.Dimension.size(); l > 0 {
				s.Length, s.Beam = l, b
			}
		}
	case env.Message.ShipStaticData != nil && env.Message.ShipStaticData.Valid:
		messagesCounter.WithLabelValues("ShipStaticData").Inc()
		m := env.Message.ShipStaticData
		apply = func(s *Static) {
			s.ClassB = false
			s.Name = cleanText(m.Name)
			s.CallSign = cleanText(m.CallSign)
			s.IMO = m.ImoNumber
			s.ShipType = m.Type
			s.Dest = cleanText(m.Destination)
			s.Draught = m.MaximumStaticDraught
			s.ETA = formatETA(m.Eta.Month, m.Eta.Day, m.Eta.Hour, m.Eta.Minute)
			s.Length, s.Beam = m.Dimension.size()
		}
	case env.Message.StaticDataReport != nil && env.Message.StaticDataReport.Valid:
		messagesCounter.WithLabelValues("StaticDataReport").Inc()
		m := env.Message.StaticDataReport
		switch {
		case m.ReportA.Valid:
			apply = func(s *Static) {
				s.ClassB = true
				s.Name = cleanText(m.ReportA.Name)
			}
		case m.ReportB.Valid:
			apply = func(s *Static) {
				s.ClassB = true
				s.CallSign = cleanText(m.ReportB.CallSign)
				s.ShipType = m.ReportB.ShipType
				s.Length, s.Beam = m.ReportB.Dimension.size()
			}
		}
	}
	if apply != nil {
		c.mu.Lock()
		s := c.vessels[mmsi]
		before := s
		s.MMSI = mmsi
		apply(&s)
		s.Seen = time.Now().Unix()
		c.vessels[mmsi] = s
		c.mu.Unlock()

		// Seen always moves; only a change in content is worth a re-broadcast.
		before.Seen = s.Seen
		if before != s && c.cb.OnStatic != nil {
			c.cb.OnStatic(mmsi)
		}
	}

	// After the static merge, so a type 19 fix carries its own name.
	if pos != nil && c.cb.OnPosition != nil {
		if p, ok := pos.position(mmsi, metaTime(env.MetaData.TimeUTC)); ok {
			c.cb.OnPosition(p)
		}
	}
	return nil
}

func (c *Client) pruneLoop(ctx context.Context) {
	ticker := time.NewTicker(time.Hour)
	defer ticker.Stop()
	for {
		select {
		case <-ctx.Done():
			return
		case <-ticker.C:
			cutoff := time.Now().Add(-retention).Unix()
			c.mu.Lock()
			for mmsi, s := range c.vessels {
				if s.Seen < cutoff {
					delete(c.vessels, mmsi)
				}
			}
			c.mu.Unlock()
		}
	}
}

// cleanText strips AIS six-bit padding ('@') and the trailing spaces
// aisstream leaves on fixed-width text fields.
func cleanText(s string) string {
	if i := strings.IndexByte(s, '@'); i >= 0 {
		s = s[:i]
	}
	return strings.TrimSpace(s)
}

// formatETA renders an AIS ETA as "MM-DD HH:MM" (UTC), matching the format
// the Digitraffic ingest produces. Returns "" when unavailable (month or day
// 0, hour 24, minute 60).
func formatETA(month, day, hour, minute int) string {
	if month < 1 || month > 12 || day < 1 || day > 31 || hour > 23 || minute > 59 {
		return ""
	}
	return fmt.Sprintf("%02d-%02d %02d:%02d", month, day, hour, minute)
}
