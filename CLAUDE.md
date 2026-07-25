# CLAUDE.md

## What this is

Fintraffic — one live map for Finnish traffic with three modes, all ported from their standalone apps: **Meri** (sea, from Marinetraffic), **Raide** (rail, from railway), **Tie** (road, from tieliikenne). Go backend + React 19/Vite/MapLibre frontend, shipped as a single container with the frontend embedded via `go:embed`.

## Architecture

- One Go binary (`backend/cmd/fintraffic`). `internal/core/` is mode-agnostic: `cache` (Redis hash per mode, e.g. `fintraffic:meri:positions`, with in-memory fallback), `config`, `upstream` (Digitraffic HTTP client + TTL cache + singleflight), `server` (router, embedded SPA, global `/api/health` + `/api/version` + `/metrics`).
- Each mode is a package (`internal/meri/`, `internal/raide/`, `internal/tie/`) implementing `server.Mode` (`Name`, `Register`, `Health`) and mounting routes under `/api/<mode>/`. The global health endpoint aggregates every mode's `Health()` under `modes.<name>`. Poll-style modes cache snapshot blobs via the core cache's generic `SetValue`/`GetValue` (Redis with TTL + per-value in-memory fallback, see `raide.Store` / `tie.Store`).
- Tie specifics: seven feeds across several hosts, so it keeps its own `fetchJSON` (full URLs, explicit gzip unwrap — tie.digitraffic.fi gzips regardless of Accept-Encoding) instead of `core/upstream`. TMS speed colouring divides by the seasonal free-flow baseline (`VVAPAAS1/2` sensor constants), never a static "speed limit"; sensor ids 5122/5125 are speed, 5116/5119 volume (shortNames are ambiguous).
- Meri specifics: AIS over MQTT (`wss://meri.digitraffic.fi:443/mqtt`, topic `vessels-v2/#`), REST hydration on boot, snapshot+delta WebSocket hub (`/api/meri/stream`), SQLite trail store (`modernc.org/sqlite`, pure Go — keep CGO_ENABLED=0) with 60d retention, fleet replay, and per-vessel track replay (same recorded points as the trail, plus a bounded fleet-replay fetch so the surrounding traffic rewinds with the followed ship).
- Frontend: `src/App.tsx` is the mode-switcher shell; `src/modes/meri/` owns the vessel app; `src/shared/` holds mode-agnostic hooks/components. No router, no state library — plain hooks. New modes get `src/modes/<mode>/` and an entry in `MODES` in App.tsx.

## Adding a mode

Follow the raide/tie pattern: backend package with a `Service` implementing `server.Mode` — pollers writing typed snapshots through a `Store` over the core cache, handlers reading only from the store; frontend module under `src/modes/<mode>/` mounted from the shell with theme passed down as props, plus a scoped `<mode>.css` (`.mode-<name>` on the app root) for what the shared design system doesn't cover. Keep types duplicated backend/frontend in sync ("change one, change both").

## Conventions & gotchas

- **Digitraffic etiquette**: every upstream request must send the `Digitraffic-User` header (set centrally in `internal/core/upstream`).
- **Versioning is CI-owned**: GitHub Actions auto-tags semver from conventional commits (`fix:` patch, `feat:` minor, `feat!:` major) on push to main and injects version metadata via ldflags (`-X fintraffic/internal/core/server.Version=...`). Never hand-tag.
- **Changelog**: **every PR adds `changelog.d/<branch>.md`** — its own file, with `### Section` headings and `- **Title**: …` bullets, and **no version heading**. Never edit `CHANGELOG.md` in a PR. This is CI-enforced on PRs to main; the only exception is a PR with nothing user- or ops-facing in it, which needs the `no-changelog` label. Do not predict a version: on merge, `scripts/changelog-fold.js` resolves each pending entry to the earliest tag containing the commit that added it, folds it into `CHANGELOG.md` under that heading and deletes the file. `CHANGELOG.md` itself keeps real versioned headings (`## [vX.Y.Z] - date`) — never `[Unreleased]` — and `scripts/build-changelog.js` renders it to a GitHub Pages site. Entries were written straight into `CHANGELOG.md` until v0.13.0, which is why the history has both a v0.6.1–v0.8.0 gap and a duplicated v0.13.0 prediction: concurrent PRs each guessed the same next number. See `changelog.d/README.md`.
- **Dependencies**: self-hosted Renovate (`renovate.json5` + `.github/workflows/renovate.yml`) watches all five pinned surfaces — `backend/go.mod`, `frontend/package.json`, GitHub Actions, the Dockerfile, and `deploy/` compose images — as one grouped weekly PR, majors split out. It writes its own changelog entry via a `postUpgradeTasks` command (`scripts/changelog-entry.js`, which parses the pending diff); that text is factual only, so expand it by hand when a bump actually matters. Adding a new kind of pinned version means adding a pattern to `SOURCES` in that script. Needs a `RENOVATE_TOKEN` secret that is *not* `GITHUB_TOKEN` — see README, "Dependency updates".
- **MapLibre**: the map mounts once behind a ref guard; cleanup on unmount is load-bearing under StrictMode. `setStyle()` discards added sources — re-add them after style/theme switches.
- **Embedded frontend**: `//go:embed all:dist` lives in `internal/core/server`; the Dockerfile copies the Vite build into `internal/core/server/dist/`. A placeholder `dist/index.html` must stay tracked so dev builds compile.
- **Redis is a cache, not a store**: the app must keep working when Redis is down (in-memory fallback). The only persistent data is the meri trail SQLite DB on a named volume.
- **Deploys**: rootless Podman on an Oracle Cloud host, shared Caddy on the external `web-proxy` network terminates TLS; `deploy/update.sh` cron-pulls new images (no Watchtower).

## Commands

```bash
# backend (from backend/)
go run ./cmd/fintraffic --no-redis
go test ./...

# frontend (from frontend/)
npm run dev        # proxies /api to :8080
npm run build
npx vitest run
npm run lint
```
