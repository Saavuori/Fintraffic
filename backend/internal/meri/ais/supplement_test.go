package ais

import (
	"context"
	"encoding/json"
	"testing"

	"fintraffic/internal/core/cache"
)

func TestSupplementFillsGapsOnly(t *testing.T) {
	c := cache.NewMemoryCache()
	w := NewIngestionWorker("", c)
	sup := map[int]VesselMetadata{}
	w.SetSupplement(func(mmsi int) (VesselMetadata, bool) {
		m, ok := sup[mmsi]
		return m, ok
	})

	// Class B boat: no Digitraffic metadata at all.
	w.handleLocation(230944060, []byte(`{"time":1700000000,"lat":60.4,"lon":22.0}`))
	sup[230944060] = VesselMetadata{Name: "RVS308B", ShipType: 37}
	w.RefreshMeta(230944060)

	// Class A ship: Digitraffic wins where it has a value.
	w.handleMetadata(230713000, []byte(`{"name":"VIKING CINDERELLA","destination":"","type":60}`))
	sup[230713000] = VesselMetadata{Name: "WRONG", Dest: "FIHEL", ShipType: 70}
	w.handleLocation(230713000, []byte(`{"time":1700000000,"lat":60.1,"lon":24.9}`))

	all, err := c.GetAllPositions(context.Background())
	if err != nil {
		t.Fatal(err)
	}
	var b, a VesselPosition
	_ = json.Unmarshal(all["230944060"], &b)
	_ = json.Unmarshal(all["230713000"], &a)

	if b.Name != "RVS308B" || b.ShipType != 37 {
		t.Errorf("class B not filled: %+v", b)
	}
	if a.Name != "VIKING CINDERELLA" || a.ShipType != 60 || a.Dest != "FIHEL" {
		t.Errorf("class A merge: %+v", a)
	}
}

func TestExternalPositionsNeverOverrideDigitraffic(t *testing.T) {
	c := cache.NewMemoryCache()
	w := NewIngestionWorker("", c)
	w.SetSupplement(func(mmsi int) (VesselMetadata, bool) {
		if mmsi == 230111111 {
			return VesselMetadata{Name: "ARIEL", ShipType: 36}, true
		}
		return VesselMetadata{}, false
	})
	get := func(mmsi string) VesselPosition {
		all, _ := c.GetAllPositions(context.Background())
		var p VesselPosition
		_ = json.Unmarshal(all[mmsi], &p)
		return p
	}

	// A class B boat only aisstream knows: shown, with its static data.
	w.HandleExternalPosition(VesselPosition{MMSI: 230111111, Lat: 60.1, Lng: 24.9, Ts: 100, NavStat: 15})
	if p := get("230111111"); p.Name != "ARIEL" || p.Lat != 60.1 || p.Source != SourceAisstream {
		t.Errorf("external fix not cached: %+v", p)
	}
	// Older external fix is ignored; newer one moves it.
	w.HandleExternalPosition(VesselPosition{MMSI: 230111111, Lat: 50, Lng: 20, Ts: 90})
	w.HandleExternalPosition(VesselPosition{MMSI: 230111111, Lat: 60.2, Lng: 24.8, Ts: 110})
	if p := get("230111111"); p.Lat != 60.2 {
		t.Errorf("external ordering: %+v", p)
	}

	// Digitraffic owns any MMSI it reports: a later external fix is ignored.
	w.handleLocation(230713000, []byte(`{"time":100,"lat":60.1,"lon":24.9}`))
	w.HandleExternalPosition(VesselPosition{MMSI: 230713000, Lat: 59, Lng: 23, Ts: 200})
	if p := get("230713000"); p.Lat != 60.1 {
		t.Errorf("external fix overrode Digitraffic: %+v", p)
	}

	// ...and Digitraffic takes over an MMSI first seen via aisstream.
	w.handleLocation(230111111, []byte(`{"time":105,"lat":61,"lon":25}`))
	if p := get("230111111"); p.Lat != 61 || p.Source != SourceDigitraffic {
		t.Errorf("Digitraffic did not take over: %+v", p)
	}
	w.HandleExternalPosition(VesselPosition{MMSI: 230111111, Lat: 62, Lng: 26, Ts: 300})
	if p := get("230111111"); p.Lat != 61 {
		t.Errorf("external fix crept back in: %+v", p)
	}
}
