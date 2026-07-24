package tie

import (
	"context"
	"encoding/json"
)

const (
	parkingFacilitiesURL   = "https://parking.fintraffic.fi/api/v1/facilities"
	parkingUtilizationsURL = "https://parking.fintraffic.fi/api/v1/utilizations"
)

// rawParkingGeometry is a GeoJSON Point or Polygon â€” Digitraffic represents a
// facility either as a single point or as the outline of the parking area.
type rawParkingGeometry struct {
	Type        string          `json:"type"`
	Coordinates json.RawMessage `json:"coordinates"`
}

type rawParkingFacility struct {
	ID   int `json:"id"`
	Name struct {
		FI string `json:"fi"`
	} `json:"name"`
	Location              rawParkingGeometry `json:"location"`
	Type                  string             `json:"type"`
	Status                string             `json:"status"`
	BuiltCapacity         map[string]int     `json:"builtCapacity"`
	PricingMethod         string             `json:"pricingMethod"`
	Usages                []string           `json:"usages"`
	Services              []string           `json:"services"`
	AuthenticationMethods []string           `json:"authenticationMethods"`
	PaymentInfo           struct {
		Detail struct {
			FI string `json:"fi"`
			EN string `json:"en"`
		} `json:"detail"`
		PaymentMethods []string `json:"paymentMethods"`
	} `json:"paymentInfo"`
	OpeningHours struct {
		ByDayType map[string]struct {
			From  string `json:"from"`
			Until string `json:"until"`
		} `json:"byDayType"`
	} `json:"openingHours"`
}

type parkingFacilitiesResponse struct {
	Results []rawParkingFacility `json:"results"`
}

// parkingCentroid reduces a facility's Point or Polygon geometry down to a
// single [lon, lat] for map placement, since the frontend only needs a
// marker position, not the full outline.
func parkingCentroid(g rawParkingGeometry) (lon, lat float64, ok bool) {
	switch g.Type {
	case "Point":
		var coords [2]float64
		if err := json.Unmarshal(g.Coordinates, &coords); err != nil {
			return 0, 0, false
		}
		return coords[0], coords[1], true
	case "Polygon":
		var rings [][][2]float64
		if err := json.Unmarshal(g.Coordinates, &rings); err != nil || len(rings) == 0 || len(rings[0]) == 0 {
			return 0, 0, false
		}
		var sumLon, sumLat float64
		for _, p := range rings[0] {
			sumLon += p[0]
			sumLat += p[1]
		}
		n := float64(len(rings[0]))
		return sumLon / n, sumLat / n, true
	default:
		return 0, 0, false
	}
}

// FetchParkingFacilities fetches static facility metadata (location, name,
// type, built capacity), keyed by facility id for merging with live
// utilization data.
func FetchParkingFacilities(ctx context.Context) (map[int]ParkingFacility, error) {
	var res parkingFacilitiesResponse
	if err := fetchJSON(ctx, parkingFacilitiesURL, &res); err != nil {
		return nil, err
	}

	facilities := make(map[int]ParkingFacility, len(res.Results))
	for _, f := range res.Results {
		lon, lat, ok := parkingCentroid(f.Location)
		if !ok {
			continue
		}

		paymentInfo := f.PaymentInfo.Detail.FI
		if paymentInfo == "" {
			paymentInfo = f.PaymentInfo.Detail.EN
		}

		var openingHours map[string]string
		if len(f.OpeningHours.ByDayType) > 0 {
			openingHours = make(map[string]string, len(f.OpeningHours.ByDayType))
			for day, h := range f.OpeningHours.ByDayType {
				openingHours[day] = h.From + "â€“" + h.Until
			}
		}

		facilities[f.ID] = ParkingFacility{
			ID:                    f.ID,
			Name:                  f.Name.FI,
			Longitude:             lon,
			Latitude:              lat,
			Type:                  f.Type,
			Status:                f.Status,
			Capacity:              f.BuiltCapacity[f.Type],
			BuiltCapacity:         f.BuiltCapacity,
			PricingMethod:         f.PricingMethod,
			Usages:                f.Usages,
			Services:              f.Services,
			AuthenticationMethods: f.AuthenticationMethods,
			PaymentMethods:        f.PaymentInfo.PaymentMethods,
			PaymentInfo:           paymentInfo,
			OpeningHours:          openingHours,
		}
	}
	return facilities, nil
}

type rawParkingUtilization struct {
	FacilityID      int    `json:"facilityId"`
	SpacesAvailable int    `json:"spacesAvailable"`
	OpenNow         bool   `json:"openNow"`
	Timestamp       string `json:"timestamp"`
}

// FetchParkingUtilizations fetches the live free-space count for every
// facility in one call, keyed by facility id.
func FetchParkingUtilizations(ctx context.Context) (map[int]rawParkingUtilization, error) {
	var res []rawParkingUtilization
	if err := fetchJSON(ctx, parkingUtilizationsURL, &res); err != nil {
		return nil, err
	}

	utilizations := make(map[int]rawParkingUtilization, len(res))
	for _, u := range res {
		utilizations[u.FacilityID] = u
	}
	return utilizations, nil
}
