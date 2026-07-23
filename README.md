# 🚢 Meriliikenne — Live Finnish Marine Traffic Tracker

[![Live Application](https://img.shields.io/badge/Live-meriliikenne.duckdns.org-2dd4bf?style=for-the-badge&logo=react)](https://meriliikenne.duckdns.org/)
[![Changelog](https://img.shields.io/badge/Changelog-GitHub%20Pages-38bdf8?style=for-the-badge&logo=github)](https://saavuori.github.io/Marinetraffic/)

A real-time map of **every vessel broadcasting AIS in Finnish waters**, built on Digitraffic's open marine data. Glassmorphic UI, smooth dead-reckoned vessel movement, live port calls, sea state, and navigation aid faults.

👉 **Experience the live map at [meriliikenne.duckdns.org](https://meriliikenne.duckdns.org/)**

📖 **Check out recent updates and release history on the [Live Changelog](https://saavuori.github.io/Marinetraffic/)**

---

## ✨ Key Features

### Live Map

* **Real-time AIS Vessel Tracking**: Live position, speed, course, and heading for every AIS-broadcasting vessel in Finnish waters, streamed over MQTT from Digitraffic's public broker.
* **Dead-Reckoning Animation**: Since ships report far less often than trams (every ~10s to 6 minutes depending on speed and navigational status), vessels are projected forward from their last fix using speed-over-ground and course-over-ground, giving smooth motion between sparse updates instead of jump-then-freeze.
* **Ship-Type Categorization**: Vessels are colour-coded by AIS ship type — passenger, cargo, tanker, high-speed craft, tug/special (pilot, SAR, tug, port tender, law enforcement), sailing/pleasure, and military — with a filterable legend showing live per-category counts.
* **Ports & Port Calls**: Finnish ports render on the map; click one to see live arrivals and departures sourced from the Portnet port-call registry, with berth names and actual vs. estimated times.
* **Sea State & Navigation Aid Faults**: Smart-buoy sea-state readings (wave height trend, sea state, temperature) and aids-to-navigation fault reports (unlit buoys, damaged markers) render as map layers, with an alerts feed in the sidebar.
* **Vessel Detail Panel**: Click any vessel for its full telemetry — speed, course, heading, navigational status, destination, ETA, draught, MMSI/IMO/call sign, and dimensions.
* **Follow (Chase Cam) Mode**: Lock onto any vessel to track it automatically as it moves.
* **Light / Dark Themes**: Switch between a light and dark neutral basemap (CartoDB Positron / Dark Matter). Preference persists in `localStorage`.

### Data & Performance

* **Snapshot + Delta WebSocket Streaming**: New clients receive one full snapshot on connect; every second after that, only vessels whose position changed are sent (plus any that went stale), with a full resync every 60 ticks as a safety net — keeping bandwidth low across ~1,000+ concurrently tracked vessels.
* **REST Hydration on Boot**: Anchored/moored vessels can go minutes between AIS reports, so the backend fetches the full current fleet from Digitraffic's REST API on startup — the map is fully populated within seconds instead of slowly trickling in over MQTT.
* **Request Coalescing & Response Caching**: Go's `singleflight.Group` deduplicates concurrent upstream queries, backed by an in-memory response cache — port calls (3 min TTL), vessel metadata (10 min), sea state (15 min), AtoN faults (5 min), and the thinned Finnish ports list (24h).
* **Glassmorphic, Gesture-Driven UI**: Responsive control panels with collapsible sidebars that leave a glass edge peeking out, opened by click or swipe.

---

## Technical Stack

* **Backend**: Go 1.26, using native `http.ServeMux` method-and-pattern routing (Go 1.22+), `coder/websocket` for streaming, `eclipse/paho.mqtt.golang` to ingest live AIS over MQTT/WSS, and `golang.org/x/sync/singleflight` for query deduplication.
* **AIS Ingestion**: Subscribes to `vessels-v2/#` on `wss://meri.digitraffic.fi:443/mqtt` (location, metadata, and status topics), merging location and metadata streams into one record per MMSI.
* **State Store**: Redis 8 (Alpine), a low-overhead live position cache with a 64 MB `allkeys-lru` cap. An in-memory map is used instead when Redis is disabled.
* **Frontend**: React 19, TypeScript, Vite 8, MapLibre GL JS 5.x, Lucide icons, and vanilla CSS with custom theme variables.
* **Map Basemap**: CartoDB Positron (light) / Dark Matter (dark) — keyless, no API key required.
* **Marine Data**: [Digitraffic](https://www.digitraffic.fi/en/marine-traffic/) — Finnish Transport Infrastructure Agency's open marine traffic API (AIS, port calls, sea state estimation, aids-to-navigation faults). No API key required.
* **Reverse Proxy**: Caddy 2 (Alpine) with gzip/zstd compression.
* **CI/CD**: GitHub Actions auto-tagging semver releases from conventional commits and building multi-arch images (`linux/amd64`, `linux/arm64`) to GitHub Container Registry, plus a Pages workflow publishing the changelog.

---

## HTTP API

All endpoints are served by the Go backend under `/api/v1`.

| Method | Path | Purpose |
|---|---|---|
| `GET` | `/api/v1/health` | Liveness plus `mqtt_connected`, `redis_connected`, `active_vessels`, `uptime_seconds` |
| `GET` | `/api/v1/version` | Build `version`, `build_date`, and `git_sha` (injected via ldflags) |
| `GET` | `/api/v1/ports` | Finnish ports with coordinates (thinned from Digitraffic's Portnet location registry) |
| `GET` | `/api/v1/port-calls/{locode}` | Arrivals/departures for a port by UN/LOCODE |
| `GET` | `/api/v1/vessel/{mmsi}` | Vessel metadata merged with its live cached position |
| `GET` | `/api/v1/sea-state` | Smart-buoy sea state measurements |
| `GET` | `/api/v1/aton-faults` | Active aids-to-navigation faults |
| `GET` | `/api/v1/stream` | WebSocket stream of live vessel positions (snapshot + delta) |
| `GET` | `/metrics` | Prometheus exposition format |
| `GET` | `/` | Embedded React SPA (go:embed static fallback) |

---

## Project Structure

```
Marinetraffic/
├── backend/                  # Go application source
│   ├── cmd/marinetraffic/    # main entry point
│   ├── internal/             # config, cache, ais, ws, api packages
│   └── go.mod
├── frontend/                 # React 19 TypeScript client source
│   ├── src/                  # components, hooks, lib, styles, types
│   └── package.json
├── scripts/                  # CHANGELOG.md -> dist-changelog/ site generator
├── dist-changelog/           # Generated changelog site (GitHub Pages)
├── .github/workflows/        # Multi-arch image build + Pages deploy
├── deploy/                   # Production docker-compose.yml + update.sh
├── Dockerfile                # Multi-stage build context
└── CHANGELOG.md              # Release history
```

---

## Configuration

Set the following in `.env` or in your environment. The backend auto-loads a `.env` file from the working directory, its parent, or `backend/`; real environment variables always take precedence.

| Variable | Description | Default |
|---|---|---|
| `REDIS_URL` | Redis cache connection string | `redis://marinetraffic-cache:6379` |
| `MQTT_BROKER` | Digitraffic marine MQTT/WSS endpoint | `wss://meri.digitraffic.fi:443/mqtt` |
| `PORT` | Go backend server port | `8080` |
| `NO_REDIS` | Set to `true` to use an in-memory cache instead of Redis (same as `--no-redis`) | `false` |

No API key is required — Digitraffic's marine APIs are open data.

---

## Local Development Setup

### 1. Run Backend (No Redis needed)

Pass `--no-redis` to skip running a local Redis container:
```bash
cd backend
go run ./cmd/marinetraffic --no-redis
```
*(Server listens on port `:8080`)*

### 2. Run Frontend Dev Server

```bash
cd frontend
npm install
npm run dev
```
*(Vite runs on port `:5173` and automatically proxies `/api` and the `/api/v1/stream` WebSocket to `:8080`)*

---

## Deployment

### Local Deployment (Docker)

```bash
docker build -t marinetraffic .
docker run -p 8080:8080 -e NO_REDIS=true marinetraffic

curl http://localhost:8080/api/v1/health
```

### Production Deployment (RHEL & Podman)

Deployed alongside sibling apps (ratikka, tieliikenne, bensa) behind a single shared Caddy instance on an Oracle Cloud host. See `deploy/docker-compose.yml` and `deploy/update.sh` — the backend publishes no ports and joins the external `web-proxy` Podman network; Caddy on the shared host reverse-proxies `meriliikenne.duckdns.org` to it. Images are refreshed by an `update.sh` cron job every 5 minutes rather than Watchtower, which is incompatible with rootless Podman.
