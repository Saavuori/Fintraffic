package tie

import (
	"context"
	"fmt"
	"math"
)

const (
	afirLocationsURL = "https://afir.digitraffic.fi/api/charging-network/v1/locations"
	afirStatusesURL  = "https://afir.digitraffic.fi/api/charging-network/v1/locations/statuses"
	afirTariffsURL   = "https://afir.digitraffic.fi/api/charging-network/v1/tariffs"
	// afirMaxPages caps cursor pagination so a misbehaving cursor can't loop
	// forever; ~3000 locations at 500/page needs ~7 pages, so this is generous.
	afirMaxPages = 50
)

// afirPagination is the cursor block every AFIR list endpoint shares.
type afirPagination struct {
	NextCursor string `json:"nextCursor"`
	Limit      int    `json:"limit"`
}

// rawChargingLocations is one page of the /locations GeoJSON feed.
type rawChargingLocations struct {
	Pagination afirPagination `json:"pagination"`
	Features   []struct {
		Geometry   Geometry `json:"geometry"`
		Properties struct {
			ID       string `json:"id"`
			Name     string `json:"name"`
			Operator struct {
				Details struct {
					Name    string `json:"name"`
					Website string `json:"website"`
				} `json:"details"`
			} `json:"operator"`
			Address struct {
				Street string `json:"street"`
				City   string `json:"city"`
			} `json:"address"`
			Evses []struct {
				ID         string `json:"id"`
				Connectors []struct {
					Standard         string   `json:"standard"`
					PowerType        string   `json:"powerType"`
					MaxElectricPower float64  `json:"maxElectricPower"` // watts
					TariffIDs        []string `json:"tariffIds"`
				} `json:"connectors"`
			} `json:"evses"`
		} `json:"properties"`
	} `json:"features"`
}

// rawChargingStatuses is one page of the /locations/statuses feed.
type rawChargingStatuses struct {
	Pagination afirPagination `json:"pagination"`
	Statuses   []struct {
		EvseID string `json:"evseId"`
		Status string `json:"status"`
	} `json:"statuses"`
}

// rawTariffs is one page of the /tariffs feed. AFIR's live shape nests the
// per-kWh price under elements[].priceComponents[] with type "ENERGY".
type rawTariffs struct {
	Pagination afirPagination `json:"pagination"`
	Tariffs    []struct {
		ID       string `json:"id"`
		Currency string `json:"currency"`
		Elements []struct {
			PriceComponents []struct {
				Type  string  `json:"type"`
				Price float64 `json:"price"`
			} `json:"priceComponents"`
		} `json:"elements"`
	} `json:"tariffs"`
}

// tariffPrice is the resolved energy price for a tariff id.
type tariffPrice struct {
	perKWh   float64
	currency string
}

// fetchAFIRPages walks an AFIR cursor-paginated endpoint, calling decode for
// each page's decoded body; decode returns the page's nextCursor.
func fetchAFIRPages(ctx context.Context, baseURL string, decode func(cursor string) (string, error)) error {
	cursor := ""
	for page := 0; page < afirMaxPages; page++ {
		url := baseURL
		if cursor != "" {
			url = fmt.Sprintf("%s?cursor=%s", baseURL, cursor)
		}
		next, err := decode(url)
		if err != nil {
			return err
		}
		if next == "" {
			return nil
		}
		cursor = next
	}
	return nil
}

// fetchChargingTariffs builds a tariffId -> energy price lookup so each
// connector can be labeled with its â‚¬/kWh price.
func fetchChargingTariffs(ctx context.Context) (map[string]tariffPrice, error) {
	prices := make(map[string]tariffPrice)
	err := fetchAFIRPages(ctx, afirTariffsURL, func(url string) (string, error) {
		var page rawTariffs
		if err := fetchJSON(ctx, url, &page); err != nil {
			return "", err
		}
		for _, t := range page.Tariffs {
			for _, el := range t.Elements {
				for _, pc := range el.PriceComponents {
					if pc.Type == "ENERGY" {
						prices[t.ID] = tariffPrice{perKWh: pc.Price, currency: t.Currency}
					}
				}
			}
		}
		return page.Pagination.NextCursor, nil
	})
	return prices, err
}

// FetchChargingStatuses returns a map of EVSE id -> current status
// (AVAILABLE, CHARGING, OUTOFORDER, ...), paginating over every status page.
func FetchChargingStatuses(ctx context.Context) (map[string]string, error) {
	statuses := make(map[string]string)
	err := fetchAFIRPages(ctx, afirStatusesURL, func(url string) (string, error) {
		var page rawChargingStatuses
		if err := fetchJSON(ctx, url, &page); err != nil {
			return "", err
		}
		for _, s := range page.Statuses {
			statuses[s.EvseID] = s.Status
		}
		return page.Pagination.NextCursor, nil
	})
	return statuses, err
}

// FetchChargingLocations fetches every AFIR charging location (paginated) and
// flattens each into a ChargingStation, deduplicating connectors and
// attaching each connector's energy price from the tariff lookup. Live EVSE
// availability is merged separately (see the poll loop in cmd/server).
func FetchChargingLocations(ctx context.Context) ([]ChargingStation, error) {
	tariffs, err := fetchChargingTariffs(ctx)
	if err != nil {
		// Prices are a nice-to-have; keep locations even if tariffs fail.
		tariffs = map[string]tariffPrice{}
	}

	var stations []ChargingStation
	err = fetchAFIRPages(ctx, afirLocationsURL, func(url string) (string, error) {
		var page rawChargingLocations
		if err := fetchJSON(ctx, url, &page); err != nil {
			return "", err
		}
		for _, f := range page.Features {
			if len(f.Geometry.Coordinates) < 2 {
				continue
			}
			p := f.Properties

			// Deduplicate connectors by standard+powerType, keeping the highest
			// power and counting physical plugs, and resolve a per-kWh price.
			type key struct{ standard, powerType string }
			order := []key{}
			byKey := map[key]*ChargingConnector{}
			evseIDs := make([]string, 0, len(p.Evses))
			var maxPowerKW float64
			for _, e := range p.Evses {
				evseIDs = append(evseIDs, e.ID)
				for _, c := range e.Connectors {
					kw := c.MaxElectricPower / 1000
					if kw > maxPowerKW {
						maxPowerKW = kw
					}
					k := key{c.Standard, c.PowerType}
					conn, ok := byKey[k]
					if !ok {
						conn = &ChargingConnector{Standard: c.Standard, PowerType: c.PowerType}
						byKey[k] = conn
						order = append(order, k)
					}
					conn.Count++
					if kw > conn.MaxPowerKW {
						conn.MaxPowerKW = kw
					}
					if conn.PricePerKWh == nil {
						for _, tid := range c.TariffIDs {
							if tp, ok := tariffs[tid]; ok {
								price := tp.perKWh
								conn.PricePerKWh = &price
								conn.Currency = tp.currency
								break
							}
						}
					}
				}
			}

			connectors := make([]ChargingConnector, 0, len(order))
			for _, k := range order {
				connectors = append(connectors, *byKey[k])
			}

			stations = append(stations, ChargingStation{
				ID:         p.ID,
				Name:       p.Name,
				Longitude:  f.Geometry.Coordinates[0],
				Latitude:   f.Geometry.Coordinates[1],
				Operator:   p.Operator.Details.Name,
				Address:    p.Address.Street,
				City:       p.Address.City,
				Website:    p.Operator.Details.Website,
				Connectors: connectors,
				MaxPowerKW: math.Round(maxPowerKW*10) / 10,
				Total:      len(p.Evses),
				EvseIDs:    evseIDs,
			})
		}
		return page.Pagination.NextCursor, nil
	})
	if err != nil {
		return nil, err
	}
	return stations, nil
}
