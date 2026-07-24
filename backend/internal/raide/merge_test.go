package raide

import (
	"testing"
	"time"
)

func testLiveTrain() LiveTrain {
	return LiveTrain{
		TrainNumber:       59,
		DepartureDate:     "2026-07-24",
		TrainType:         "IC",
		TrainCategory:     "Long-distance",
		OperatorShortCode: "vr",
		TimeTableRows: []TimeTableRow{
			{Type: "DEPARTURE", StationShortCode: "HKI", CommercialStop: true, TrainStopping: true,
				ScheduledTime: "2026-07-24T05:00:00.000Z", ActualTime: "2026-07-24T05:00:30.000Z", DifferenceInMin: 1},
			{Type: "ARRIVAL", StationShortCode: "TPE", CommercialStop: true, TrainStopping: true,
				ScheduledTime: "2026-07-24T06:30:00.000Z", LiveEstimateTime: "2026-07-24T06:32:00.000Z", CommercialTrack: "3"},
		},
	}
}

func TestMergeTrainsJoinsAndComputesDelay(t *testing.T) {
	locations := []TrainLocation{{TrainNumber: 59, DepartureDate: "2026-07-24", Speed: 143}}
	locations[0].Location.Coordinates = [2]float64{23.76, 61.49}
	names := map[string]string{"HKI": "Helsinki", "TPE": "Tampere"}

	trains := MergeTrains(locations, []LiveTrain{testLiveTrain()}, names)
	if len(trains) != 1 {
		t.Fatalf("expected 1 merged train, got %d", len(trains))
	}
	tr := trains[0]
	if tr.Category != "Long-distance" || tr.Origin != "Helsinki" || tr.Dest != "Tampere" {
		t.Fatalf("join failed: %+v", tr)
	}
	if !tr.HasDelay || tr.DelayMin != 1 {
		t.Fatalf("delay should come from the last passed row: %+v", tr)
	}
	if tr.NextStop == nil || tr.NextStop.Code != "TPE" || tr.NextStop.Track != "3" {
		t.Fatalf("next stop wrong: %+v", tr.NextStop)
	}
	if tr.Latitude != 61.49 || tr.Longitude != 23.76 {
		t.Fatalf("coordinates not [lon,lat]-swapped: %+v", tr)
	}
}

func TestMergeTrainsKeepsTimetablelessPositions(t *testing.T) {
	locations := []TrainLocation{{TrainNumber: 8123, DepartureDate: "2026-07-24"}}
	trains := MergeTrains(locations, nil, nil)
	if len(trains) != 1 || trains[0].Category != "Unknown" {
		t.Fatalf("position without timetable should render with Unknown category: %+v", trains)
	}
}

func TestBuildBoardWindowsAndSorts(t *testing.T) {
	now, _ := time.Parse(time.RFC3339, "2026-07-24T06:00:00.000Z")
	board := BuildBoard("TPE", []LiveTrain{testLiveTrain()}, map[string]string{"HKI": "Helsinki"}, now)
	if len(board.Arrivals) != 1 {
		t.Fatalf("expected 1 arrival at TPE, got %+v", board)
	}
	row := board.Arrivals[0]
	if row.Terminus != "Helsinki" {
		t.Fatalf("arrival terminus should be the origin: %+v", row)
	}
	if row.LiveTime != "2026-07-24T06:32:00.000Z" {
		t.Fatalf("live time should fall back to the estimate: %+v", row)
	}
	// The HKI departure is over an hour in the past — outside the look-back.
	if len(board.Departures) != 0 {
		t.Fatalf("stale departures should be windowed out: %+v", board.Departures)
	}
}
