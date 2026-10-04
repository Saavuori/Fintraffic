package ilma

// App-facing response types. The frontend mirrors these in
// src/modes/ilma/lib/aircraft.ts — change one, change both.

// Aircraft groups: what the map colours and the filters toggle by.
const (
	GroupAirline    = "airline"    // scheduled/charter/cargo flights flying an airline callsign
	GroupGeneral    = "general"    // light aircraft, business jets on a registration callsign, unknowns
	GroupRotorcraft = "rotorcraft" // helicopters (emitter category A7)
	GroupMilitary   = "military"   // flagged military in the aircraft database, or high-performance
)

// Aircraft is one airborne (or taxiing) aircraft, normalised from the readsb
// "v2" JSON both adsb.fi and adsb.lol publish. Altitudes are feet and speeds
// knots, as the transponder reports them; the frontend converts for display.
type Aircraft struct {
	Hex          string `json:"hex"`                    // 24-bit ICAO address, lower-case hex
	Callsign     string `json:"callsign"`               // trimmed flight id, may be empty
	Registration string `json:"registration,omitempty"` // tail number, e.g. OH-LVC
	TypeCode     string `json:"typeCode,omitempty"`     // ICAO type designator, e.g. A20N
	TypeName     string `json:"typeName,omitempty"`     // e.g. "AIRBUS A-320neo"
	Airline      string `json:"airline,omitempty"`      // operator name from the callsign prefix
	Category     string `json:"category,omitempty"`     // ADS-B emitter category, A1..B7
	Group        string `json:"group"`

	Latitude  float64 `json:"latitude"`
	Longitude float64 `json:"longitude"`
	// AltitudeFt is barometric altitude; nil when unknown or on the ground.
	AltitudeFt      *int     `json:"altitudeFt,omitempty"`
	OnGround        bool     `json:"onGround"`
	GroundSpeedKt   *float64 `json:"groundSpeedKt,omitempty"`
	Track           *float64 `json:"track,omitempty"` // degrees true, over ground
	VerticalRateFpm *int     `json:"verticalRateFpm,omitempty"`
	Squawk          string   `json:"squawk,omitempty"`
	// Emergency is the transponder's emergency state ("general", "lifeguard",
	// "minfuel", "nordo", "unlawful", "downed"); empty when there is none. A
	// 7500/7600/7700 squawk sets it too.
	Emergency string `json:"emergency,omitempty"`
	// Source is how the position was obtained: "adsb", "mlat" (multilateration
	// by ground receivers), "tisb" or "other".
	Source string `json:"source"`
	// Timestamp is when the position was fixed, unix milliseconds.
	Timestamp int64 `json:"timestamp"`
}

// Snapshot is the response of /api/ilma/aircraft. Time is the server's clock
// at serve time, so a client can dead-reckon from each aircraft's Timestamp
// without trusting its own clock to agree.
type Snapshot struct {
	Time     int64      `json:"time"`
	Aircraft []Aircraft `json:"aircraft"`
}

// TrailPoint is one recorded position on an aircraft's recent track.
type TrailPoint struct {
	Latitude   float64 `json:"latitude"`
	Longitude  float64 `json:"longitude"`
	AltitudeFt *int    `json:"altitudeFt,omitempty"`
	Timestamp  int64   `json:"timestamp"` // unix ms
}

// Airport is one entry of the static Finnish airport register.
type Airport struct {
	ICAO      string  `json:"icao"`
	IATA      string  `json:"iata,omitempty"`
	Name      string  `json:"name"`
	Latitude  float64 `json:"latitude"`
	Longitude float64 `json:"longitude"`
	ElevFt    int     `json:"elevationFt"`
	// Scheduled is true for airports with scheduled passenger service; the map
	// draws them larger and labels them from country-wide zoom.
	Scheduled bool `json:"scheduled"`
}
