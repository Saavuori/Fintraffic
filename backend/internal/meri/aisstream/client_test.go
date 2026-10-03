package aisstream

import "testing"

// Trimmed real messages from the stream (Finnish waters, 2026-10-03).
const (
	classA = `{"MetaData":{"MMSI":230713000},"MessageType":"ShipStaticData","Message":{"ShipStaticData":{"CallSign":"OIZS   ","Destination":"FIHEL<>FIMHQ<>SESTO","Dimension":{"A":23,"B":166,"C":17,"D":17},"Eta":{"Day":3,"Hour":7,"Minute":10,"Month":10},"ImoNumber":8719188,"MaximumStaticDraught":6.7,"MessageID":5,"Name":"VIKING CINDERELLA   ","Type":60,"UserID":230713000,"Valid":true}}}`
	noETA  = `{"MetaData":{"MMSI":230716000},"MessageType":"ShipStaticData","Message":{"ShipStaticData":{"CallSign":"OIHG   ","Destination":"","Dimension":{"A":12,"B":23,"C":5,"D":5},"Eta":{"Day":0,"Hour":24,"Minute":60,"Month":0},"ImoNumber":7618399,"Name":"KRAFT@@@@","Type":52,"Valid":true}}}`
	partA  = `{"MetaData":{"MMSI":230944060},"MessageType":"StaticDataReport","Message":{"StaticDataReport":{"MessageID":24,"ReportA":{"Name":"RVS308B             ","Valid":true},"ReportB":{"CallSign":"","Dimension":{"A":0,"B":0,"C":0,"D":0},"ShipType":0,"Valid":false},"UserID":230944060,"Valid":true}}}`
	posB   = `{"MetaData":{"MMSI":265754310,"time_utc":"2026-10-03 08:43:43.563705035 +0000 UTC"},"MessageType":"StandardClassBPositionReport","Message":{"StandardClassBPositionReport":{"Cog":360,"Latitude":59.457303333333336,"Longitude":18.284208333333332,"MessageID":18,"Sog":102.3,"TrueHeading":511,"UserID":265754310,"Valid":true}}}`
	extB   = `{"MetaData":{"MMSI":230111111,"time_utc":"2026-10-03 08:44:00 +0000 UTC"},"MessageType":"ExtendedClassBPositionReport","Message":{"ExtendedClassBPositionReport":{"Cog":91.5,"Latitude":60.1,"Longitude":24.9,"MessageID":19,"Name":"ARIEL@@@@","Sog":5.2,"TrueHeading":90,"Type":36,"Dimension":{"A":7,"B":3,"C":2,"D":1},"UserID":230111111,"Valid":true}}}`
	partB  = `{"MetaData":{"MMSI":230944060},"MessageType":"StaticDataReport","Message":{"StaticDataReport":{"MessageID":24,"ReportA":{"Name":"","Valid":false},"ReportB":{"CallSign":"OH1234","Dimension":{"A":8,"B":4,"C":2,"D":2},"ShipType":37,"Valid":true},"UserID":230944060,"Valid":true}}}`
)

func TestHandleClassA(t *testing.T) {
	var updated []int
	c := New("", "", Callbacks{OnStatic: func(m int) { updated = append(updated, m) }})
	if err := c.handle([]byte(classA)); err != nil {
		t.Fatal(err)
	}
	s, ok := c.Get(230713000)
	if !ok {
		t.Fatal("vessel not stored")
	}
	if s.Name != "VIKING CINDERELLA" || s.CallSign != "OIZS" || s.IMO != 8719188 || s.ShipType != 60 {
		t.Errorf("identity: %+v", s)
	}
	if s.Length != 189 || s.Beam != 34 || s.Draught != 6.7 || s.ETA != "10-03 07:10" || s.ClassB {
		t.Errorf("voyage/size: %+v", s)
	}
	if len(updated) != 1 {
		t.Errorf("onUpdate calls = %d, want 1", len(updated))
	}

	// A repeat of the same report changes nothing, so it is not re-broadcast.
	_ = c.handle([]byte(classA))
	if len(updated) != 1 {
		t.Errorf("repeat triggered onUpdate (%d calls)", len(updated))
	}
}

func TestHandleUnavailableFields(t *testing.T) {
	c := New("", "", Callbacks{})
	_ = c.handle([]byte(noETA))
	s, _ := c.Get(230716000)
	if s.Name != "KRAFT" {
		t.Errorf("padding not stripped: %q", s.Name)
	}
	if s.ETA != "" {
		t.Errorf("unavailable ETA rendered as %q", s.ETA)
	}
}

func TestHandleClassBMergesParts(t *testing.T) {
	c := New("", "", Callbacks{})
	_ = c.handle([]byte(partA))
	_ = c.handle([]byte(partB))
	s, _ := c.Get(230944060)
	if !s.ClassB || s.Name != "RVS308B" || s.CallSign != "OH1234" || s.ShipType != 37 || s.Length != 12 || s.Beam != 4 {
		t.Errorf("merged class B: %+v", s)
	}
}

func TestHandleServerError(t *testing.T) {
	c := New("", "", Callbacks{})
	if err := c.handle([]byte(`{"error":"Api Key Is Not Valid"}`)); err == nil {
		t.Error("server error not surfaced")
	}
	if err := c.handle([]byte(`not json`)); err != nil {
		t.Errorf("malformed message dropped the connection: %v", err)
	}
}

func TestNilClient(t *testing.T) {
	var c *Client
	if _, ok := c.Get(1); ok || c.Len() != 0 || c.IsConnected() {
		t.Error("nil client not inert")
	}
}

func TestHandleClassBPositions(t *testing.T) {
	var got []Position
	var nameAtFix string
	var c *Client
	c = New("", "", Callbacks{OnPosition: func(p Position) {
		got = append(got, p)
		s, _ := c.Get(p.MMSI)
		nameAtFix = s.Name
	}})

	_ = c.handle([]byte(posB))
	if len(got) != 1 {
		t.Fatalf("positions = %d, want 1", len(got))
	}
	p := got[0]
	if p.MMSI != 265754310 || p.Lat < 59.45 || p.Lng < 18.28 || p.Ts != 1791017023 {
		t.Errorf("standard fix: %+v", p)
	}
	if p.Sog != 0 || p.Cog != 0 || p.Hdg != nil {
		t.Errorf("unavailable sentinels leaked: sog=%v cog=%v hdg=%v", p.Sog, p.Cog, p.Hdg)
	}
	if s, ok := c.Get(265754310); !ok || !s.ClassB {
		t.Errorf("type 18 sender not marked class B: %+v", s)
	}

	// Type 19 carries static data; it is merged before the fix goes out.
	_ = c.handle([]byte(extB))
	if len(got) != 2 || got[1].Hdg == nil || *got[1].Hdg != 90 || got[1].Sog != 5.2 {
		t.Fatalf("extended fix: %+v", got)
	}
	if nameAtFix != "ARIEL" {
		t.Errorf("name at fix time = %q, want ARIEL", nameAtFix)
	}
	s, _ := c.Get(230111111)
	if !s.ClassB || s.ShipType != 36 || s.Length != 10 || s.Beam != 3 {
		t.Errorf("extended static: %+v", s)
	}

	// A later type 19 with a blank name keeps the known one.
	_ = c.handle([]byte(`{"MetaData":{"MMSI":230111111},"Message":{"ExtendedClassBPositionReport":{"Latitude":60.2,"Longitude":24.8,"Name":"@@@@","Valid":true}}}`))
	if s, _ := c.Get(230111111); s.Name != "ARIEL" || s.ShipType != 36 {
		t.Errorf("blank type 19 wiped static data: %+v", s)
	}
}
