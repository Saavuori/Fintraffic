# Fintraffic Changelog

All notable changes to this project will be documented in this file. Fintraffic consolidates the standalone Marinetraffic (Meri), railway (Raide) and tieliikenne (Tie) apps into one; entries up to v0.2.0 predate the consolidation and describe the marine app.

## [v0.10.9] - 2026-07-25

### Changed
- **Frontend build image moves to Node 26**: the `frontend-builder` stage only — Node never ships in the runtime image, which is Alpine plus a static Go binary, so this changes what compiles the bundle and nothing about what runs in production. It also closes the gap v0.10.8 opened, where the Node type definitions described a newer runtime than the image actually ran. One consequence to be aware of: v0.10.3 picked Node 24 specifically because it was Active LTS, and Node 26 doesn't enter LTS until 2026-10-28, so until then the release build runs on the Current line. CI's `setup-node` steps are still pinned to 24 and Dependabot doesn't manage those, so the build image and the checks that gate it are on different majors for now.

## [v0.10.8] - 2026-07-25

### Changed
- **`@types/node` 24 → 26**: two majors at once, because `@types/node` majors track Node's own — but the blast radius is one file. `tsconfig.node.json` is the only project that pulls in the Node types, it compiles exactly one file (`vite.config.ts`), and the only Node API that file touches is `process.env.API_PROXY` for the dev proxy override. Nothing in `src/` sees these types (`tsconfig.app.json` takes `vite/client` and `DOM` instead), and none of it reaches the browser bundle. Worth noting the types now describe a newer runtime than the build image runs — the frontend stage is still Node 24 — which is harmless while the typed surface is one environment variable, but the two are best kept moving together.

## [v0.10.7] - 2026-07-25

### Changed
- **Runtime base image moves to Alpine 3.24**: the first Dependabot base-image bump, and a small one — the runtime stage is the only place the Dockerfile pins an Alpine release, the backend is a static `CGO_ENABLED=0` binary that doesn't link against the base at all, and the only packages installed on top are `ca-certificates` and `tzdata`. So what a bump like this actually buys is a refreshed CA bundle and timezone database plus a security-support window that runs further out: v0.10.3 had to move off 3.21 by hand because it was approaching end of life, and taking each release as it ships is what keeps that from becoming a scramble again.

## [v0.10.6] - 2026-07-25

### Changed
- **GitHub Actions updated**: `dependabot/fetch-metadata` 2 → 3.

## [v0.10.5] - 2026-07-25

### Added
- **Dependabot watches every place the repo pins a version**: the Go module, the frontend npm tree, the GitHub Actions used by CI, the Dockerfile's build and runtime stages, and the Redis image in the deploy stack. It checks weekly on Monday mornings (Helsinki time) and opens PRs against `main`, which means the kind of drift that had to be cleared by hand in v0.10.3 — a 14-minor `go-redis` gap holding back connection-pool fixes, an end-of-lifed Node in CI, an Alpine base approaching EOL — now surfaces as it happens rather than accumulating. Minor and patch bumps are grouped into one PR per ecosystem so a routine week is a single review; majors arrive one per PR, because those are the ones that need a real look (MapLibre 5 → 6 being the recent example). Commits use the `chore(deps)` / `ci(deps)` conventional prefixes, so a merged dependency update takes a patch version like any other non-feature change. The repo's own image in the deploy compose file is left alone: it's pinned to `:latest` on purpose and `update.sh` is what pulls it.
- **The weekly dependency PR writes its own changelog entry**: Dependabot doesn't touch `CHANGELOG.md`, so a new workflow reads its update metadata and commits an entry onto the PR branch — the predicted patch heading, a `### Changed` section, and one bullet per ecosystem listing what moved and between which versions. The entry is factual by design: nothing automatic can know that a `go-redis` bump matters because of how the in-memory cache fallback behaves when Redis returns, so treat the generated text as the starting point and expand it by hand when an update earns it. Rewriting rather than appending means a Dependabot follow-up commit refreshes the entry instead of stacking a second copy. Two things worth knowing about the mechanics: the workflow runs on `pull_request` rather than `pull_request_target` — a Dependabot-triggered run gets a read-only token by default, but the `permissions` key raises it, so there's no need for the trigger that runs PR code in the base context — and pushing to a Dependabot branch makes Dependabot stop rebasing that PR, so if a sibling dependency PR merges first the predicted version can land one behind and needs correcting.

## [v0.10.4] - 2026-07-25

### Fixed
- **Release builds no longer compile the backend under emulation**: the frontend build stage was pinned to the native build platform but the Go stage was not, so the `linux/arm64` half of every multi-arch release ran `go mod download` and `go build` through QEMU — and that one step accounted for essentially the whole 8-minute release build. The Go stage now builds natively and cross-compiles via `GOARCH`, which costs nothing because `CGO_ENABLED=0` was already required by the pure-Go SQLite driver. `TARGETARCH` is declared immediately before the build rather than beside the `FROM`, since an argument joins the cache key of every instruction after it and declaring it early would have split the shared module download and source copy into a separate copy per architecture. No change to the images produced: both architectures still ship, verified down to the ELF machine type.

## [v0.10.3] - 2026-07-24

### Changed
- **Dependency sweep across backend, frontend and CI**: `go-redis` jumps 14 minor versions (9.7.1 → 9.21.0), picking up connection-pool race and leak fixes that matter precisely when Redis goes away and comes back — the failure mode the in-memory fallback is built around — plus lifetime jitter so pooled connections don't all expire at once. `prometheus/client_golang` (1.23.2 → 1.24.1) now recovers from a panicking collector instead of taking `/metrics` down with it and exposes Go 1.26 scheduler metrics; `paho.mqtt.golang` (1.5.0 → 1.5.1) fixes CVE-2025-10543 and a panic on manual ACK; `coder/websocket` (1.8.12 → 1.8.15) drops two allocations per frame read, which the Meri delta hub pays on every frame to every client. Frontend dependencies move up within their existing ranges (React 19.2.8, Vite 8.1.5, ESLint 10.8, lucide-react 1.26).
- **MapLibre GL JS 5 → 6**: the map engine's first major in over a year, bringing terrain and render-path optimisations, fewer allocations per frame, and properly typed map events. Two consequences worth knowing: WebGL 2 is now required — MapLibre 6 dropped the WebGL 1 fallback, so browsers older than roughly 2021 (notably iOS below 15) will no longer draw a map at all — and MapLibre now loads its worker as a separate module rather than inlining it, which the build has to be told about explicitly or every source on the map silently stays empty. The frontend hands MapLibre a worker URL the bundler emits, so the worker ships with the app in both `npm run dev` and the container image. Verified in a real browser across all three modes and a theme switch: WebGL 2 context, 14 layers and 7 sources rebuilt after `setStyle()`, and GeoJSON features rendering and hit-testing from the worker.
- **Build and CI images move to supported releases**: the runtime image is Alpine 3.23 instead of 3.21 (which reaches end of life this autumn), the frontend build stage uses Node 24 — Active LTS — instead of Node 22, and CI now runs Node 24 rather than the end-of-lifed Node 20. GitHub Actions are bumped to their current majors (`checkout` v7 everywhere — PR checks were still on v4 — `setup-go` v7, `setup-node` v7, the Pages actions, and the Docker build/login/buildx/qemu actions), taking every job off the deprecated Node 20 action runtime.

## [v0.10.2] - 2026-07-24

### Fixed
- **Mobile: a minimized sheet is sized to its summary row**: the peek stop was 108px — nearly twice the tab bar's height for one line of text, most of it empty. It's now declared per sheet and sized to what the row actually holds: a minimized filter sheet is exactly as tall as the tab bar it rests on, and a minimized detail sheet only as tall as its two-line title and close button need. Both numbers live in the stylesheet, which the sheet reads back, so the height and the layout that has to fit inside it can't drift apart.
- **Mobile: the summary row is no longer squeezed and clipped**: the row is a flex item in a column the peek shrinks to one row's height, so instead of filling that row it was compressed below its content — visibly cutting off the vessel badge and subtitle on a minimized detail sheet.
- **Mobile: a sheet no longer drifts out of position when the viewport height changes**: the resting offset is measured against the sheet's own height and was only recomputed on a window resize event, which the mobile URL bar collapsing doesn't reliably fire — leaving the sheet parked several pixels off and its summary row clipped by the difference. It now watches the element itself, so any height change re-seats it.

## [v0.10.1] - 2026-07-24

### Fixed
- **Mobile: sheet content no longer runs underneath the tab bar**: a bottom sheet is laid out taller than it shows and pushed down, so at the peek and half stops its body kept its full height and laid content out behind the nav — visible as a strip bleeding through the bar, and as list rows you could scroll to but never see. The sheet now trims its content area to exactly the visible slot as it moves (in lockstep with the slide, so nothing jumps), and the tab bar is opaque instead of 95% translucent, so nothing shows through it.
- **Mobile: a minimized sheet now shows its summary line**: the peek stop was 40px — the grab handle and nothing else — despite the layout reserving a row for the sheet's headline. It's now tall enough for that row, so a minimized filter sheet shows the live vessel/train count and a minimized detail sheet shows what's selected, with its close button, instead of an anonymous handle.
- **Mobile: one sheet at a time**: selecting something no longer parks a detail sheet directly on top of the filter sheet's handle (two stacked grab handles on the same bottom edge, the lower one unreachable). The filter sheet stands down while a detail sheet is up and returns when it closes.

### Changed
- **Mobile: sheets slide in, and the map controls travel with them**: sheets animate up from the bottom edge when they appear rather than popping into place, and the locate button, replay bar and map attribution ease along the sheet's own curve when it settles into a snap while still tracking it frame-for-frame during a drag. The grab handle is a taller target that thickens under the finger, the redundant collapse chevron is gone from sheet headers (the handle does that job), sheet scrolling no longer chains out to the map behind it, tab-bar presses answer with the icon rather than the browser's grey tap flash, and the middle snap sits slightly lower so it reads as half the screen with the bar included.

## [v0.10.0] - 2026-07-24

### Added
- **Mobile: search floats over the map**: with the tab bar clearing the top of the screen, Meri's vessel search (by name or MMSI) moves out of the filter sheet into a floating pill pinned to the top of the map, so it's reachable without first opening the sheet. Desktop keeps search inside the filter rail.
- **Mobile: a "Nearest" list in the sheet**: the Meri and Raide filter sheets now open with the vessels / trains closest to the centre of what you're looking at — each with a distance and live speed — so the sheet shows real content at a glance instead of just filters. The list re-ranks as you pan the map, and tapping a row selects that vessel/train. Desktop is unchanged.

### Changed
- **Mobile: mode switching moves to a bottom tab bar**: on phones the Meri / Raide / Tie switcher — previously a small pill in the top-left corner — becomes a full-width tab bar fixed to the bottom of the screen, in the thumb zone, with a per-mode glyph above each label and a 44px-tall target. The active tab takes the current mode's own accent (Meri teal, Raide green, Tie blue), so colour and position both signal the active mode. Bottom sheets now rest on top of the bar rather than under it, and the floating map controls (locate button, replay transport bar, map attribution) rebase above both the active sheet and the bar so nothing hides behind the nav. The desktop top-left pill is unchanged.
- **Mobile: category filters become chips**: Meri's ship-type and Raide's train-type filters render as horizontal wrapped chips in the sheet instead of a full-width vertical list — denser and quicker to scan and toggle with a thumb. Desktop keeps the vertical list.
- **Mobile: the filter sheet minimizes to just a grab handle**: since the tab bar already names the active mode, the filter sheet drops its redundant mode title ("Meriliikenne" …) and desktop collapse chevron on phones, and when minimized it now collapses to a thin handle instead of a shrunken panel — so the map is unobstructed. Dragging it up reveals the live count, the nearest list, and the filters. Detail sheets keep their header (the selected vessel/train name isn't redundant).
- **Mobile: the sheet remembers its last height**: tapping the handle to re-open a minimized sheet now returns it to the height you last left it at (half or full) instead of always snapping to half; dragging still settles to the nearest of the peek / half / full detents.
- **Filter sheet grouped into clear sections**: the filter contents are now organised under labelled sections — Meri's "Vessel categories" / "Map layers" / "Appearance", and matching "Map layers" / "Appearance" groups for Raide and Tie. The map theme moves out of the layer grid into its own Appearance control — an explicit Dark / Light pair (the active one highlighted) instead of a single toggle that only named the other option — and Meri's fleet Replay becomes its own full-width action. Applies on desktop and mobile.

## [v0.9.0] - 2026-07-24

### Added
- **Mobile: draggable bottom sheets**: on phones the filter and detail panels are now real drag-to-resize bottom sheets with peek / half / full snap points, a finger-tracking drag, a working grab handle, and flick-to-snap — replacing the previous collapse-only sheets. Bottom-anchored map controls (the locate button, Meri's replay transport bar, the map attribution) rebase off the active sheet's live height, so an expanded sheet no longer buries the locate button. A shared, reactive breakpoint hook (`useMediaQuery` / `useIsMobile`) drives the switch, so rotating or resizing the viewport is handled live.

### Changed
- **Mobile: a single selection surface**: the redundant floating summary pill is hidden on phones — Meri's follow / track-history controls move into the detail sheet header — the mode switcher gets larger touch targets, and Tie's floating theme toggle is dropped in favour of the one already inside its filter sheet.

### Removed
- **Horizontal panel swipe gestures**: the window-level left/right edge-swipe hook — which competed with map panning and in-panel list scrolling — is gone; the vertical sheet drag replaces it.

## [v0.8.3] - 2026-07-24

### Added
- **Meri: vessel search**: the filter panel gains a search box (by name or MMSI) over the full live fleet, independent of the active category filter, showing up to 8 matches; picking a result selects that vessel the same as clicking its marker.

### Fixed
- **Mobile: touch targets, keyboard focus, and mojibake**: panel-header icon buttons (close/collapse) grow to a 44px tap target on phones, with a smaller 34px bump for the compact vessel/train/selection card so it doesn't overflow; all interactive elements now show a visible focus ring on keyboard navigation; Meri's connection-status dot gets an accessible label instead of relying on color alone; and several remaining UTF-8 mojibake artifacts (Course/Heading `°` in Meri's vessel panel, `→`/`←`/`…` in Raide's train panel and map popups) are repaired.
- **Meri: replay "last fix" no longer misleading**: during fleet replay the detail panel's fix-age field now shows the recorded historical timestamp ("Recorded") instead of a live "Xs ago" counter, which was measuring elapsed real time against a historical position and read as a stale AIS connection rather than played-back history.
- **Consistency: mobile breakpoint detection and swipe gestures**: Meri's one-time `window.innerWidth` check is replaced with the `matchMedia` pattern already used by Raide/Tie; Tie now also has the shared edge-swipe gesture to open/close its panels, matching Meri and Raide.

## [v0.8.1] - 2026-07-24

### Fixed
- **Meri: Länsisatama is its own labelled port**: the FIHEL port pin (previously shown under Digitraffic's upstream "Helsinki (Helsingfors)" name) is now named and positioned as Länsisatama, pinned at the Länsiterminaali 2 passenger terminal (Tyynenmerenkatu 14) — the Tallink Megastar berth — instead of a generic Jätkäsaari coordinate that sat directly on top of the LT2 webcam marker. The LT1/LT2 webcam markers were moved in close beside the port pin to match.

### Docs
- **README: document the Länsisatama webcam feed**: the Port of Helsinki LT1/LT2 YouTube webcams (added to the map in v0.7.0 but never documented) are now listed in the Meri feature list and the Data Sources table.

---

## [v0.8.0] - 2026-07-24

### Added
- **Mobile bottom-sheet layout and unified map controls**: on phones (≤768px) the filter and detail panels become full-width bottom sheets with a grab handle, the locate button grows to a 44px tap target, and bottom-anchored elements clear the collapsed sheet peek. Tie's locate button is now a shared `LocateControl` (bottom-right) reused by all three modes, so Raide gains a locate button it never had. The zoom/compass control is removed from Meri, so no mode shows zoom buttons (pinch/scroll still zoom), and MapLibre attribution moves to a compact bottom-left info control, tucked above the version badge and clear of the locate control, while staying license-compliant.

---

## [v0.7.0] - 2026-07-24

### Added
- **Länsisatama LT1/LT2 webcams**: two purple camera markers at Jätkäsaari for the Port of Helsinki's Länsisatama LT1/LT2 YouTube live feeds, with a togglable "Webcams" layer and a detail panel that embeds the stream on click.

---

## [v0.6.5] - 2026-07-24

### Fixed
- **Meri: Helsinki port now shows on the map**: Digitraffic's SSN location registry returns `geometry: null` for FIHEL (Helsinki, covering Länsisatama/Jätkäsaari, Eteläsatama and Vuosaari), so it was being silently dropped from the port list. Locodes missing geometry now fall back to a static coordinate override.

---

## [v0.6.4] - 2026-07-24

### Added
- **CI: compile + changelog checks required on PRs to main**: a new pull-request workflow gates merges on three status checks — backend (`go build`/`go test`, `CGO_ENABLED=0`), frontend (lint/vitest/build), and changelog (rejects an unreleased-only heading, renders via `build-changelog.js`).

### Fixed
- **Meri: React 19 hooks lint errors in popups**, surfaced by the new lint gate (never run in CI before) — `PortPopup`/`VesselPopup` now reset state on prop change during render instead of inside the effect, and `VesselPopup` derives fix age from a ticking clock state instead of calling `Date.now()` during render.

---

## [v0.6.3] - 2026-07-24

### Fixed
- **Tie: filter-panel road icon, remaining mojibake**: the filter panel's Activity (EKG) glyph read as a lightning bolt at 16px; swapped to `CarFront` to match the `Ship`/`TrainFront` icons used by Meri/Raide. Also repaired double-encoded UTF-8 punctuation (middle dot, en/em dash, `>=`) left over across Tie, Raide, and Meri components and comments.

---

## [v0.6.2] - 2026-07-24

### Fixed
- **Deploy: auto-update is now installed by `install.sh`**: the installer writes `update.sh` into the app dir and registers its `*/5` cron idempotently — previously the update script shipped in the repo but nothing installed it, so a fresh install never auto-updated. `update.sh` no longer hardcodes `/home/opc/fintraffic`: it derives the compose dir from its own location and auto-detects the container engine, and the image is overridable via `IMAGE`.
- **Deploy/docs: the production domain is `liikenne.duckdns.org`** — the install script's default check domain, the README live badge and deploy notes, and the changelog site's back-link all pointed at `fintraffic.duckdns.org`, which was never registered (it made the installer's post-deploy verification fail even when the stack was healthy). The domain can also be passed as the first argument: `./install.sh traffic.example.org`.

### Changed
- **CI: fix Node.js 20 deprecation warning on GitHub Actions runners**: `actions/checkout` bumped to v7 (native Node 24) and the unmaintained tag-action (no release since Aug 2024, still Node 20) swapped for `paulhatch/semantic-version@v6.0.3` (Node 24), which computes the same conventional-commits bump (`feat!`/`BREAKING CHANGE` → major, `feat:` → minor, else patch).

---

## [v0.6.1] - 2026-07-24

### Fixed
- **Repaired mojibake in Tie source comments**: UTF-8 text (em/en dashes, Finnish umlauts) had been re-encoded through Windows-1252 at some point. Also aligned the Raide and Tie side-panel titles with Meri's naming convention.

### Changed
- **Docs**: README no longer carries the pre-consolidation origin story (dropped the source-app status table and standalone-stack comparisons); detailed endpoint documentation moved to `docs/API.md`, expanded with query parameters, response shapes (health, trail, replay, WS stream) and caching/poll cadences. Added a per-mode Data Sources table listing each mode's upstream feeds — hosts, endpoints, poll cadences and what each drives. Production deploy instructions now show the actual `deploy/install.sh` commands, with the custom DNS name as an argument and `APP_DIR`/`IMAGE` overrides documented.

---

## [v0.6.0] - 2026-07-24

### Added
- **Fleet replay: category colours + vessel selection** (synced from Marinetraffic): replay markers now use the live category icon per MMSI — colours match the live map, with a teal fallback for vessels that have left AIS coverage; metadata comes from the *unfiltered* live fleet so category filters don't strip replay colours. Replay vessels are clickable, opening the same vessel card and detail popup as live selection, with a selection ring that follows the marker through playback and name labels at the live zoom threshold. The vessel card hides its Follow and Track controls during replay, since both act on live-only layers hidden while playback runs.

### Fixed
- **Deploy: install/update script + SELinux trail volume** (synced from Marinetraffic): new idempotent `deploy/install.sh` writes the compose, ensures the `web-proxy` network + trail volume, pulls the image, recreates the stack and verifies trail recording came up; the trail volume now mounts with `:Z` (SELinux relabel) — without it the SQLite DB can't be created and recording is silently disabled. `update.sh` remains the image-only 5-min cron.

---

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
