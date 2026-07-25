# CLAUDE.md

## What this is

Fintraffic — one live map for Finnish traffic with three modes, all ported from their standalone apps: **Meri** (sea, from Marinetraffic), **Raide** (rail, from railway), **Tie** (road, from tieliikenne). Go backend + React 19/Vite/MapLibre frontend, shipped as a single container with the frontend embedded via `go:embed`.

## Architecture

- One Go binary (`backend/cmd/fintraffic`). `internal/core/` is mode-agnostic: `cache` (Redis hash per mode, e.g. `fintraffic:meri:positions`, with in-memory fallback), `config`, `upstream` (Digitraffic HTTP client + TTL cache + singleflight), `server` (router, embedded SPA, global `/api/health` + `/api/version` + `/metrics`).
- Each mode is a package (`internal/meri/`, `internal/raide/`, `internal/tie/`) implementing `server.Mode` (`Name`, `Register`, `Health`) and mounting routes under `/api/<mode>/`. The global health endpoint aggregates every mode's `Health()` under `modes.<name>`. Poll-style modes cache snapshot blobs via the core cache's generic `SetValue`/`GetValue` (Redis with TTL + per-value in-memory fallback, see `raide.Store` / `tie.Store`).
- Tie specifics: seven feeds across several hosts, so it keeps its own `fetchJSON` (full URLs, explicit gzip unwrap — tie.digitraffic.fi gzips regardless of Accept-Encoding) instead of `core/upstream`. TMS speed colouring divides by the seasonal free-flow baseline (`VVAPAAS1/2` sensor constants), never a static "speed limit"; sensor ids 5122/5125 are speed, 5116/5119 volume (shortNames are ambiguous).
- Meri specifics: AIS over MQTT (`wss://meri.digitraffic.fi:443/mqtt`, topic `vessels-v2/#`), REST hydration on boot, snapshot+delta WebSocket hub (`/api/meri/stream`), SQLite trail store (`modernc.org/sqlite`, pure Go — keep CGO_ENABLED=0) with 60d retention and fleet replay.
- Frontend: `src/App.tsx` is the mode-switcher shell; `src/modes/meri/` owns the vessel app; `src/shared/` holds mode-agnostic hooks/components. No router, no state library — plain hooks. New modes get `src/modes/<mode>/` and an entry in `MODES` in App.tsx.

## Adding a mode

Follow the raide/tie pattern: backend package with a `Service` implementing `server.Mode` — pollers writing typed snapshots through a `Store` over the core cache, handlers reading only from the store; frontend module under `src/modes/<mode>/` mounted from the shell with theme passed down as props, plus a scoped `<mode>.css` (`.mode-<name>` on the app root) for what the shared design system doesn't cover. Keep types duplicated backend/frontend in sync ("change one, change both").

## Conventions & gotchas

- **Digitraffic etiquette**: every upstream request must send the `Digitraffic-User` header (set centrally in `internal/core/upstream`).
- **CI/CD**: the whole pipeline — PR gate, version selection, image build, host pull, deploy topology — is documented with diagrams in `docs/CICD.md`. Read it before changing anything under `.github/workflows/` or `deploy/`.
- **Versioning is CI-owned**: GitHub Actions auto-tags semver from conventional commits (`fix:` patch, `feat:` minor, `feat!:` major) on push to main and injects version metadata via ldflags (`-X fintraffic/internal/core/server.Version=...`). Never hand-tag.
- **Changelog**: real versioned headings (`## [vX.Y.Z] - date`) matching the CI tag — never `[Unreleased]`. `scripts/build-changelog.js` renders it to a GitHub Pages site. **Every PR must add a changelog entry** (this is CI-enforced on PRs to main, see `ci: require compile + changelog checks`), even for chores/CI-only changes — a PR with no user- or ops-facing change at all is the only exception. Since the CI tag isn't known until after merge, predict it yourself: read the current top heading in `CHANGELOG.md`, bump it using the same conventional-commit rule CI uses (`fix:` → patch, `feat:` → minor, `feat!:`/`BREAKING CHANGE` → major, worst bump wins if the PR mixes types), and add your new heading *above* the current top one with today's date. If the predicted version turns out wrong after merge (e.g. another PR merged first and took that number), fix the heading in a follow-up rather than leaving it mismatched — don't let entries silently drift out of sync with tags like the v0.6.1–v0.8.0 gap that had to be reconstructed from git history.
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
