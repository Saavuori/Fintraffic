package ais

import "fmt"

// VesselPosition is the merged position+metadata record stored in cache and
// streamed to clients, keyed by MMSI.
type VesselPosition struct {
	MMSI    int     `json:"mmsi"`
	Lat     float64 `json:"lat"`
	Lng     float64 `json:"lng"`
	Sog     float64 `json:"sog"`
	Cog     float64 `json:"cog"`
	Hdg     *int    `json:"hdg,omitempty"` // nil when AIS reports 511 (unavailable)
	NavStat int     `json:"navStat"`
	Rot     float64 `json:"rot,omitempty"`
	Ts      int64   `json:"ts"` // epoch seconds of the position fix

	// Merged metadata; empty until a metadata message or hydration fills it
	Name     string  `json:"name,omitempty"`
	CallSign string  `json:"callSign,omitempty"`
	Dest     string  `json:"dest,omitempty"`
	ShipType int     `json:"shipType,omitempty"`
	IMO      int64   `json:"imo,omitempty"`
	Draught  float64 `json:"draught,omitempty"` // meters
	ETA      string  `json:"eta,omitempty"`     // "MM-DD HH:MM" UTC
}

// VesselMetadata holds the decoded static/voyage data for one vessel.
type VesselMetadata struct {
	Name     string
	CallSign string
	Dest     string
	ShipType int
	IMO      int64
	Draught  float64
	ETA      string
}

// mqttLocation is the vessels-v2/<mmsi>/location payload.
type mqttLocation struct {
	Time    int64   `json:"time"` // epoch seconds
	Sog     float64 `json:"sog"`
	Cog     float64 `json:"cog"`
	NavStat int     `json:"navStat"`
	Rot     float64 `json:"rot"`
	PosAcc  bool    `json:"posAcc"`
	Raim    bool    `json:"raim"`
	Heading int     `json:"heading"`
	Lon     float64 `json:"lon"`
	Lat     float64 `json:"lat"`
}

// mqttMetadata is the vessels-v2/<mmsi>/metadata payload. The REST
// /api/ais/v1/vessels items use the same fields except `type` is `shipType`.
type mqttMetadata struct {
	Timestamp   int64  `json:"timestamp"` // epoch milliseconds
	Destination string `json:"destination"`
	Name        string `json:"name"`
	Draught     int    `json:"draught"` // decimeters
	ETA         int64  `json:"eta"`     // packed AIS bitfield
	PosType     int    `json:"posType"`
	CallSign    string `json:"callSign"`
	IMO         int64  `json:"imo"`
	MMSI        int    `json:"mmsi"`
	Type        int    `json:"type"`
	ShipType    int    `json:"shipType"`
}

func (m *mqttMetadata) shipType() int {
	if m.ShipType != 0 {
		return m.ShipType
	}
	return m.Type
}

func (m *mqttMetadata) toMetadata() VesselMetadata {
	return VesselMetadata{
		Name:     m.Name,
		CallSign: m.CallSign,
		Dest:     m.Destination,
		ShipType: m.shipType(),
		IMO:      m.IMO,
		Draught:  float64(m.Draught) / 10.0,
		ETA:      decodeETA(m.ETA),
	}
}

// decodeETA unpacks the AIS ETA bitfield (month<<16 | day<<11 | hour<<6 | minute)
// into "MM-DD HH:MM" (UTC). Returns "" when unavailable.
func decodeETA(eta int64) string {
	if eta <= 0 {
		return ""
	}
	month := (eta >> 16) & 0xF
	day := (eta >> 11) & 0x1F
	hour := (eta >> 6) & 0x1F
	minute := eta & 0x3F
	// month 0 / day 0 = not available; hour 24 / minute 60 = time not available
	if month == 0 || day == 0 || hour > 23 || minute > 59 {
		return ""
	}
	return fmt.Sprintf("%02d-%02d %02d:%02d", month, day, hour, minute)
}

// validCoords rejects AIS "unavailable" sentinels (lat 91, lon 181) and 0,0.
func validCoords(lat, lon float64) bool {
	if lat == 0 && lon == 0 {
		return false
	}
	return lat >= -90 && lat <= 90 && lon >= -180 && lon <= 180
}

func (p *VesselPosition) applyMeta(m VesselMetadata) {
	p.Name = m.Name
	p.CallSign = m.CallSign
	p.Dest = m.Dest
	p.ShipType = m.ShipType
	p.IMO = m.IMO
	p.Draught = m.Draught
	p.ETA = m.ETA
}
