package raide

import (
	"sort"
	"time"
)

type trainKey struct {
	number int
	date   string
}

// MergeTrains joins live GPS positions with timetable metadata. Trains without
// a position (not all trains carry a working GPS transponder) are dropped —
// this feed drives map markers, and a train we cannot place is invisible
// anyway. Timetable-less positions still render, just with less detail.
func MergeTrains(locations []TrainLocation, live []LiveTrain, stationNames map[string]string) []Train {
	byKey := make(map[trainKey]*LiveTrain, len(live))
	for i := range live {
		t := &live[i]
		byKey[trainKey{t.TrainNumber, t.DepartureDate}] = t
	}

	name := func(code string) string {
		if n, ok := stationNames[code]; ok {
			return n
		}
		return code
	}

	trains := make([]Train, 0, len(locations))
	for _, loc := range locations {
		train := Train{
			TrainNumber:   loc.TrainNumber,
			DepartureDate: loc.DepartureDate,
			Latitude:      loc.Location.Coordinates[1],
			Longitude:     loc.Location.Coordinates[0],
			Speed:         loc.Speed,
			Timestamp:     loc.Timestamp,
			Category:      "Unknown",
		}

		if lt, ok := byKey[trainKey{loc.TrainNumber, loc.DepartureDate}]; ok {
			train.TrainType = lt.TrainType
			train.Category = lt.TrainCategory
			train.CommuterLine = lt.CommuterLineID
			train.Operator = lt.OperatorShortCode
			train.Cancelled = lt.Cancelled

			if rows := lt.TimeTableRows; len(rows) > 0 {
				train.Origin = name(rows[0].StationShortCode)
				train.Dest = name(rows[len(rows)-1].StationShortCode)
				train.DepartTime = rows[0].ScheduledTime
				train.ArriveTime = rows[len(rows)-1].ScheduledTime

				// Delay at the last station actually passed.
				for i := len(rows) - 1; i >= 0; i-- {
					if rows[i].ActualTime != "" {
						train.DelayMin = rows[i].DifferenceInMin
						train.HasDelay = true
						break
					}
				}

				// Upcoming commercial stops (incl. destination); the first one
				// doubles as "next stop".
				for i := range rows {
					row := &rows[i]
					if row.ActualTime != "" || row.Type != "ARRIVAL" || !row.CommercialStop || !row.TrainStopping {
						continue
					}
					stop := Stop{
						Code:          row.StationShortCode,
						Name:          name(row.StationShortCode),
						ScheduledTime: row.ScheduledTime,
						EstimateTime:  row.LiveEstimateTime,
						Track:         row.CommercialTrack,
					}
					train.Stops = append(train.Stops, stop)
				}
				if len(train.Stops) > 0 {
					first := train.Stops[0]
					train.NextStop = &NextStop{
						Code:          first.Code,
						Name:          first.Name,
						ScheduledTime: first.ScheduledTime,
						EstimateTime:  first.EstimateTime,
						Track:         first.Track,
					}
				}
			}
		}

		trains = append(trains, train)
	}
	return trains
}

// Board window: show everything due within the next few hours, and keep rows
// briefly after the fact so a just-departed train doesn't vanish mid-glance.
const (
	boardLookBack  = 15 * time.Minute
	boardLookAhead = 6 * time.Hour
	boardMaxRows   = 30
)

// BuildBoard computes the departure/arrival board of one station from the
// cached live-trains snapshot. Passenger trains only — cargo has no commercial
// stops, so it never matches the CommercialStop filter anyway.
func BuildBoard(station string, live []LiveTrain, stationNames map[string]string, now time.Time) Board {
	board := Board{
		Station:    station,
		Departures: []BoardRow{},
		Arrivals:   []BoardRow{},
	}

	name := func(code string) string {
		if n, ok := stationNames[code]; ok {
			return n
		}
		return code
	}

	earliest := now.Add(-boardLookBack)
	latest := now.Add(boardLookAhead)

	for i := range live {
		t := &live[i]
		rows := t.TimeTableRows
		if len(rows) == 0 {
			continue
		}
		for j := range rows {
			row := &rows[j]
			if row.StationShortCode != station || !row.CommercialStop || !row.TrainStopping {
				continue
			}
			sched, err := time.Parse(time.RFC3339, row.ScheduledTime)
			if err != nil || sched.Before(earliest) || sched.After(latest) {
				continue
			}

			liveTime := row.ActualTime
			if liveTime == "" {
				liveTime = row.LiveEstimateTime
			}
			entry := BoardRow{
				TrainNumber:   t.TrainNumber,
				TrainType:     t.TrainType,
				Category:      t.TrainCategory,
				CommuterLine:  t.CommuterLineID,
				ScheduledTime: row.ScheduledTime,
				LiveTime:      liveTime,
				DelayMin:      row.DifferenceInMin,
				Track:         row.CommercialTrack,
				Cancelled:     t.Cancelled || row.Cancelled,
			}
			if row.Type == "DEPARTURE" {
				entry.Terminus = name(rows[len(rows)-1].StationShortCode)
				board.Departures = append(board.Departures, entry)
			} else {
				entry.Terminus = name(rows[0].StationShortCode)
				board.Arrivals = append(board.Arrivals, entry)
			}
		}
	}

	sortRows := func(rows []BoardRow) {
		sort.Slice(rows, func(a, b int) bool { return rows[a].ScheduledTime < rows[b].ScheduledTime })
	}
	sortRows(board.Departures)
	sortRows(board.Arrivals)
	if len(board.Departures) > boardMaxRows {
		board.Departures = board.Departures[:boardMaxRows]
	}
	if len(board.Arrivals) > boardMaxRows {
		board.Arrivals = board.Arrivals[:boardMaxRows]
	}
	return board
}
