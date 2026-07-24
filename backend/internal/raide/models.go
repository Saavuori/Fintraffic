package raide

// App-facing response types, ported from the standalone railway app. The
// frontend mirrors these in src/modes/raide/lib/trains.ts — change one, change
// both.

// Train is one currently-moving train: its live GPS position merged with the
// timetable metadata (category, route, delay) for the same train number and
// departure date. This is what /api/raide/trains serves.
type Train struct {
	TrainNumber   int     `json:"trainNumber"`
	DepartureDate string  `json:"departureDate"`
	TrainType     string  `json:"trainType"`    // IC, S, HL, T, ...
	Category      string  `json:"category"`     // Long-distance, Commuter, Cargo, ...
	CommuterLine  string  `json:"commuterLine"` // A, I, K, ... empty for non-commuter
	Operator      string  `json:"operator"`     // vr, vre, ...
	Cancelled     bool    `json:"cancelled"`
	Latitude      float64 `json:"latitude"`
	Longitude     float64 `json:"longitude"`
	Speed         int     `json:"speed"` // km/h
	Timestamp     string  `json:"timestamp"`
	// DelayMin is the differenceInMinutes of the most recent timetable row that
	// has an actualTime — i.e. the delay at the last station passed. 0 when on
	// time, negative when ahead of schedule.
	DelayMin   int       `json:"delayMin"`
	HasDelay   bool      `json:"hasDelay"` // false until the train has passed its first station
	Origin     string    `json:"origin"`
	Dest       string    `json:"dest"`
	DepartTime string    `json:"departTime"` // scheduled departure from origin
	ArriveTime string    `json:"arriveTime"` // scheduled arrival at destination
	NextStop   *NextStop `json:"nextStop,omitempty"`
	Stops      []Stop    `json:"stops,omitempty"` // upcoming commercial stops incl. destination
}

// NextStop is the next station the train will stop at (commercial stops only).
type NextStop struct {
	Code          string `json:"code"`
	Name          string `json:"name"`
	ScheduledTime string `json:"scheduledTime"`
	EstimateTime  string `json:"estimateTime,omitempty"`
	Track         string `json:"track,omitempty"`
}

// Stop is one upcoming commercial stop on a train's route.
type Stop struct {
	Code          string `json:"code"`
	Name          string `json:"name"`
	ScheduledTime string `json:"scheduledTime"`
	EstimateTime  string `json:"estimateTime,omitempty"`
	Track         string `json:"track,omitempty"`
}

// Station is one entry of the (rarely changing) station register.
type Station struct {
	Code      string  `json:"code"`
	Name      string  `json:"name"`
	Latitude  float64 `json:"latitude"`
	Longitude float64 `json:"longitude"`
	Passenger bool    `json:"passenger"`
	// Major is true for a full station (Digitraffic type "STATION"), false for
	// a stopping point/turnout — lets the map draw a bigger marker for stations
	// that actually have a building and services.
	Major bool `json:"major"`
}

// BoardRow is one line of a station departure/arrival board.
type BoardRow struct {
	TrainNumber  int    `json:"trainNumber"`
	TrainType    string `json:"trainType"`
	Category     string `json:"category"`
	CommuterLine string `json:"commuterLine"`
	// Where the train is ultimately headed (departures) or coming from (arrivals).
	Terminus      string `json:"terminus"`
	ScheduledTime string `json:"scheduledTime"`
	// Best known time: actualTime if recorded, else liveEstimateTime, else empty.
	LiveTime  string `json:"liveTime,omitempty"`
	DelayMin  int    `json:"delayMin"`
	Track     string `json:"track,omitempty"`
	Cancelled bool   `json:"cancelled"`
}

// Board is the response of /api/raide/departures/{station}.
type Board struct {
	Station    string     `json:"station"`
	Departures []BoardRow `json:"departures"`
	Arrivals   []BoardRow `json:"arrivals"`
}

// Raw shapes of the rata.digitraffic.fi responses. The cache stores the
// live-trains snapshot in this form for the departure-board handler; only the
// fields the app needs are decoded.

// TrainLocation is one element of /train-locations/latest.
type TrainLocation struct {
	TrainNumber   int    `json:"trainNumber"`
	DepartureDate string `json:"departureDate"`
	Timestamp     string `json:"timestamp"`
	Speed         int    `json:"speed"`
	Location      struct {
		Type        string     `json:"type"`
		Coordinates [2]float64 `json:"coordinates"` // [lon, lat]
	} `json:"location"`
}

// TimeTableRow is one arrival/departure row of a live train.
type TimeTableRow struct {
	Type             string `json:"type"` // ARRIVAL | DEPARTURE
	StationShortCode string `json:"stationShortCode"`
	CommercialStop   bool   `json:"commercialStop"`
	TrainStopping    bool   `json:"trainStopping"`
	Cancelled        bool   `json:"cancelled"`
	CommercialTrack  string `json:"commercialTrack"`
	ScheduledTime    string `json:"scheduledTime"`
	LiveEstimateTime string `json:"liveEstimateTime"`
	ActualTime       string `json:"actualTime"`
	DifferenceInMin  int    `json:"differenceInMinutes"`
}

// LiveTrain is one element of /live-trains: the full timetable of a train that
// is running now or recently.
type LiveTrain struct {
	TrainNumber       int            `json:"trainNumber"`
	DepartureDate     string         `json:"departureDate"`
	TrainType         string         `json:"trainType"`
	TrainCategory     string         `json:"trainCategory"`
	CommuterLineID    string         `json:"commuterLineID"`
	OperatorShortCode string         `json:"operatorShortCode"`
	RunningCurrently  bool           `json:"runningCurrently"`
	Cancelled         bool           `json:"cancelled"`
	TimeTableRows     []TimeTableRow `json:"timeTableRows"`
}
