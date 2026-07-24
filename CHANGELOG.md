# Fintraffic Changelog

All notable changes to this project will be documented in this file. Fintraffic consolidates the standalone Marinetraffic (Meri), railway (Raide) and tieliikenne (Tie) apps into one; entries up to v0.2.0 predate the consolidation and describe the marine app.

## [v0.5.0] - 2026-07-24

### Added
- **Tie mode (consolidation phase 3 — all three apps now consolidated)**: The tieliikenne road-traffic app is the third and final Fintraffic mode. The backend gained `internal/tie` — seven polled Digitraffic/Fintraffic feeds (TMS station data every 1 min with seasonal free-flow-speed baselines and road bearings refreshed 6-hourly, road works & incidents flattened from Datex2 every 2 min, variable speed-limit signs every 1 min, parking availability every 2 min, AFIR EV-charging with live per-EVSE availability every 5 min, and weather cameras enriched with nearest road-weather observations every 3 min) — mounted under `/api/tie/*` with `modes.tie.*` health reporting. The frontend gained `src/modes/tie/` — the road map with its seven toggleable layers, locate-me control and camera thumbnails — styled by the shared design system plus a scoped road-blue accent (`tie.css`). The mode switcher now offers all of Meri / Raide / Tie.

---

## [v0.4.0] - 2026-07-24

### Added
- **Raide mode (consolidation phase 2)**: The railway app is now the second Fintraffic mode. The backend gained `internal/raide` — REST polling of `rata.digitraffic.fi` (train GPS every 10 s, timetables every 60 s, the station register every 6 h), the GPS↔timetable merge with per-train delay ("delay at the last station passed"), and on-demand station departure/arrival boards — mounted under `/api/raide/*` behind the same `server.Mode` interface as meri, with cold-start visibility in `/api/health` (`modes.raide.*`). The shared core cache grew generic key/value methods (Redis `SET`/`GET` with TTL + in-memory fallback) for poll-style modes. The frontend gained `src/modes/raide/` — the railway map with liveried train categories, delay rings, station boards and the rail-track overlay — styled by the shared glass design system plus a scoped railway-green accent (`raide.css`).

### Changed
- **Theme is now shell-owned**: one dark/light toggle and one stored preference (`fintraffic-theme`, migrating the old `mapTheme` value) apply across all modes; the Vite dev proxy target is overridable via `API_PROXY`.

---

## [v0.3.0] - 2026-07-24

### Changed
- **Fintraffic consolidation, phase 1**: The repo is now **Fintraffic** — one app with Meri / Raide / Tie traffic modes (Raide and Tie land in later phases). The backend is split into a mode-agnostic `internal/core` (Redis cache with per-mode namespaces, config, generic Digitraffic client with cached singleflight proxying, router + embedded SPA) and `internal/meri` (AIS ingest, trail store, WebSocket hub, REST handlers) behind a `server.Mode` interface. Meri endpoints moved from `/api/v1/*` to `/api/meri/*` (WebSocket: `/api/meri/stream`); `/api/health` and `/api/version` are now global, with health aggregating per-mode status under `modes.meri.*`. The frontend gained a Meri/Raide/Tie mode switcher shell (`src/App.tsx`) with the vessel map now living in `src/modes/meri/` and shared pieces in `src/shared/`.

---

## [v0.2.0] - 2026-07-23

### Changed
- **Vessel trail styling**: The single-vessel track is now a **dotted line drawn in the selected vessel's category colour** (matching its marker) instead of a thin, fixed-teal line that faded to transparent — the old gradient tail was nearly invisible on the dark basemap. (MapLibre disables `line-gradient` when `line-dasharray` is set, so the fade is dropped in favour of a solid, more legible dotted line.)

### Added
- **Fleet Replay (animated history playback)**: A new "Replay" mode plays back the recorded movement of *all* vessels over a recent time window, not just one selection. A bottom transport bar provides window presets (`1h / 3h / 6h`), play/pause, a `30× / 60× / 120× / 300×` speed selector, and a scrubbable timeline with a live clock. A virtual playback clock drives the existing per-frame interpolation loop, easing every vessel between its recorded fixes; markers fade in and out at track edges and vanish across AIS coverage gaps (> 20 min) rather than drawing fabricated straight lines. Playback markers render in a single teal (the trail store has no ship-type), rotated by interpolated course. New endpoint: `GET /api/v1/replay?from&to` returns all vessels' server-decimated `[lng, lat, ts, cog]` tracks for the window (clamped to 24h, per-vessel and total point caps, `truncated` flag when the window is capped), backed by a new `(ts, mmsi)` index so the time-range scan doesn't hit the whole table.

---

## [v0.1.0] - 2026-07-23

### Added
- **Vessel Track History ("trail")**: Every location fix is now recorded to a persistent, on-disk SQLite store (`modernc.org/sqlite`, pure-Go — no CGO), downsampled to one point per minute per vessel. Selecting a vessel and toggling the track button draws where it has been as a teal polyline that fades from transparent (oldest) to solid (most recent), with `1h / 24h / 7d / 60d` window presets. History is pruned daily to a 60-day retention window (~1 GB on disk for ~700 vessels) and survives container restarts via a named volume. New endpoint: `GET /api/v1/vessel/{mmsi}/trail?from&to&maxPoints` returns server-decimated `[lng, lat, ts]` tuples. Configurable via `TRAIL_DB_PATH`, `TRAIL_RETENTION_DAYS`, `TRAIL_INTERVAL_SEC` (set `TRAIL_DB_PATH=""` to disable). Writes are batched off the MQTT ingest path so recording never stalls live streaming.

---

## [v0.0.2] - 2026-07-23

### Fixed
- **Map Not Rendering**: MapLibre sets its container element's own CSS `position` to `relative` on initialization, which broke the `position: absolute; inset: 0` sizing rule used to fill `.dashboard-container` — the map collapsed to zero height and nothing was visible. Switched `.map-container` to percentage `width`/`height`, which sizes correctly regardless of what MapLibre does to `position`.

---

## [v0.0.1] - 2026-07-23

### Added
- **Initial Release**: Live Finnish marine traffic map built on Digitraffic's open AIS data. Real-time vessel positions stream over MQTT/WSS from `wss://meri.digitraffic.fi:443/mqtt`, merged with vessel metadata and hydrated from the REST API on boot so the map is fully populated within seconds of starting.
- **Dead-Reckoning Vessel Animation**: Vessels are projected forward from their last fix using speed-over-ground and course-over-ground between AIS reports (which arrive far less often than tram GPS updates), giving smooth motion instead of jump-then-freeze.
- **Snapshot + Delta WebSocket Streaming**: Clients receive a full snapshot on connect, then only changed vessels each second (with a full resync every 60 ticks), keeping bandwidth low across ~1,000+ concurrently tracked vessels.
- **Ship-Type Categorization**: Vessels are colour-coded by AIS ship type — passenger, cargo, tanker, high-speed, tug/special, sailing/pleasure, military, and other — with a filterable legend and live per-category counts.
- **Ports & Port Calls**: Finnish ports render on the map; clicking one shows real-time arrivals and departures sourced from the Portnet port-call registry.
- **Sea State & Navigation Aid Faults**: Smart-buoy sea-state readings (wave height, trend, temperature) and aids-to-navigation fault reports render as map layers with an alerts feed in the sidebar.
- **Glassmorphic UI**: Dark/light themed glass-panel interface with collapsible sidebars, swipe gestures, vessel and port detail panels, and a follow (chase-cam) mode — following the same design system as the ratikka tram tracker.
