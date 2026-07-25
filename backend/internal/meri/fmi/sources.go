package fmi

import "time"

// ---------------------------------------------------------------------------
// FMI stored queries, parameters and stations.
//
// Parameter names and units below were read from FMI's own metadata service
// (https://opendata.fmi.fi/meta?observableProperty=observation&param=...),
// which is the authority for both — several of these are not guessable
// (the mareographs report water level in *millimetres*, and the wave buoys
// call significant wave height "WaveHs" while the forecast model calls the
// same quantity "SigWaveHeight").
// ---------------------------------------------------------------------------

// SeaAreaBBox bounds the Finnish sea areas: the Gulf of Finland, the
// Archipelago Sea and Åland, the Bothnian Sea and the Bothnian Bay. FMI takes
// bbox in lon,lat order — the opposite of the lat-first gml:pos it returns.
const SeaAreaBBox = "18.0,58.8,30.5,66.0"

// Source is one stored query the poller runs. Each contributes a subset of a
// Station's fields; a source that fails or returns nothing leaves the others
// intact.
type Source struct {
	// Key names the source in the API response and the health payload.
	Key string
	// StoredQuery is the FMI storedquery_id.
	StoredQuery string
	// Params are the observation parameters requested, in FMI's naming.
	Params []string
	// Window is how far back to ask for. A few slots of slack means a station
	// that missed its last report still shows its previous reading rather than
	// disappearing off the map.
	Window time.Duration
	// Timestep thins the response server-side, in minutes. Zero leaves FMI's
	// native reporting interval alone.
	Timestep int
	// FMISIDs restricts the query to specific stations. Empty means "use
	// SeaAreaBBox" — fine for the wave and mareograph networks, which are
	// entirely marine, but not for the land weather network: the same box
	// holds ~150 stations, most of them well inland, and asking for all of
	// them costs ~10 MB a poll.
	FMISIDs []string
}

// Sources are the three FMI queries behind the sea conditions layer.
var Sources = []Source{
	{
		Key:         "wave",
		StoredQuery: "fmi::observations::wave::simple",
		// WaveHs: significant wave height (m). WTP: modal period (s).
		// ModalWDi: direction of waves (deg). TWATER: water temperature (°C).
		Params: []string{"WaveHs", "WTP", "ModalWDi", "TWATER"},
		Window: 3 * time.Hour,
	},
	{
		Key:         "waterLevel",
		StoredQuery: "fmi::observations::mareograph::simple",
		// WATLEV: water level against theoretical mean sea level (mm).
		// TW_PT1H_AVG: water temperature, hourly mean (°C).
		Params: []string{"WATLEV", "TW_PT1H_AVG"},
		Window: 3 * time.Hour,
	},
	{
		Key:         "wind",
		StoredQuery: "fmi::observations::weather::simple",
		Params:      []string{"ws_10min", "wg_10min", "wd_10min", "t2m"},
		// The coastal stations report every 10 minutes. A 40 minute window
		// thinned to 20 minute steps is enough to always catch a recent
		// reading, and keeps the response around 170 KB instead of 1.6 MB.
		Window:   40 * time.Minute,
		Timestep: 20,
		FMISIDs:  coastalWeatherFMISIDs,
	},
}

// Parameter name -> our field. Several aliases map onto the same field because
// FMI's naming differs between the wave buoys, the mareographs and the land
// weather network. Matching is case-insensitive.
var paramFields = map[string]string{
	"WaveHs":               "waveHeight",
	"WTP":                  "wavePeriod",
	"ModalWDi":             "waveDir",
	"TWATER":               "waterTemp",
	"TW_PT1H_AVG":          "waterTemp",
	"WATLEV":      "waterLevel",
	"ws_10min":    "windSpeed",
	"wg_10min":    "windGust",
	"wd_10min":    "windDir",
	"t2m":         "airTemp",
}

// KnownStation is a Finnish marine observation site. The "simple" WFS encoding
// carries coordinates but no station name, so readings are matched back to
// this table by position.
//
// The table is hand-maintained, in the same spirit as the webcam list on the
// frontend — these stations change on a timescale of years. It was generated
// from FMI's own station registry (storedquery_id=fmi::ef::stations), which is
// where to look when adding one. A wave buoy or mareograph that isn't listed
// here still renders, labelled by position; only the wind query depends on the
// table being complete, since it asks for stations by id.
type KnownStation struct {
	FMISID string
	Name   string
	Lat    float64
	Lon    float64
}

// KnownStations covers all three networks, ordered south to north within each.
var KnownStations = []KnownStation{
	// Wave buoys ("Pintalämpötila- ja aaltopoijut"). Lifted out of the water
	// for the winter, so these go quiet for several months a year.
	{FMISID: "134220", Name: "Pohjois-Itämeri aaltopoiju", Lat: 59.248167, Lon: 20.998333},
	{FMISID: "108126", Name: "Utö Svartbådarna", Lat: 59.715833, Lon: 21.368333},
	{FMISID: "654900", Name: "Hanko Längden", Lat: 59.7572, Lon: 23.22},
	{FMISID: "134221", Name: "Suomenlahti aaltopoiju", Lat: 59.965, Lon: 25.235},
	{FMISID: "103976", Name: "Helsinki Suomenlinna aaltopoiju", Lat: 60.123333, Lon: 24.972833},
	{FMISID: "108495", Name: "Loviisa Orrengrund aaltopoiju", Lat: 60.2333, Lon: 26.3916},
	{FMISID: "106631", Name: "Uusikaupunki Vekara", Lat: 60.8678, Lon: 21.0476},
	{FMISID: "104600", Name: "Pori Kaijakari", Lat: 61.6216, Lon: 21.3874},
	{FMISID: "134246", Name: "Selkämeri aaltopoiju", Lat: 61.8001, Lon: 20.23267},
	{FMISID: "107033", Name: "Maalahti Storskäret", Lat: 63.1058, Lon: 20.8196},
	{FMISID: "103808", Name: "Kalajoki Maakalla", Lat: 64.2948, Lon: 23.5506},
	{FMISID: "137228", Name: "Perämeri aaltopoiju", Lat: 64.6841, Lon: 23.238},
	{FMISID: "103807", Name: "Oulu Santapankki", Lat: 65.180833, Lon: 25.0325},
	{FMISID: "108499", Name: "Kemi aaltopoiju", Lat: 65.48875, Lon: 24.346467},

	// Mareographs ("Mareografiasema").
	{FMISID: "134253", Name: "Hanko Pikku Kolalahti", Lat: 59.822867, Lon: 22.976583},
	{FMISID: "134252", Name: "Föglö Degerby", Lat: 60.031883, Lon: 20.384817},
	{FMISID: "132310", Name: "Helsinki Kaivopuisto", Lat: 60.15363, Lon: 24.95622},
	{FMISID: "100669", Name: "Porvoo Emäsalo Vaarlahti", Lat: 60.20579, Lon: 25.62509},
	{FMISID: "100845", Name: "Turku Ruissalo Saarontie", Lat: 60.42532, Lon: 22.09611},
	{FMISID: "134225", Name: "Turku Ruissalo Saaronniemi", Lat: 60.42828, Lon: 22.100533},
	{FMISID: "134254", Name: "Hamina Pitäjänsaari", Lat: 60.562767, Lon: 27.1792},
	{FMISID: "134224", Name: "Rauma Petäjäs", Lat: 61.133896, Lon: 21.442631},
	{FMISID: "134266", Name: "Pori Mäntyluoto Kallo", Lat: 61.59438, Lon: 21.46343},
	{FMISID: "134251", Name: "Kaskinen Ådskär", Lat: 62.34395, Lon: 21.21483},
	{FMISID: "134223", Name: "Vaasa Vaskiluoto", Lat: 63.0815, Lon: 21.57118},
	{FMISID: "134250", Name: "Pietarsaari Leppäluoto", Lat: 63.70857, Lon: 22.68958},
	{FMISID: "100540", Name: "Raahe Lapaluoto", Lat: 64.6663, Lon: 24.40708},
	{FMISID: "134248", Name: "Oulu Toppila", Lat: 65.0403, Lon: 25.4182},
	{FMISID: "100539", Name: "Kemi Ajos", Lat: 65.67337, Lon: 24.51526},

	// Coastal and offshore weather stations — lighthouses, outer skerries and
	// harbours. Picked out of the land weather network by hand: the network
	// itself has no coastal/inland flag, and a plain bounding box would pull
	// in Tampere, Jyväskylä and Lappeenranta.
	{FMISID: "100921", Name: "Kökar Bogskär", Lat: 59.504544, Lon: 20.347475},
	{FMISID: "100932", Name: "Hanko Russarö", Lat: 59.773633, Lon: 22.948683},
	{FMISID: "100908", Name: "Parainen Utö", Lat: 59.779094, Lon: 21.374788},
	{FMISID: "100946", Name: "Hanko Tulliniemi", Lat: 59.808642, Lon: 22.912464},
	{FMISID: "100965", Name: "Raasepori Jussarö", Lat: 59.820758, Lon: 23.57309},
	{FMISID: "100945", Name: "Kemiönsaari Vänö", Lat: 59.86949, Lon: 22.193427},
	{FMISID: "100997", Name: "Kirkkonummi Mäkiluoto", Lat: 59.919823, Lon: 24.350229},
	{FMISID: "100969", Name: "Inkoo Bågaskär", Lat: 59.931136, Lon: 24.014082},
	{FMISID: "100909", Name: "Lemland Nyhamn", Lat: 59.959108, Lon: 19.953736},
	{FMISID: "101022", Name: "Porvoo Kalbådagrund", Lat: 59.985683, Lon: 25.598788},
	{FMISID: "108020", Name: "Inkoo Jakobramsjö", Lat: 59.994639, Lon: 23.995599},
	{FMISID: "100929", Name: "Maarianhamina Badhusberget", Lat: 60.100976, Lon: 19.92564},
	{FMISID: "105392", Name: "Sipoo Itätoukki", Lat: 60.101207, Lon: 25.194394},
	{FMISID: "100996", Name: "Helsinki Harmaja", Lat: 60.10512, Lon: 24.97539},
	{FMISID: "100924", Name: "Parainen Fagerholm", Lat: 60.111626, Lon: 21.698278},
	{FMISID: "151048", Name: "Lumparland Långnäs satama", Lat: 60.115843, Lon: 20.297649},
	{FMISID: "151028", Name: "Helsinki Vuosaari satama", Lat: 60.20867, Lon: 25.1959},
	{FMISID: "100928", Name: "Kumlinge kirkonkylä", Lat: 60.258229, Lon: 20.746975},
	{FMISID: "101039", Name: "Loviisa Orrengrund", Lat: 60.274765, Lon: 26.447587},
	{FMISID: "101042", Name: "Kotka Haapasaari", Lat: 60.286758, Lon: 27.184825},
	{FMISID: "100919", Name: "Hammarland Märket", Lat: 60.30098, Lon: 19.13142},
	{FMISID: "100683", Name: "Porvoo Kilpilahti satama", Lat: 60.303725, Lon: 25.549164},
	{FMISID: "101030", Name: "Kotka Rankki", Lat: 60.375377, Lon: 26.958926},
	{FMISID: "100947", Name: "Turku Rajakari", Lat: 60.37788, Lon: 22.0964},
	{FMISID: "101059", Name: "Kustavi Isokari", Lat: 60.722198, Lon: 21.02681},
	{FMISID: "101061", Name: "Rauma Kylmäpihlaja", Lat: 61.14475, Lon: 21.30273},
	{FMISID: "101267", Name: "Pori Tahkoluoto satama", Lat: 61.630419, Lon: 21.376203},
	{FMISID: "101268", Name: "Kristiinankaupunki Majakka", Lat: 62.20324, Lon: 21.16983},
	{FMISID: "101256", Name: "Kaskinen Sälgrund", Lat: 62.333816, Lon: 21.190813},
	{FMISID: "101479", Name: "Korsnäs Bredskäret", Lat: 62.93488, Lon: 21.18485},
	{FMISID: "101481", Name: "Maalahti Strömmingsbådan", Lat: 62.978388, Lon: 20.740078},
	{FMISID: "101464", Name: "Mustasaari Valassaaret", Lat: 63.435083, Lon: 21.068557},
	{FMISID: "101660", Name: "Pietarsaari Kallan", Lat: 63.75144, Lon: 22.52282},
	{FMISID: "101661", Name: "Kokkola Tankar", Lat: 63.95114, Lon: 22.84537},
	{FMISID: "101673", Name: "Kalajoki Ulkokalla", Lat: 64.33073, Lon: 23.44627},
	{FMISID: "101775", Name: "Raahe Nahkiainen", Lat: 64.611783, Lon: 23.896737},
	{FMISID: "101794", Name: "Oulu Vihreäsaari satama", Lat: 65.00637, Lon: 25.393248},
	{FMISID: "101784", Name: "Hailuoto Marjaniemi", Lat: 65.03975, Lon: 24.56118},
	{FMISID: "101783", Name: "Kemi I majakka", Lat: 65.385078, Lon: 24.095684},
}

// coastalWeatherFMISIDs is the wind query's station list: every coastal
// weather station above, plus the two mareograph sites that also carry an
// anemometer (Kemi Ajos and Raahe Lapaluoto).
var coastalWeatherFMISIDs = []string{
	"100921", "100932", "100908", "100946", "100965", "100945", "100997",
	"100969", "100909", "101022", "108020", "100929", "105392", "100996",
	"100924", "151048", "100669", "151028", "100928", "101039", "101042",
	"100919", "100683", "101030", "100947", "101059", "101061", "101267",
	"101268", "101256", "101479", "101481", "101464", "101660", "101661",
	"101673", "101775", "100540", "101794", "101784", "101783", "100539",
}

// matchTolerance is how far a reported position may sit from a known one and
// still be treated as the same station, in degrees — roughly 1 km of latitude.
// Two Turku mareographs sit ~400 m apart, so the match picks the nearest
// station within the tolerance rather than the first one found.
const matchTolerance = 0.01
