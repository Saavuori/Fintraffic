package ilma

// airlineNames maps an ICAO airline designator (the first three letters of an
// airline callsign) to the name a passenger would recognise. It covers the
// operators regularly seen in or over Finnish airspace; an unknown prefix just
// leaves the name empty and the panel shows the callsign alone.
var airlineNames = map[string]string{
	// Finland and the Nordics
	"FIN": "Finnair",
	"SAS": "SAS",
	"SZS": "SAS Connect",
	"NSZ": "Norwegian",
	"NAX": "Norwegian",
	"NOZ": "Norwegian",
	"IBK": "Norwegian",
	"ICE": "Icelandair",
	"BRX": "Braathens Regional",
	"WIF": "Widerøe",

	// Baltics and Central Europe
	"BTI": "airBaltic",
	"LOT": "LOT Polish Airlines",
	"DLH": "Lufthansa",
	"EWG": "Eurowings",
	"CFG": "Condor",
	"AUA": "Austrian Airlines",
	"SWR": "Swiss",
	"KLM": "KLM",
	"TRA": "Transavia",
	"AFR": "Air France",
	"BAW": "British Airways",
	"IBE": "Iberia",
	"VLG": "Vueling",
	"TAP": "TAP Air Portugal",
	"ITY": "ITA Airways",
	"AEE": "Aegean Airlines",
	"ENT": "Enter Air",

	// Low-cost
	"RYR": "Ryanair",
	"RUK": "Ryanair UK",
	"MAY": "Malta Air",
	"WZZ": "Wizz Air",
	"WUK": "Wizz Air UK",
	"WMT": "Wizz Air Malta",
	"EZY": "easyJet",
	"EJU": "easyJet Europe",
	"EZS": "easyJet Switzerland",
	"PGT": "Pegasus",
	"SXS": "SunExpress",
	"TOM": "TUI Airways",
	"TFL": "TUI fly Netherlands",
	"JAF": "TUI fly Belgium",

	// Long-haul over the pole and across Siberia
	"THY": "Turkish Airlines",
	"QTR": "Qatar Airways",
	"UAE": "Emirates",
	"ETD": "Etihad",
	"JAL": "Japan Airlines",
	"ANA": "All Nippon Airways",
	"KAL": "Korean Air",
	"AAR": "Asiana Airlines",
	"CPA": "Cathay Pacific",
	"CCA": "Air China",
	"CES": "China Eastern",
	"CSN": "China Southern",
	"CHH": "Hainan Airlines",
	"SIA": "Singapore Airlines",
	"THA": "Thai Airways",
	"EVA": "EVA Air",
	"CAL": "China Airlines",
	"AIC": "Air India",
	"UZB": "Uzbekistan Airways",
	"KZR": "Air Astana",

	// Cargo
	"FDX": "FedEx",
	"UPS": "UPS",
	"BCS": "DHL (European Air Transport)",
	"DHK": "DHL Air UK",
	"CLX": "Cargolux",
	"GTI": "Atlas Air",
	"CKK": "China Cargo Airlines",

	// Business aviation
	"NJE": "NetJets Europe",
	"VJT": "VistaJet",
}
