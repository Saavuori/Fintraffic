#!/usr/bin/env bash
#
# install / update the fintraffic stack.
#
# Idempotent: run it for a first install or to apply an update. It writes
# docker-compose.yml, ensures the shared proxy network and the trail-history
# volume exist, pulls the latest image, recreates the containers, and then
# verifies that trail recording actually came up (the failure mode that made
# trail + replay show nothing was a compose missing the /data volume, which
# silently disabled recording).
#
# TLS is expected to be terminated by an external reverse proxy (e.g. Caddy)
# attached to the shared external `web-proxy` network — this stack only exposes
# the backend on that network, not on a host port.
#
# Usage:
#   ./install.sh
#   APP_DIR=/srv/fintraffic DOMAIN=example.org ./install.sh
#
set -euo pipefail

# --- config (override via env) ---------------------------------------------
APP_DIR="${APP_DIR:-$HOME/fintraffic}"
DOMAIN="${DOMAIN:-fintraffic.duckdns.org}"   # used for the post-deploy checks
IMAGE="${IMAGE:-ghcr.io/saavuori/fintraffic:latest}"

# --- pick a container engine + compose command ------------------------------
if command -v podman-compose >/dev/null 2>&1; then
  ENGINE="podman"; COMPOSE="podman-compose"
elif command -v podman >/dev/null 2>&1 && podman compose version >/dev/null 2>&1; then
  ENGINE="podman"; COMPOSE="podman compose"
elif command -v docker >/dev/null 2>&1 && docker compose version >/dev/null 2>&1; then
  ENGINE="docker"; COMPOSE="docker compose"
elif command -v docker-compose >/dev/null 2>&1; then
  ENGINE="docker"; COMPOSE="docker-compose"
else
  echo "ERROR: need podman-compose, 'podman compose', or Docker Compose installed." >&2
  exit 1
fi
echo "engine=$ENGINE  compose='$COMPOSE'  app_dir=$APP_DIR"

# --- write the compose file (backing up any existing one) -------------------
mkdir -p "$APP_DIR"
cd "$APP_DIR"
if [ -f docker-compose.yml ]; then
  backup="docker-compose.yml.bak-$(date +%s)"
  cp docker-compose.yml "$backup"
  echo "backed up existing compose -> $APP_DIR/$backup"
fi

cat > docker-compose.yml <<'YAML'
# Managed by install.sh — edit there, not here.
services:
  fintraffic-backend:
    image: ghcr.io/saavuori/fintraffic:latest
    container_name: fintraffic-backend
    restart: unless-stopped
    environment:
      - REDIS_URL=redis://fintraffic-cache:6379
      - PORT=8080
      # Vessel trail history (SQLite). 60-day retention, 1 point/min/vessel.
      - TRAIL_DB_PATH=/data/trail.db
      - TRAIL_RETENTION_DAYS=60
      - TRAIL_INTERVAL_SEC=60
    volumes:
      # Persist trail history across container recreation. `:Z` relabels the
      # volume for SELinux (Oracle Linux enforces it). Without this mount the
      # SQLite DB can't be created and recording is silently disabled.
      - fintraffic-trail:/data:Z
    networks:
      - default
      - web-proxy
    depends_on:
      - fintraffic-cache
  fintraffic-cache:
    image: docker.io/library/redis:8-alpine
    container_name: fintraffic-cache
    restart: unless-stopped
    command: redis-server --appendonly no --maxmemory 64mb --maxmemory-policy allkeys-lru
    networks:
      - default
volumes:
  # Named volume for the SQLite trail history DB (survives container recreation).
  # Migrating from the standalone marinetraffic stack: copy the old
  # marinetraffic-trail volume's trail.db in here before first start to keep
  # the recorded history.
  fintraffic-trail:
networks:
  default:
  web-proxy:
    external: true
YAML
echo "wrote $APP_DIR/docker-compose.yml"

# --- ensure the shared external proxy network exists ------------------------
if ! $ENGINE network exists web-proxy >/dev/null 2>&1; then
  echo "creating shared 'web-proxy' network..."
  $ENGINE network create web-proxy
fi

# --- pull + recreate --------------------------------------------------------
echo "pulling $IMAGE ..."
$ENGINE pull "$IMAGE" || echo "(pull failed or offline; using local image)"

echo "recreating stack..."
# down first so the new env + volume are guaranteed to apply; the external
# web-proxy network is not removed by down.
$COMPOSE down --remove-orphans >/dev/null 2>&1 || true
$COMPOSE up -d

# --- verify recording -------------------------------------------------------
echo "verifying trail recording (first point is written within ~60s)..."
ok=0
for i in $(seq 1 12); do
  sleep 10
  health="$(curl -fsS "https://$DOMAIN/api/health" 2>/dev/null || true)"
  case "$health" in
    *'"trail_enabled":true'*) ok=1; break ;;
  esac
  replay="$(curl -fsS "https://$DOMAIN/api/meri/replay" 2>/dev/null || true)"
  case "$replay" in
    *'"vessels":{"'*) ok=1; break ;;                          # any vessel recorded
  esac
  echo "  ...not populated yet (check $i/12)"
done

echo
echo "=== /api/health ==="
curl -fsS "https://$DOMAIN/api/health" 2>/dev/null || echo "(health unreachable from here)"
echo
if [ "$ok" = "1" ]; then
  echo "OK: trail recording is up."
  echo "   A vessel's trail line needs >=2 points, so it appears after ~2 min;"
  echo "   the replay window fills as history accumulates."
else
  echo "NOT CONFIRMED. Inspect the backend logs:"
  echo "   $ENGINE logs fintraffic-backend 2>&1 | grep -iE 'trail|flush'"
  echo "   (a 'trail store open failed' line means the volume still isn't writable)"
fi
