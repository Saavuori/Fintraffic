package tie

import (
	"context"
	"strconv"
)

const variableSignsURL = "https://tie.digitraffic.fi/api/variable-sign/v1/signs"

// rawSignFeature mirrors the subset of the variable-sign GeoJSON we need.
// The feed also carries WARNING and INFORMATION signs (free-text displays);
// only SPEEDLIMIT signs are relevant here.
type rawSignFeature struct {
	Geometry struct {
		Type        string    `json:"type"`
		Coordinates []float64 `json:"coordinates"`
	} `json:"geometry"`
	Properties struct {
		ID           string `json:"id"`
		Type         string `json:"type"`
		DisplayValue string `json:"displayValue"`
		Direction    string `json:"direction"`
		Carriageway  string `json:"carriageway"`
		Reliability  string `json:"reliability"`
		EffectDate   string `json:"effectDate"`
	} `json:"properties"`
}

type rawSignCollection struct {
	Features []rawSignFeature `json:"features"`
}

// FetchVariableSpeedSigns fetches all variable message signs and keeps the
// SPEEDLIMIT ones that are currently displaying a numeric limit â€” a blank
// displayValue means the sign is switched off, so it carries no limit to show.
func FetchVariableSpeedSigns(ctx context.Context) ([]VariableSpeedSign, error) {
	var raw rawSignCollection
	if err := fetchJSON(ctx, variableSignsURL, &raw); err != nil {
		return nil, err
	}

	signs := make([]VariableSpeedSign, 0, len(raw.Features))
	for _, f := range raw.Features {
		p := f.Properties
		if p.Type != "SPEEDLIMIT" || len(f.Geometry.Coordinates) < 2 {
			continue
		}
		limit, err := strconv.Atoi(p.DisplayValue)
		if err != nil || limit <= 0 {
			continue
		}
		signs = append(signs, VariableSpeedSign{
			ID:          p.ID,
			Longitude:   f.Geometry.Coordinates[0],
			Latitude:    f.Geometry.Coordinates[1],
			SpeedLimit:  limit,
			Direction:   p.Direction,
			Carriageway: p.Carriageway,
			Reliability: p.Reliability,
			EffectDate:  p.EffectDate,
		})
	}
	return signs, nil
}
