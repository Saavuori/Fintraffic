# 🇫🇮 Fintraffic — Live Finnish Traffic Tracker (Meri · Raide · Tie)

[![Live Application](https://img.shields.io/badge/Live-liikenne.duckdns.org-2dd4bf?style=for-the-badge&logo=react)](https://liikenne.duckdns.org/)
[![Changelog](https://img.shields.io/badge/Changelog-GitHub%20Pages-38bdf8?style=for-the-badge&logo=github)](https://saavuori.github.io/Fintraffic/)

One live map for **Finnish sea, rail and road traffic**, built on Digitraffic's open data: a single Go backend + React frontend with three switchable modes — 🚢 **Meri** (vessels), 🚆 **Raide** (trains) and 🚗 **Tie** (road traffic).

---

## Architecture

One Go binary serves every mode. `internal/core` holds the mode-agnostic infrastructure; each traffic mode lives in its own package and mounts its routes under `/api/<mode>/`:

```
Fintraffic/
├── backend/
│   ├── cmd/fintraffic/          # main entry point
│   └── internal/
│       ├── core/
│       │   ├── cache/           # Redis live cache (+ in-memory fallback)
│       │   ├── config/          # env/.env config loading
│       │   ├── server/          # router, embedded SPA, /api/health, /api/version
│       │   └── upstream/        # Digitraffic HTTP client + cached singleflight proxy
│       ├── meri/                # marine mode: AIS ingest (MQTT), trail store (SQLite),
│       │   │                    #   WebSocket hub, REST handlers
│       │   ├── ais/  trail/  ws/
│       ├── raide/               # railway mode: rata.digitraffic.fi polling,
│       │                        #   GPS/timetable merge, station boards
│       └── tie/                 # road mode: TMS/traffic-message/parking/AFIR
│                                #   polling (7 feeds), Datex2 flattening
├── frontend/
│   └── src/
│       ├── App.tsx              # shell: mode switcher + shared theme
│       ├── shared/              # mode-agnostic hooks + components
│       └── modes/
│           ├── meri/            # the marine map app
│           ├── raide/           # the railway map app
│           └── tie/             # the road map app
├── scripts/                     # CHANGELOG.md -> changelog site generator
├── .github/workflows/           # Multi-arch image build + Pages deploy
├── deploy/                      # Production docker-compose.yml + update.sh
└── Dockerfile                   # Multi-stage build (frontend embedded via go:embed)
```

Modes implement the `server.Mode` interface (`Name`, `Register`, `Health`); the global `/api/health` aggregates every mode's status.

---

## ✨ Meri mode (marine traffic)

* **Real-time AIS vessel tracking** streamed over MQTT from `wss://meri.digitraffic.fi:443/mqtt`, with REST hydration on boot and snapshot + delta WebSocket streaming to clients.
* **Dead-reckoning animation** between sparse AIS fixes; follow (chase-cam) mode.
* **Vessel trails** — every fix recorded to an on-disk SQLite store (60-day retention, 1 pt/min/vessel); selected vessels draw their dotted history track.
* **Fleet replay** — animated playback of all vessels' recorded tracks with play/pause/scrub/speed transport.
* **Ports & port calls, sea state buoys, AtoN faults** as toggleable layers.
* **Länsisatama LT1/LT2 webcams** — live YouTube streams from Port of Helsinki's passenger terminal cameras, plotted next to the Länsisatama port pin.
* **Ship-type categorization** with colour-coded markers and live per-category counts.

## ✨ Raide mode (railway traffic)

* **Live train positions** polled from `rata.digitraffic.fi` every 10 s and merged with timetables (60 s) and the station register (6 h); trains without GPS are dropped, positions without timetables still render.
* **Liveried categories** — green long-distance, purple commuter (labelled by line letter), amber cargo — with delay rings (warn/bad) and cancelled badges.
* **Station departure/arrival boards** computed on demand from the cached live-trains snapshot; delay minutes, live estimates and track numbers per row.
* **Rail track overlay** drawn from the basemap's own vector tiles so the network reads clearly under the markers.
* Cold start returns 503, shown as a loading state; the shared cache serves last-good data through Redis outages.

## ✨ Tie mode (road traffic)

* **TMS traffic stations** (1-min cadence) coloured by current speed ÷ seasonal free-flow baseline — not raw km/h — with road-bearing-oriented per-direction markers.
* **Road works & incidents** (2 min): deep Datex2 JSON flattened server-side to title/description/geometry, including work-zone speed limits.
* **Variable speed-limit signs** (1 min), **parking availability** (2 min), **EV charging (AFIR)** locations with live per-EVSE availability (5 min), and **weather cameras** enriched with the nearest road-weather-station observations (3 min).
* Locate-me control, per-layer toggles (7 layers), camera thumbnails loaded straight from `weathercam.digitraffic.fi`.

---

## Data Sources

All data comes from [Digitraffic](https://www.digitraffic.fi/en/) and other Fintraffic open APIs — public, keyless, licensed [CC BY 4.0](https://creativecommons.org/licenses/by/4.0/). The backend identifies itself with a `Digitraffic-User` header per the API etiquette.

### 🚢 Meri — `meri.digitraffic.fi`

| Feed | Endpoint | Used for |
|---|---|---|
| AIS positions & metadata | MQTT `wss://meri.digitraffic.fi:443/mqtt`, topic `vessels-v2/#` | Live vessel stream (positions, metadata, nav status) |
| AIS REST | `/api/ais/v1/vessels`, `/api/ais/v1/locations` | Fleet hydration on boot + per-vessel details |
| Port calls (Portnet) | `/api/port-call/v1/ports`, `/api/port-call/v1/port-calls` | Finnish ports layer + arrivals/departures |
| Sea state estimation | `/api/sse/v1/measurements` | Smart-buoy wave/sea-state layer |
| Aids to navigation | `/api/aton/v1/faults` | AtoN fault warnings layer |
| Port of Helsinki webcams | YouTube live streams (portofhelsinki.fi), hardcoded — no upstream API | Länsisatama LT1/LT2 webcam markers |

### 🚆 Raide — `rata.digitraffic.fi`

| Feed | Endpoint | Used for |
|---|---|---|
| Train locations | `/api/v1/train-locations/latest` (10 s poll) | Live train GPS positions |
| Live trains | `/api/v1/live-trains` (60 s poll) | Timetables, delays, categories, station boards |
| Station metadata | `/api/v1/metadata/stations` (6 h poll) | Station register (names, coordinates) |

### 🚗 Tie — `tie.digitraffic.fi` + friends

| Feed | Endpoint | Used for |
|---|---|---|
| TMS stations | `tie.digitraffic.fi/api/tms/v1/stations[/data]` (1 min poll) | Traffic measurement stations layer |
| TMS constants & sensors | `tie.digitraffic.fi/api/tms/v1/stations/sensor-constants`, `/api/tms/v1/sensors` (6 h) | Free-flow speed baselines, road bearings, sensor descriptions |
| Traffic messages | `tie.digitraffic.fi/api/traffic-message/v2/roadworks`, `/traffic-announcements` (2 min) | Road works + incidents layers |
| Variable signs | `tie.digitraffic.fi/api/variable-sign/v1/signs` (1 min) | Variable speed-limit layer |
| Road weather | `tie.digitraffic.fi/api/weather/v1/stations[/data]` (3 min) | Weather readings embedded in camera popups |
| Weather cameras | `tie.digitraffic.fi/api/weathercam/v1/stations` (3 min) + images from `weathercam.digitraffic.fi` | Weather camera layer + thumbnails |
| Parking | `parking.fintraffic.fi/api/v1/facilities`, `/utilizations` (2 min) | Parking availability layer |
| EV charging (AFIR) | `afir.digitraffic.fi/api/charging-network/v1/locations[/statuses]` (5 min) | EV charging layer with per-EVSE availability |

## HTTP API

Global endpoints (`/api/health`, `/api/version`, `/metrics`) plus per-mode routes under `/api/meri/`, `/api/raide/` and `/api/tie/`. The full endpoint reference — paths, query parameters, response shapes and caching/poll cadences — lives in **[docs/API.md](docs/API.md)**.

---

## Technical Stack

* **Backend**: Go 1.26, native `http.ServeMux` method-and-pattern routing, `coder/websocket`, `eclipse/paho.mqtt.golang`, `modernc.org/sqlite` (pure Go, no CGO), `golang.org/x/sync/singleflight`, Prometheus client.
* **State store**: Redis 8 (Alpine) live-position cache (per-mode hash namespaces, e.g. `fintraffic:meri:positions`), with an automatic in-memory fallback.
* **Frontend**: React 19, TypeScript, Vite 8, MapLibre GL JS 5.x, Lucide icons, vanilla CSS with theme variables.
* **Basemap**: CartoDB Positron (light) / Dark Matter (dark) — keyless.
* **Data**: [Digitraffic](https://www.digitraffic.fi/en/) — Fintraffic's open traffic APIs (no API key required).
* **CI/CD**: GitHub Actions auto-tagging semver releases from conventional commits, multi-arch images (`linux/amd64`, `linux/arm64`) to GitHub Container Registry, plus a Pages workflow publishing the changelog.

---

## Configuration

Set in `.env` or the environment. The backend auto-loads a `.env` file from the working directory, its parent, or `backend/`; real environment variables take precedence.

| Variable | Description | Default |
|---|---|---|
| `REDIS_URL` | Redis cache connection string | `redis://fintraffic-cache:6379` |
| `MQTT_BROKER` | Digitraffic marine MQTT/WSS endpoint | `wss://meri.digitraffic.fi:443/mqtt` |
| `PORT` | Go backend server port | `8080` |
| `NO_REDIS` | `true` to use an in-memory cache instead of Redis (same as `--no-redis`) | `false` |
| `TRAIL_DB_PATH` | SQLite trail DB path (empty string disables trail recording) | `/data/trail.db` |
| `TRAIL_RETENTION_DAYS` | Trail history retention window | `60` |
| `TRAIL_INTERVAL_SEC` | Per-vessel trail downsample interval | `60` |

---

## Local Development Setup

### 1. Run Backend (No Redis needed)

```bash
cd backend
go run ./cmd/fintraffic --no-redis
```
*(Server listens on port `:8080`)*

### 2. Run Frontend Dev Server

```bash
cd frontend
npm install
npm run dev
```
*(Vite runs on port `:5173` and proxies `/api` and the `/api/meri/stream` WebSocket to `:8080`)*

---

## Deployment

### Local Deployment (Docker)

```bash
docker build -t fintraffic .
docker run -p 8080:8080 -e NO_REDIS=true fintraffic

curl http://localhost:8080/api/health
```

### Production Deployment (RHEL & Podman)

Deployed behind a single shared Caddy instance on an Oracle Cloud host. The backend publishes no ports and joins the external `web-proxy` Podman network; Caddy reverse-proxies `liikenne.duckdns.org` to it. This one stack replaces the standalone marinetraffic/railway/tieliikenne stacks (and their per-app Redis instances and domains).

Install or update the stack on the host:

```bash
curl -fsSLO https://raw.githubusercontent.com/Saavuori/Fintraffic/main/deploy/install.sh
chmod +x install.sh
./install.sh
```

The domain defaults to `liikenne.duckdns.org` and is used for the post-deploy health checks. To deploy under your own DNS name, pass it as an argument (or set `DOMAIN`):

```bash
./install.sh traffic.example.org
```

Other overrides: `APP_DIR` (default `~/fintraffic`) and `IMAGE` (default `ghcr.io/saavuori/fintraffic:latest`). The domain must resolve to the reverse proxy in front of the stack — add the matching vhost to the Caddy config on the `web-proxy` network and reload the proxy (Caddy only picks up a Caddyfile edit on `caddy reload`).

Two scripts in `deploy/`:

* **`install.sh`** — idempotent install/update: writes the compose file and `update.sh`, registers the auto-update cron, ensures the `web-proxy` network and trail volume exist, pulls the image, recreates the stack, and verifies trail recording actually came up. Run it for first install and whenever the *compose* changes (env vars, volumes).
* **`update.sh`** — image-only refresher, run every 5 minutes by the cron that `install.sh` registers: pulls the latest image and recreates the containers when it changed. It never touches the compose file, so config drift is fixed by re-running `install.sh`. (Watchtower is not used — it is incompatible with rootless Podman.)

## Dependency updates

Renovate opens one grouped pull request every Monday morning covering all five places the repo pins a version — `backend/go.mod`, `frontend/package.json`, the GitHub Actions in `.github/workflows/`, the `Dockerfile` build and runtime stages, and the images in `deploy/docker-compose.yml`. Major updates come as their own PR. Config lives in [`renovate.json5`](renovate.json5); the schedule is the cron in [`.github/workflows/renovate.yml`](.github/workflows/renovate.yml).

Each PR writes its own `CHANGELOG.md` entry: Renovate runs [`scripts/changelog-entry.js`](scripts/changelog-entry.js) as a post-upgrade task, which reads the pending diff and lists what moved. That text is factual only — expand it by hand when a bump actually matters.

### Required setup

The workflow needs a `RENOVATE_TOKEN` repository secret, and **it cannot be `GITHUB_TOKEN`**: pull requests opened with the built-in token don't trigger `pull_request` workflows, so the `backend` / `frontend` / `changelog` checks that `main`'s branch protection requires would never report and every dependency PR would sit blocked forever. Use either:

* a classic **personal access token** with `repo` scope, or
* a **GitHub App** installation token (finer-grained; needs `contents: write`, `pull-requests: write`, `workflows: write`).

Renovate is self-hosted here rather than the Mend-hosted app because writing the changelog entry needs `postUpgradeTasks`, and running arbitrary commands is a self-hosted-only capability. The command allow-list is `RENOVATE_ALLOWED_COMMANDS` in the workflow — Renovate runs nothing that doesn't match it, so that env var, not `renovate.json5`, is the security boundary.

To try it without opening anything, run the workflow manually from the Actions tab with **dryRun** checked.
