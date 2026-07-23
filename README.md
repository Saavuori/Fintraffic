# 🇫🇮 Fintraffic — Live Finnish Traffic Tracker (Meri · Raide · Tie)

[![Live Application](https://img.shields.io/badge/Live-fintraffic.duckdns.org-2dd4bf?style=for-the-badge&logo=react)](https://fintraffic.duckdns.org/)
[![Changelog](https://img.shields.io/badge/Changelog-GitHub%20Pages-38bdf8?style=for-the-badge&logo=github)](https://saavuori.github.io/Fintraffic/)

One live map for **Finnish sea, rail and road traffic**, built on Digitraffic's open data. Fintraffic consolidates three standalone apps — Marinetraffic (Meri), railway (Raide) and tieliikenne (Tie) — into a single Go backend + React frontend with a mode switcher.

**Consolidation status:**

| Mode | Source app | Status |
|---|---|---|
| 🚢 **Meri** | [Marinetraffic](https://github.com/Saavuori/Marinetraffic) | ✅ Ported (phase 1) |
| 🚆 **Raide** | [railway](https://github.com/Saavuori/railway) | ⏳ Planned (phase 2) |
| 🚗 **Tie** | [tieliikenne](https://github.com/Saavuori/tieliikenne) | ⏳ Planned (phase 3) |

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
│       └── meri/                # marine mode: AIS ingest (MQTT), trail store (SQLite),
│           │                    #   WebSocket hub, REST handlers
│           ├── ais/  trail/  ws/
├── frontend/
│   └── src/
│       ├── App.tsx              # shell: Meri/Raide/Tie mode switcher
│       ├── shared/              # mode-agnostic hooks + components
│       └── modes/meri/          # the marine map app
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
* **Ship-type categorization** with colour-coded markers and live per-category counts.

## HTTP API

Global endpoints:

| Method | Path | Purpose |
|---|---|---|
| `GET` | `/api/health` | Aggregated status: redis, uptime, per-mode health (`modes.meri.*`) |
| `GET` | `/api/version` | Build `version`, `build_date`, `git_sha` (injected via ldflags) |
| `GET` | `/metrics` | Prometheus exposition format |
| `GET` | `/` | Embedded React SPA (go:embed static fallback) |

Meri mode (`/api/meri`):

| Method | Path | Purpose |
|---|---|---|
| `GET` | `/api/meri/ports` | Finnish ports with coordinates (thinned from Portnet) |
| `GET` | `/api/meri/port-calls/{locode}` | Arrivals/departures for a port by UN/LOCODE |
| `GET` | `/api/meri/vessel/{mmsi}` | Vessel metadata merged with its live cached position |
| `GET` | `/api/meri/vessel/{mmsi}/trail` | Recorded track as `[lng, lat, ts]` tuples |
| `GET` | `/api/meri/replay` | All vessels' recorded tracks in a window (fleet replay) |
| `GET` | `/api/meri/sea-state` | Smart-buoy sea state measurements |
| `GET` | `/api/meri/aton-faults` | Active aids-to-navigation faults |
| `GET` | `/api/meri/stream` | WebSocket stream of live vessel positions (snapshot + delta) |

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

Deployed behind a single shared Caddy instance on an Oracle Cloud host. See `deploy/docker-compose.yml` and `deploy/update.sh` — the backend publishes no ports and joins the external `web-proxy` Podman network; Caddy reverse-proxies `fintraffic.duckdns.org` to it. Images are refreshed by an `update.sh` cron job every 5 minutes rather than Watchtower, which is incompatible with rootless Podman. As modes are ported in, this one stack replaces the standalone marinetraffic/railway/tieliikenne stacks (and their per-app Redis instances and domains).
