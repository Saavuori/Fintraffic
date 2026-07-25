# Fintraffic HTTP API

All endpoints are served by the Go backend. Global endpoints live under `/api/`;
each traffic mode mounts its routes under `/api/<mode>/` (`meri`, `raide`, `tie`).

Conventions:

* All JSON responses send `Access-Control-Allow-Origin: *`.
* Poll-backed endpoints answer **`503 data not available yet`** on cold start
  (no upstream poll has succeeded yet). The frontend treats this as a loading
  state; clients should retry.
* No authentication or API key — the backend only re-serves
  [Digitraffic](https://www.digitraffic.fi/en/) open data from its cache, and
  nothing a visitor requests ever triggers an upstream call.

## Global

| Method | Path | Purpose |
|---|---|---|
| `GET` | `/api/health` | Aggregated status (see below) |
| `GET` | `/api/version` | Build `version`, `build_date`, `git_sha` (injected via ldflags) |
| `GET` | `/metrics` | Prometheus exposition format |
| `GET` | `/` | Embedded React SPA (go:embed static fallback) |

### `GET /api/health`

Reports overall status plus each mode's own health under `modes.<name>`.
`status` is `"healthy"` or `"degraded"`; the whole response degrades if Redis is
down or any mode is degraded (a mode is degraded during cold start and when its
primary feed has been failing for several poll cadences).

```json
{
  "status": "healthy",
  "redis_connected": true,
  "uptime_seconds": 168,
  "modes": {
    "meri":  { "status": "healthy", "details": { "active_vessels": 856, "mqtt_connected": true,
               "trail_enabled": true, "trail_points": 1578, "trail_newest_ts_age_sec": 4 } },
    "raide": { "status": "healthy", "details": { "active_trains": 114, "locations_poll_age_sec": 3 } },
    "tie":   { "status": "healthy", "details": { "active_stations": 517, "tms_poll_age_sec": 45 } }
  }
}
```

`*_age_sec` fields are `-1` until the first successful poll / recorded point.

## Meri (`/api/meri`) — marine traffic

| Method | Path | Purpose |
|---|---|---|
| `GET` | `/api/meri/ports` | Finnish ports with coordinates (thinned from Portnet, 24 h cache) |
| `GET` | `/api/meri/port-calls/{locode}` | Arrivals/departures for a port by UN/LOCODE (3 min cache) |
| `GET` | `/api/meri/vessel/{mmsi}` | Vessel metadata (10 min cache) merged with its live cached position |
| `GET` | `/api/meri/vessel/{mmsi}/trail` | Recorded track for one vessel |
| `GET` | `/api/meri/replay` | All vessels' recorded tracks in a time window (fleet replay) |
| `GET` | `/api/meri/sea-state` | Smart-buoy sea state measurements (15 min cache) |
| `GET` | `/api/meri/sea-conditions` | FMI marine observations: waves, coastal wind, sea level (polled every 10 min) |
| `GET` | `/api/meri/aton-faults` | Active aids-to-navigation faults (5 min cache) |
| `GET` | `/api/meri/stream` | WebSocket stream of live vessel positions |

### `GET /api/meri/vessel/{mmsi}/trail`

Query parameters:

| Param | Default | Notes |
|---|---|---|
| `from` | now − 24 h | epoch seconds |
| `to` | now | epoch seconds |
| `maxPoints` | 1000 | server decimates evenly; capped at 20 000 |

Returns `{ "mmsi": 230123456, "points": [[lng, lat, ts], ...] }` ascending by
time — ready to drop into a GeoJSON LineString.

### `GET /api/meri/sea-conditions`

Three FMI observation networks folded into one list of stations. Every
measurement is optional and omitted when absent — a wave buoy has no
anemometer, and the buoys are lifted out of the water for the winter, so a
missing field must not be read as zero.

```json
{ "updated": "2026-07-25T14:10:00Z",
  "sources": [{ "key": "wave", "ok": true, "stations": 10 }],
  "stations": [
    { "id": "59.2482,20.9983", "name": "Pohjois-Itämeri aaltopoiju",
      "lat": 59.24817, "lon": 20.99833, "kinds": ["wave"],
      "observed": "2026-07-25T13:30:00Z",
      "waveHeight": 1.4, "wavePeriod": 5.7, "waveDir": 213, "waterTemp": 16.2 }
  ] }
```

Units: `waveHeight` m, `wavePeriod` s, `waveDir`/`windDir` degrees the waves or
wind come **from**, `windSpeed`/`windGust` m/s, `waterLevel` cm from theoretical
mean sea level, temperatures °C.

`sources` reports each upstream query separately, and carries an `error` string
when one failed. It exists so an empty layer can be explained: FMI's wave buoys
going quiet in November is normal, a broken query is not. One failing source
does not fail the request — the others are still served. `503` means nothing is
cached yet at all.

### `GET /api/meri/replay`

Query parameters `from`/`to` (epoch seconds). The window is clamped to the most
recent **24 h**; each vessel contributes at most 600 points and the whole
response is capped at 400 000 rows (`"truncated": true` when the caps bit).

```json
{ "from": 1784869493, "to": 1784880293, "truncated": false,
  "vessels": { "230123456": [[lng, lat, ts, cog], ...] } }
```

### `GET /api/meri/stream` (WebSocket)

On connect the hub sends a full **snapshot**; afterwards a **delta** every
second containing only vessels whose position advanced, plus `removed` MMSIs.
A full snapshot is re-sent every 60 ticks as a resync safety net.

```json
{ "type": "snapshot", "vessels": { "<mmsi>": { ...position+metadata } } }
{ "type": "delta",    "vessels": { ... }, "removed": [230123456] }
```

## Raide (`/api/raide`) — railway traffic

| Method | Path | Purpose |
|---|---|---|
| `GET` | `/api/raide/trains` | Live train positions (10 s poll) merged with timetable metadata: category, commuter line, operator, origin/destination, delay at last passed station, next/upcoming commercial stops |
| `GET` | `/api/raide/stations` | Station register: code, name, coordinates, `passenger`, `major` flags |
| `GET` | `/api/raide/departures/{shortCode}` | Departure/arrival board for one station (e.g. `HKI`), computed on demand from the cached live-trains snapshot |

Board rows cover −15 min…+6 h, max 30 departures + 30 arrivals, sorted by
scheduled time; `liveTime` is the actual time when recorded, else the live
estimate. Trains without GPS are absent from `/trains`; positions without
timetables still appear with `"category": "Unknown"`.

## Tie (`/api/tie`) — road traffic

| Method | Path | Purpose |
|---|---|---|
| `GET` | `/api/tie/tms` | TMS measurement stations with sensor data, road bearing and seasonal free-flow speed baselines (1 min poll) |
| `GET` | `/api/tie/roadworks` | Road works as flattened GeoJSON (from Datex2, incl. work-zone speed limits; 2 min poll) |
| `GET` | `/api/tie/incidents` | Traffic incident announcements, same flattened shape (2 min poll) |
| `GET` | `/api/tie/speedlimits` | Variable speed-limit signs and their currently displayed limits (1 min poll) |
| `GET` | `/api/tie/parking` | Parking facilities with live space availability (2 min poll) |
| `GET` | `/api/tie/weathercams` | Weather cameras (preset image lists) enriched with the nearest road-weather-station observations (3 min poll); images themselves are served by `weathercam.digitraffic.fi` |
| `GET` | `/api/tie/charging` | AFIR EV charging network with live per-EVSE availability (5 min poll) |

TMS speed colouring context: stations carry `freeFlow1`/`freeFlow2` (the
seasonal free-flow speed baselines) and `bearing`; the frontend colours by
current speed ÷ baseline, never by a static speed limit — Digitraffic exposes
none for TMS stations.
