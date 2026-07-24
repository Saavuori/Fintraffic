package tie

import "encoding/json"

// Metadata Models
type FeatureCollection struct {
	Type     string    `json:"type"`
	Features []Feature `json:"features"`
}

type Feature struct {
	Type       string     `json:"type"`
	ID         int        `json:"id"`
	Geometry   Geometry   `json:"geometry"`
	Properties Properties `json:"properties"`
}

type Geometry struct {
	Type        string    `json:"type"`
	Coordinates []float64 `json:"coordinates"`
}

type Properties struct {
	ID    int    `json:"id"`
	Name  string `json:"name"`
	State string `json:"state"`
}

// Data Models
// Digitraffic real-time data response
type TmsDataResponse struct {
	DataUpdatedTime string           `json:"dataUpdatedTime"`
	Stations        []TmsStationData `json:"stations"`
}

type TmsStationData struct {
	ID           int           `json:"id"`
	MeasuredTime string        `json:"measuredTime"`
	SensorValues []SensorValue `json:"sensorValues"`
}

type SensorValue struct {
	ID                       int     `json:"id"`
	Value                    float64 `json:"value"`
	ShortName                string  `json:"shortName"`
	SensorValueDescriptionFI string  `json:"sensorValueDescriptionFI,omitempty"`
	// Unit is filled in from Digitraffic's sensor metadata (e.g. "km/h",
	// "kpl/h"); Digitraffic's own live data endpoint doesn't include it.
	Unit string `json:"unit,omitempty"`
}

// SensorMeta is the static (rarely changing) description/unit for a sensor
// id, fetched separately from /api/tms/v1/sensors since the live data
// endpoint only returns bare id/value pairs.
type SensorMeta struct {
	DescriptionFI string
	Unit          string
}

type SensorMetaResponse struct {
	Sensors []struct {
		ID          int    `json:"id"`
		Description string `json:"description"`
		Unit        string `json:"unit"`
	} `json:"sensors"`
}

// Frontend DTO
type StationWithData struct {
	ID        int           `json:"id"`
	Name      string        `json:"name"`
	Longitude float64       `json:"longitude"`
	Latitude  float64       `json:"latitude"`
	Data      []SensorValue `json:"data"`
	// Bearing is the road's compass direction in degrees at this station (Tien_suunta).
	Bearing *float64 `json:"bearing,omitempty"`
	// FreeFlow1/2 are the seasonal reference ("free flow") speeds in km/h per
	// direction (VVAPAAS1/2) â€” used as the speed-limit baseline for relative
	// speed coloring, since Digitraffic doesn't expose static speed limits directly.
	FreeFlow1 *float64 `json:"freeFlow1,omitempty"`
	FreeFlow2 *float64 `json:"freeFlow2,omitempty"`
}

// Sensor constants (road bearing, seasonal free-flow speed) per station.
type SensorConstantValue struct {
	Name      string  `json:"name"`
	Value     float64 `json:"value"`
	ValidFrom string  `json:"validFrom"`
	ValidTo   string  `json:"validTo"`
}

type StationConstants struct {
	ID                   int                   `json:"id"`
	SensorConstantValues []SensorConstantValue `json:"sensorConstantValues"`
}

type StationConstantsResponse struct {
	Stations []StationConstants `json:"stations"`
}

// POI Models (road works, traffic incidents) â€” simplified from Digitraffic's
// deeply nested Datex2-derived JSON down to what the map actually renders.
type POIProperties struct {
	ID            string `json:"id"`
	Title         string `json:"title"`
	Description   string `json:"description"`
	SituationType string `json:"situationType"`
	ReleaseTime   string `json:"releaseTime,omitempty"`
	// VersionTime is when Digitraffic last updated this situation record â€”
	// releaseTime is only the first publication, so this is the "last updated"
	// timestamp shown in POI popups.
	VersionTime string `json:"versionTime,omitempty"`
	// SpeedLimit is the lowest posted work-zone speed limit (km/h) across the
	// announcement's road-work phases ("speed limit" restrictions); nil when the
	// message declares none (incidents never do).
	SpeedLimit *float64 `json:"speedLimit,omitempty"`
}

type POIFeature struct {
	Type       string          `json:"type"`
	Geometry   json.RawMessage `json:"geometry"`
	Properties POIProperties   `json:"properties"`
}

type POICollection struct {
	Type     string       `json:"type"`
	Features []POIFeature `json:"features"`
}

// Variable-sign Models
// VariableSpeedSign is one variable speed-limit sign (Digitraffic
// /api/variable-sign/v1/signs, type SPEEDLIMIT) with the limit it is currently
// displaying. Signs showing nothing (blank displayValue) are dropped upstream.
type VariableSpeedSign struct {
	ID        string  `json:"id"`
	Longitude float64 `json:"longitude"`
	Latitude  float64 `json:"latitude"`
	// SpeedLimit is the currently displayed limit in km/h (parsed displayValue).
	SpeedLimit int `json:"speedLimit"`
	// Direction is INCREASING/DECREASING along the road's address numbering.
	Direction   string `json:"direction,omitempty"`
	Carriageway string `json:"carriageway,omitempty"`
	// Reliability is Digitraffic's confidence in the reading (e.g. NORMAL).
	Reliability string `json:"reliability,omitempty"`
	// EffectDate is when the currently shown value took effect.
	EffectDate string `json:"effectDate,omitempty"`
}

// Parking Models
// ParkingFacility is the flattened facility+utilization DTO served to the
// frontend, combining Digitraffic Parking API facility metadata (name,
// location, capacity) with its latest live utilization the same way
// StationWithData combines TMS metadata and sensor data.
type ParkingFacility struct {
	ID        int     `json:"id"`
	Name      string  `json:"name"`
	Longitude float64 `json:"longitude"`
	Latitude  float64 `json:"latitude"`
	// Type is the capacity type this facility row represents (CAR, BICYCLE,
	// DISABLED, ELECTRIC_CAR, MOTORCYCLE) â€” Digitraffic models one facility
	// per type rather than one facility with mixed capacities.
	Type     string `json:"type"`
	Status   string `json:"status"`
	Capacity int    `json:"capacity"`
	// BuiltCapacity is the full per-capacity-type breakdown (e.g.
	// {"CAR":195,"DISABLED":4}); Capacity above is just BuiltCapacity[Type].
	BuiltCapacity map[string]int `json:"builtCapacity,omitempty"`
	// PricingMethod describes how the facility is priced, e.g. "FREE" or
	// "PAID_16H_24H_48H".
	PricingMethod string `json:"pricingMethod,omitempty"`
	// Usages/Services/AuthenticationMethods/PaymentMethods are Digitraffic
	// enum lists (e.g. usages ["PARK_AND_RIDE"], services ["LIGHTING"]).
	Usages                []string `json:"usages,omitempty"`
	Services              []string `json:"services,omitempty"`
	AuthenticationMethods []string `json:"authenticationMethods,omitempty"`
	PaymentMethods        []string `json:"paymentMethods,omitempty"`
	// PaymentInfo is the free-text pricing description (Finnish, falling back
	// to English) from the facility's paymentInfo.detail.
	PaymentInfo string `json:"paymentInfo,omitempty"`
	// OpeningHours maps day type (BUSINESS_DAY/SATURDAY/SUNDAY) to an
	// "HHâ€“HH" range string built from openingHours.byDayType.
	OpeningHours map[string]string `json:"openingHours,omitempty"`
	// SpacesAvailable/OpenNow/UpdatedAt come from /api/v1/utilizations;
	// SpacesAvailable/OpenNow are nil and UpdatedAt is "" if no live
	// utilization row exists yet for this facility.
	SpacesAvailable *int   `json:"spacesAvailable,omitempty"`
	OpenNow         *bool  `json:"openNow,omitempty"`
	UpdatedAt       string `json:"updatedAt,omitempty"`
}

// AFIR EV-charging Models
// ChargingConnector is a deduplicated connector type at a charging station
// (e.g. "IEC_62196_T2" AC, 22 kW), with the per-kWh energy price resolved from
// the connector's referenced tariff when one is available.
type ChargingConnector struct {
	// Standard is the plug standard (e.g. "IEC_62196_T2", "IEC_62196_T1_COMBO").
	Standard string `json:"standard"`
	// PowerType is Digitraffic's current type (e.g. "AC_3_PHASE", "DC").
	PowerType string `json:"powerType"`
	// MaxPowerKW is the highest max electric power (kW) seen for this
	// standard/powerType combination at the station.
	MaxPowerKW float64 `json:"maxPowerKw"`
	// Count is how many physical connectors of this kind the station has.
	Count int `json:"count"`
	// PricePerKWh is the ENERGY price from the connector's tariff, nil when no
	// tariff is referenced or resolvable.
	PricePerKWh *float64 `json:"pricePerKwh,omitempty"`
	Currency    string   `json:"currency,omitempty"`
}

// ChargingStation is the flattened AFIR charging-location DTO served to the
// frontend: static location/operator metadata merged with live EVSE
// availability the same way ParkingFacility merges facility + utilization data.
type ChargingStation struct {
	ID        string  `json:"id"`
	Name      string  `json:"name"`
	Longitude float64 `json:"longitude"`
	Latitude  float64 `json:"latitude"`
	// Operator is the charge-point operator's display name (from the location's
	// embedded operator.details, no separate operators call needed).
	Operator string `json:"operator,omitempty"`
	Address  string `json:"address,omitempty"`
	City     string `json:"city,omitempty"`
	Website  string `json:"website,omitempty"`
	// Connectors is the deduplicated plug summary across all of the station's EVSEs.
	Connectors []ChargingConnector `json:"connectors"`
	// MaxPowerKW is the fastest connector at the station, used for sizing/labeling.
	MaxPowerKW float64 `json:"maxPowerKw"`
	// Total is the number of EVSEs (individual charging points) at the station.
	Total int `json:"total"`
	// Available is how many EVSEs currently report status AVAILABLE; nil when no
	// live status exists for any of the station's EVSEs.
	Available *int `json:"available,omitempty"`
	// EvseIDs is used only server-side to merge live statuses; never serialized.
	EvseIDs []string `json:"-"`
}

// Weathercam Models
// WeathercamPreset is one camera view at a station; Digitraffic's stations
// endpoint only lists preset ids, not images, so ImageURL is built from the
// well-known https://weathercam.digitraffic.fi/{presetId}.jpg convention.
type WeathercamPreset struct {
	ID       string `json:"id"`
	ImageURL string `json:"imageUrl"`
}

type WeathercamStation struct {
	ID        string             `json:"id"`
	Name      string             `json:"name"`
	Longitude float64            `json:"longitude"`
	Latitude  float64            `json:"latitude"`
	Presets   []WeathercamPreset `json:"presets"`
	// Weather is a compact current-weather summary from the road weather station
	// nearest this camera; nil if no weather station data was available. Cameras
	// don't carry their own weather sensors, so the backend matches each camera
	// to the closest /api/weather station by distance.
	Weather *WeatherObservation `json:"weather,omitempty"`
}

// Weather Models
// WeatherReading is one curated road-weather sensor value shown on a camera
// screen. Digitraffic road weather stations expose ~100 sensors; only a handful
// (air/road temperature, wind, precipitation, road condition, etc.) are useful
// alongside a camera image, so the backend selects them by stable numeric id.
type WeatherReading struct {
	Label string  `json:"label"`
	Value float64 `json:"value"`
	Unit  string  `json:"unit,omitempty"`
	// Description is Digitraffic's coded textual description for enumerated
	// sensors (e.g. road condition "MÃ¤rkÃ¤"/wet); empty for plain numeric sensors.
	Description string `json:"description,omitempty"`
}

// WeatherObservation is the current-weather summary from the road weather
// station nearest a weather camera, attached to WeathercamStation.
type WeatherObservation struct {
	StationID    int              `json:"stationId"`
	StationName  string           `json:"stationName"`
	DistanceKm   float64          `json:"distanceKm"`
	MeasuredTime string           `json:"measuredTime,omitempty"`
	Readings     []WeatherReading `json:"readings"`
}
