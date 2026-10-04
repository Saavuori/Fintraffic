package ilma

// airports is the static register of Finnish airports the map draws: every
// Finavia airport plus the larger airfields and air bases. Positions and
// elevations are from OurAirports (public domain); the register changes on the
// scale of years, so it is code rather than a feed.
var airports = []Airport{
	// Scheduled passenger service.
	{ICAO: "EFHK", IATA: "HEL", Name: "Helsinki-Vantaa", Latitude: 60.318363, Longitude: 24.963341, ElevFt: 179, Scheduled: true},
	{ICAO: "EFIV", IATA: "IVL", Name: "Ivalo", Latitude: 68.6073, Longitude: 27.4053, ElevFt: 481, Scheduled: true},
	{ICAO: "EFKT", IATA: "KTT", Name: "Kittilä", Latitude: 67.700996, Longitude: 24.8468, ElevFt: 644, Scheduled: true},
	{ICAO: "EFKU", IATA: "KUO", Name: "Kuopio", Latitude: 63.007099, Longitude: 27.7978, ElevFt: 323, Scheduled: true},
	{ICAO: "EFLP", IATA: "LPP", Name: "Lappeenranta", Latitude: 61.044601, Longitude: 28.144743, ElevFt: 349, Scheduled: true},
	{ICAO: "EFOU", IATA: "OUL", Name: "Oulu", Latitude: 64.930099, Longitude: 25.354601, ElevFt: 47, Scheduled: true},
	{ICAO: "EFRO", IATA: "RVN", Name: "Rovaniemi", Latitude: 66.563327, Longitude: 25.829751, ElevFt: 642, Scheduled: true},
	{ICAO: "EFTP", IATA: "TMP", Name: "Tampere-Pirkkala", Latitude: 61.414101, Longitude: 23.604401, ElevFt: 390, Scheduled: true},
	{ICAO: "EFTU", IATA: "TKU", Name: "Turku", Latitude: 60.514099, Longitude: 22.2628, ElevFt: 161, Scheduled: true},
	{ICAO: "EFVA", IATA: "VAA", Name: "Vaasa", Latitude: 63.05023, Longitude: 21.762543, ElevFt: 19, Scheduled: true},
	{ICAO: "EFET", IATA: "ENF", Name: "Enontekiö", Latitude: 68.362602, Longitude: 23.424299, ElevFt: 1005, Scheduled: true},
	{ICAO: "EFJO", IATA: "JOE", Name: "Joensuu", Latitude: 62.658815, Longitude: 29.619398, ElevFt: 398, Scheduled: true},
	{ICAO: "EFJY", IATA: "JYV", Name: "Jyväskylä", Latitude: 62.399502, Longitude: 25.678301, ElevFt: 459, Scheduled: true},
	{ICAO: "EFKE", IATA: "KEM", Name: "Kemi-Tornio", Latitude: 65.778702, Longitude: 24.5821, ElevFt: 61, Scheduled: true},
	{ICAO: "EFKI", IATA: "KAJ", Name: "Kajaani", Latitude: 64.2855, Longitude: 27.6924, ElevFt: 483, Scheduled: true},
	{ICAO: "EFKK", IATA: "KOK", Name: "Kokkola-Pietarsaari", Latitude: 63.721199, Longitude: 23.143101, ElevFt: 84, Scheduled: true},
	{ICAO: "EFKS", IATA: "KAO", Name: "Kuusamo", Latitude: 65.987602, Longitude: 29.239401, ElevFt: 866, Scheduled: true},
	{ICAO: "EFMA", IATA: "MHQ", Name: "Maarianhamina", Latitude: 60.1222, Longitude: 19.898199, ElevFt: 17, Scheduled: true},
	{ICAO: "EFPO", IATA: "POR", Name: "Pori", Latitude: 61.4617, Longitude: 21.799999, ElevFt: 44, Scheduled: true},
	{ICAO: "EFSA", IATA: "SVL", Name: "Savonlinna", Latitude: 61.9431, Longitude: 28.945101, ElevFt: 311, Scheduled: true},

	// Airfields and air bases without scheduled service.
	{ICAO: "EFHA", IATA: "KEV", Name: "Halli", Latitude: 61.856039, Longitude: 24.786686, ElevFt: 479},
	{ICAO: "EFIT", IATA: "KTQ", Name: "Kitee", Latitude: 62.1661, Longitude: 30.073601, ElevFt: 364},
	{ICAO: "EFKA", IATA: "KAU", Name: "Kauhava", Latitude: 63.127102, Longitude: 23.051399, ElevFt: 151},
	{ICAO: "EFKJ", IATA: "KHJ", Name: "Kauhajoki", Latitude: 62.463212, Longitude: 22.390817, ElevFt: 407},
	{ICAO: "EFMI", IATA: "MIK", Name: "Mikkeli", Latitude: 61.6866, Longitude: 27.201799, ElevFt: 329},
	{ICAO: "EFSI", IATA: "SJY", Name: "Seinäjoki", Latitude: 62.692101, Longitude: 22.8323, ElevFt: 302},
	{ICAO: "EFSO", IATA: "SOT", Name: "Sodankylä", Latitude: 67.394997, Longitude: 26.619101, ElevFt: 602},
	{ICAO: "EFUT", IATA: "UTI", Name: "Utti", Latitude: 60.8964, Longitude: 26.9384, ElevFt: 339},
	{ICAO: "EFVR", IATA: "VRK", Name: "Varkaus", Latitude: 62.171101, Longitude: 27.868601, ElevFt: 286},
	{ICAO: "EFYL", IATA: "YLI", Name: "Ylivieska", Latitude: 64.054722, Longitude: 24.725278, ElevFt: 252},
	{ICAO: "EFHV", IATA: "HYV", Name: "Hyvinkää", Latitude: 60.6544, Longitude: 24.8811, ElevFt: 430},
}
