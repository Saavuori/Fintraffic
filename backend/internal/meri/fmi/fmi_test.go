package fmi

import (
	"testing"
	"time"
)

// Trimmed from a live fmi::observations::wave::simple response. Keeps the
// namespace prefixes and the trailing space inside gml:pos that FMI emits, and
// one NaN element — every station reports a row for every timestep whether or
// not the sensor had anything to say.
const waveSample = `<?xml version="1.0" encoding="UTF-8"?>
<wfs:FeatureCollection
  xmlns:wfs="http://www.opengis.net/wfs/2.0"
  xmlns:gml="http://www.opengis.net/gml/3.2"
  xmlns:BsWfs="http://xml.fmi.fi/schema/wfs/2.0">
  <wfs:member>
    <BsWfs:BsWfsElement gml:id="BsWfsElement.1.1.1">
      <BsWfs:Location>
        <gml:Point gml:id="BsWfsElementP.1.1.1" srsName="http://www.opengis.net/def/crs/EPSG/0/4258">
          <gml:pos>64.68410 23.23800 </gml:pos>
        </gml:Point>
      </BsWfs:Location>
      <BsWfs:Time>2026-07-25T12:30:00Z</BsWfs:Time>
      <BsWfs:ParameterName>WaveHs</BsWfs:ParameterName>
      <BsWfs:ParameterValue>0.8</BsWfs:ParameterValue>
    </BsWfs:BsWfsElement>
  </wfs:member>
  <wfs:member>
    <BsWfs:BsWfsElement gml:id="BsWfsElement.1.1.2">
      <BsWfs:Location>
        <gml:Point gml:id="BsWfsElementP.1.1.2" srsName="http://www.opengis.net/def/crs/EPSG/0/4258">
          <gml:pos>64.68410 23.23800 </gml:pos>
        </gml:Point>
      </BsWfs:Location>
      <BsWfs:Time>2026-07-25T13:00:00Z</BsWfs:Time>
      <BsWfs:ParameterName>WaveHs</BsWfs:ParameterName>
      <BsWfs:ParameterValue>0.7</BsWfs:ParameterValue>
    </BsWfs:BsWfsElement>
  </wfs:member>
  <wfs:member>
    <BsWfs:BsWfsElement gml:id="BsWfsElement.1.1.3">
      <BsWfs:Location>
        <gml:Point gml:id="BsWfsElementP.1.1.3" srsName="http://www.opengis.net/def/crs/EPSG/0/4258">
          <gml:pos>65.18083 25.03250 </gml:pos>
        </gml:Point>
      </BsWfs:Location>
      <BsWfs:Time>2026-07-25T13:00:00Z</BsWfs:Time>
      <BsWfs:ParameterName>WaveHs</BsWfs:ParameterName>
      <BsWfs:ParameterValue>NaN</BsWfs:ParameterValue>
    </BsWfs:BsWfsElement>
  </wfs:member>
</wfs:FeatureCollection>`

func TestParseSimpleDropsMissingReadings(t *testing.T) {
	obs, err := parseSimple([]byte(waveSample))
	if err != nil {
		t.Fatalf("parseSimple: %v", err)
	}
	if len(obs) != 2 {
		t.Fatalf("expected 2 usable observations (the NaN one dropped), got %d", len(obs))
	}

	first := obs[0]
	if first.Lat != 64.68410 || first.Lon != 23.23800 {
		// gml:pos is latitude-first; getting this backwards puts every buoy
		// in the wrong hemisphere.
		t.Errorf("position parsed as %v,%v want 64.6841,23.238", first.Lat, first.Lon)
	}
	if first.Param != "WaveHs" || first.Value != 0.8 {
		t.Errorf("got %s=%v want WaveHs=0.8", first.Param, first.Value)
	}
	if want := time.Date(2026, 7, 25, 12, 30, 0, 0, time.UTC); !first.Time.Equal(want) {
		t.Errorf("time %v want %v", first.Time, want)
	}
}

func TestParseSimpleSurfacesExceptionReport(t *testing.T) {
	const body = `<?xml version="1.0"?>
<ExceptionReport xmlns="http://www.opengis.net/ows/1.1" version="2.0.0">
  <Exception exceptionCode="OperationParsingFailed">
    <ExceptionText>Unknown stored query id</ExceptionText>
  </Exception>
</ExceptionReport>`

	if _, err := parseSimple([]byte(body)); err == nil {
		t.Fatal("expected an error for an exception report, got nil")
	} else if got := err.Error(); got != "FMI: Unknown stored query id" {
		t.Errorf("error = %q, want it to carry FMI's message", got)
	}
}

func TestCanonicalFieldAcrossNetworks(t *testing.T) {
	// The three networks name the same quantities differently; water
	// temperature in particular arrives as TWATER from a buoy and
	// TW_PT1H_AVG from a mareograph.
	cases := map[string]string{
		"WaveHs":      "waveHeight",
		"ModalWDi":    "waveDir",
		"TWATER":      "waterTemp",
		"TW_PT1H_AVG": "waterTemp",
		"WATLEV":      "waterLevel",
		"ws_10min":    "windSpeed",
		"WS_10MIN":    "windSpeed", // matching is case-insensitive
		"rrday":       "",          // not a parameter we ask for
	}
	for param, want := range cases {
		if got := canonicalField(param); got != want {
			t.Errorf("canonicalField(%q) = %q, want %q", param, got, want)
		}
	}
}

func TestNearestKnownPrefersTheCloserStation(t *testing.T) {
	// Turku has two mareographs ~400 m apart, both inside one tolerance
	// radius — the match must not be decided by table order.
	ks := nearestKnown(60.42532, 22.09611)
	if ks == nil {
		t.Fatal("expected a match for the Turku mareograph position")
	}
	if ks.FMISID != "100845" {
		t.Errorf("matched %s (%s), want 100845 Turku Ruissalo Saarontie", ks.FMISID, ks.Name)
	}
}

func TestStationNameFallsBackToPosition(t *testing.T) {
	// A buoy FMI has deployed but we haven't listed still has to render.
	if got := stationName(62.5, 20.0); got != "62.50°N 20.00°E" {
		t.Errorf("stationName = %q, want a positional label", got)
	}
}

func TestBuildStationsConvertsWaterLevelToCentimetres(t *testing.T) {
	at := time.Date(2026, 7, 25, 13, 0, 0, 0, time.UTC)
	sites := map[string]*site{
		"60.1536,24.9562": {
			lat:   60.15363,
			lon:   24.95622,
			kinds: map[string]bool{"waterLevel": true},
			readings: map[string]reading{
				// FMI publishes this in millimetres.
				"waterLevel": {value: 63, at: at},
				"waterTemp":  {value: 17.5, at: at},
			},
		},
	}

	got := buildStations(sites)
	if len(got) != 1 {
		t.Fatalf("expected 1 station, got %d", len(got))
	}
	st := got[0]
	if st.WaterLevel == nil || *st.WaterLevel != 6.3 {
		t.Errorf("water level = %v, want 6.3 cm from 63 mm", st.WaterLevel)
	}
	if st.Name != "Helsinki Kaivopuisto" {
		t.Errorf("name = %q, want the known station name", st.Name)
	}
	if len(st.Kinds) != 1 || st.Kinds[0] != "waterLevel" {
		t.Errorf("kinds = %v, want [waterLevel]", st.Kinds)
	}
	if st.Observed != "2026-07-25T13:00:00Z" {
		t.Errorf("observed = %q, want the newest reading's time", st.Observed)
	}
	if st.WaveHeight != nil {
		t.Error("a mareograph must not report a wave height")
	}
}

func TestBuildStationsKeepsNewestReadingPerField(t *testing.T) {
	older := time.Date(2026, 7, 25, 12, 30, 0, 0, time.UTC)
	newer := older.Add(30 * time.Minute)
	sites := map[string]*site{
		"64.6841,23.2380": {
			lat:      64.6841,
			lon:      23.238,
			kinds:    map[string]bool{"wave": true},
			readings: map[string]reading{"waveHeight": {value: 0.7, at: newer}},
		},
	}
	got := buildStations(sites)
	if got[0].WaveHeight == nil || *got[0].WaveHeight != 0.7 {
		t.Errorf("wave height = %v, want the newest 0.7", got[0].WaveHeight)
	}
	if got[0].Observed != "2026-07-25T13:00:00Z" {
		t.Errorf("observed = %q, want the newest timestamp", got[0].Observed)
	}
}
