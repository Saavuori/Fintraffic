#!/usr/bin/env bash
# Auto-update script for the fintraffic stack. install.sh copies this into the
# app dir and registers a cron entry that runs it every 5 minutes. It checks
# ghcr.io for a new image and redeploys when one appears.
# (Watchtower is not used — it is incompatible with rootless Podman on RHEL.)
set -euo pipefail

COMPOSE_DIR="$(cd "$(dirname "$0")" && pwd)"
LOG="$COMPOSE_DIR/update.log"
IMAGE="${IMAGE:-ghcr.io/saavuori/fintraffic:latest}"

if command -v podman-compose >/dev/null 2>&1; then
  ENGINE="podman"; COMPOSE="podman-compose"
elif command -v podman >/dev/null 2>&1 && podman compose version >/dev/null 2>&1; then
  ENGINE="podman"; COMPOSE="podman compose"
elif command -v docker >/dev/null 2>&1 && docker compose version >/dev/null 2>&1; then
  ENGINE="docker"; COMPOSE="docker compose"
else
  ENGINE="docker"; COMPOSE="docker-compose"
fi

echo "[$(date -u +%Y-%m-%dT%H:%M:%SZ)] Checking for updates..." >> "$LOG"

$ENGINE pull "$IMAGE" >> "$LOG" 2>&1

NEW_ID=$($ENGINE inspect "$IMAGE" --format '{{.Id}}')
RUNNING_ID=$($ENGINE inspect fintraffic-backend --format '{{.Image}}' 2>/dev/null || echo '')

if [ "$RUNNING_ID" = "$NEW_ID" ]; then
  echo "[$(date -u +%Y-%m-%dT%H:%M:%SZ)] Already up to date." >> "$LOG"
  exit 0
fi

echo "[$(date -u +%Y-%m-%dT%H:%M:%SZ)] New image detected! Redeploying..." >> "$LOG"

# Full down/up — the only reliable way with rootless Podman
cd "$COMPOSE_DIR"
$COMPOSE down >> "$LOG" 2>&1 || true
$COMPOSE up -d >> "$LOG" 2>&1

echo "[$(date -u +%Y-%m-%dT%H:%M:%SZ)] Redeploy complete." >> "$LOG"
