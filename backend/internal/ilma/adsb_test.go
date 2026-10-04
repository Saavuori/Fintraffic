package ilma

import (
	"encoding/json"
	"testing"
	"time"
)

func decodeOne(t *testing.T, raw string) rawAircraft {
	t.Helper()
	var r rawAircraft
	if err := json.Unmarshal([]byte(raw), &r); err != nil {
		t.Fatal(err)
	}
	return r
}

func TestNormalizeAirliner(t *testing.T) {
	fetched := time.UnixMilli(1_700_000_000_000)
	r := decodeOne(t, `{"hex":"461E18","type":"adsb_icao","flight":"FIN2JA  ","r":"OH-LKI","t":"E190",
		"desc":"EMBRAER ERJ-190-100","alt_baro":39000,"gs":452.3,"track":65.02,"baro_rate":-64,
		"squawk":"0434","emergency":"none","category":"A3","lat":60.5,"lon":24.9,"seen_pos":0.5}`)

	a, ok := normalize(r, fetched)
	if !ok {
		t.Fatal("airliner dropped")
	}
	if a.Hex != "461e18" || a.Callsign != "FIN2JA" || a.Registration != "OH-LKI" {
		t.Errorf("identity: got %+v", a)
	}
	if a.Group != GroupAirline || a.Airline != "Finnair" {
		t.Errorf("group/airline: got %q/%q", a.Group, a.Airline)
	}
	if a.AltitudeFt == nil || *a.AltitudeFt != 39000 || a.OnGround {
		t.Errorf("altitude: got %v ground=%v", a.AltitudeFt, a.OnGround)
	}
	if a.VerticalRateFpm == nil || *a.VerticalRateFpm != -64 {
		t.Errorf("vertical rate: got %v", a.VerticalRateFpm)
	}
	if a.Emergency != "" || a.Source != "adsb" {
		t.Errorf("emergency/source: got %q/%q", a.Emergency, a.Source)
	}
	if want := fetched.UnixMilli() - 500; a.Timestamp != want {
		t.Errorf("timestamp: got %d want %d", a.Timestamp, want)
	}
}

func TestNormalizeGroundAndSquawkEmergency(t *testing.T) {
	r := decodeOne(t, `{"hex":"4ac9f5","type":"mlat","flight":"SAS82K","alt_baro":"ground",
		"squawk":"7700","category":"A3","lat":60.3,"lon":24.95,"seen_pos":2}`)
	a, ok := normalize(r, time.Now())
	if !ok {
		t.Fatal("dropped")
	}
	if !a.OnGround || a.AltitudeFt != nil {
		t.Errorf("ground: got ground=%v alt=%v", a.OnGround, a.AltitudeFt)
	}
	if a.Emergency != "general" || a.Source != "mlat" {
		t.Errorf("emergency/source: got %q/%q", a.Emergency, a.Source)
	}
}

func TestNormalizeDrops(t *testing.T) {
	cases := map[string]string{
		"no position":    `{"hex":"aaaaaa","category":"A3"}`,
		"outside area":   `{"hex":"aaaaaa","category":"A3","lat":59.7,"lon":17.9,"seen_pos":1}`,
		"stale":          `{"hex":"aaaaaa","category":"A3","lat":60.3,"lon":24.9,"seen_pos":120}`,
		"ground vehicle": `{"hex":"aaaaaa","category":"C2","lat":60.3,"lon":24.9,"seen_pos":1}`,
		"tower":          `{"hex":"aaaaaa","t":"TWR","category":"C0","lat":60.3,"lon":24.9,"seen_pos":1}`,
	}
	for name, raw := range cases {
		if _, ok := normalize(decodeOne(t, raw), time.Now()); ok {
			t.Errorf("%s: kept, want dropped", name)
		}
	}
}

func TestClassify(t *testing.T) {
	cases := []struct {
		category, callsign string
		dbFlags            int
		want               string
	}{
		{"A3", "FIN2JA", 0, GroupAirline},
		{"A2", "FIN5NB", 0, GroupAirline}, // ATR on a Finnair number
		{"A3", "", 0, GroupAirline},       // big and silent
		{"A1", "OHABC", 0, GroupGeneral},
		{"A2", "OHXYZ", 0, GroupGeneral},
		{"", "", 0, GroupGeneral},
		{"A7", "FIH10", 0, GroupRotorcraft},
		{"A7", "DFL5840", 0, GroupRotorcraft}, // helicopter on an operator callsign
		{"A3", "NATO01", 1, GroupMilitary},
		{"A6", "", 0, GroupMilitary},
	}
	for _, c := range cases {
		if got := classify(c.category, c.callsign, c.dbFlags); got != c.want {
			t.Errorf("classify(%q, %q, %d) = %q, want %q", c.category, c.callsign, c.dbFlags, got, c.want)
		}
	}
}

func TestMergeAircraftKeepsFresher(t *testing.T) {
	south := []Aircraft{{Hex: "b", Timestamp: 100, Latitude: 1}, {Hex: "a", Timestamp: 100}}
	north := []Aircraft{{Hex: "b", Timestamp: 200, Latitude: 2}, {Hex: "c", Timestamp: 50}}

	got := mergeAircraft(south, north)
	if len(got) != 3 {
		t.Fatalf("len = %d, want 3", len(got))
	}
	if got[0].Hex != "a" || got[1].Hex != "b" || got[2].Hex != "c" {
		t.Errorf("not sorted by hex: %v", got)
	}
	if got[1].Latitude != 2 {
		t.Errorf("overlap kept the older fix")
	}
}

func TestTrailsRecordAndExpire(t *testing.T) {
	tr := NewTrails()
	base := time.UnixMilli(10_000_000)
	alt := 1000
	tr.Record([]Aircraft{{Hex: "a", Timestamp: base.UnixMilli(), AltitudeFt: &alt}}, base)
	// Same fix again (no new position since the last poll): not a new point.
	tr.Record([]Aircraft{{Hex: "a", Timestamp: base.UnixMilli(), AltitudeFt: &alt}}, base.Add(10*time.Second))
	later := base.Add(time.Minute)
	tr.Record([]Aircraft{{Hex: "a", Timestamp: later.UnixMilli(), OnGround: true}}, later)

	pts, ok := tr.Get("a")
	if !ok || len(pts) != 2 {
		t.Fatalf("points = %d, want 2", len(pts))
	}
	if pts[1].AltitudeFt == nil || *pts[1].AltitudeFt != 0 {
		t.Errorf("on-ground point should record altitude 0, got %v", pts[1].AltitudeFt)
	}

	// Past the window from the first point only: it is trimmed, the second stays.
	tr.Record(nil, base.Add(trailWindow+time.Second))
	if pts, _ := tr.Get("a"); len(pts) != 1 {
		t.Errorf("after trim: %d points, want 1", len(pts))
	}
	// Past the window from the last point: the aircraft is forgotten.
	tr.Record(nil, later.Add(trailWindow+time.Second))
	if _, ok := tr.Get("a"); ok || tr.Len() != 0 {
		t.Errorf("aircraft not forgotten")
	}
}
