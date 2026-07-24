package tie

import (
	"context"
)

const (
	weathercamStationsURL  = "https://tie.digitraffic.fi/api/weathercam/v1/stations"
	weathercamImageBaseURL = "https://weathercam.digitraffic.fi/"
)

type rawWeathercamPreset struct {
	ID           string `json:"id"`
	InCollection bool   `json:"inCollection"`
}

type rawWeathercamProperties struct {
	ID               string                `json:"id"`
	Name             string                `json:"name"`
	CollectionStatus string                `json:"collectionStatus"`
	Presets          []rawWeathercamPreset `json:"presets"`
}

type rawWeathercamFeature struct {
	Geometry   Geometry                `json:"geometry"`
	Properties rawWeathercamProperties `json:"properties"`
}

type rawWeathercamCollection struct {
	Features []rawWeathercamFeature `json:"features"`
}

// FetchWeathercamStations fetches all Digitraffic weather camera stations and
// flattens each active preset into a directly-fetchable image URL â€” the
// stations endpoint only ever lists preset ids, never the images themselves.
func FetchWeathercamStations(ctx context.Context) ([]WeathercamStation, error) {
	var raw rawWeathercamCollection
	if err := fetchJSON(ctx, weathercamStationsURL, &raw); err != nil {
		return nil, err
	}

	stations := make([]WeathercamStation, 0, len(raw.Features))
	for _, f := range raw.Features {
		// REMOVED_TEMPORARILY stations have stale/no images; skip them.
		if f.Properties.CollectionStatus != "GATHERING" || len(f.Geometry.Coordinates) < 2 {
			continue
		}

		presets := make([]WeathercamPreset, 0, len(f.Properties.Presets))
		for _, p := range f.Properties.Presets {
			if !p.InCollection {
				continue
			}
			presets = append(presets, WeathercamPreset{
				ID:       p.ID,
				ImageURL: weathercamImageBaseURL + p.ID + ".jpg",
			})
		}
		if len(presets) == 0 {
			continue
		}

		stations = append(stations, WeathercamStation{
			ID:        f.Properties.ID,
			Name:      f.Properties.Name,
			Longitude: f.Geometry.Coordinates[0],
			Latitude:  f.Geometry.Coordinates[1],
			Presets:   presets,
		})
	}
	return stations, nil
}
