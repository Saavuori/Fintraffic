### Added
- **Road weather layer in Tie**: all ~510 active Digitraffic road weather stations now sit on the map as hexagons, graded green / amber / red by the worst of three signals: Digitraffic's own road-weather warning, the measured road condition (ice, snow, frost, slush) and surface friction where the station has a friction sensor. Until now the backend fetched this feed every three minutes but only used it to attach the nearest station's readings to a weather camera, so roughly four in five stations were never seen. Selecting a station shows road surface and air temperature, condition, warning, friction, humidity, wind, precipitation and visibility; stations are searchable too.
- **Maintenance vehicles layer in Tie**: snowploughs, gritters, graders and other road-maintenance vehicles from Digitraffic's maintenance tracking, each with the road it has covered in the last hour. Vehicles and trails are coloured by what they are doing (ploughing, salting/sanding, other); a vehicle that reports a heading is drawn as an arrow, and one that has gone quiet fades. Digitraffic splits each vehicle's route into few-minute segments, so the backend joins them into continuous trails, about 25 times fewer features to send. The feed covers every reporting domain, not just the state-road default, so municipal fleets appear when they report.

### Changed
- **Weather readings read in English and include friction and warning**: the weather block on a camera now shows the coded readings as "Wet" or "Beware" rather than a bare number with the Finnish description, and carries the two new readings.

### Notes
- `/api/health` reports `weather_stations` and `maintenance_vehicles` under `modes.tie`, both -1 until their first successful poll.
