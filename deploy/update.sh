#!/bin/bash
# Auto-update script for the fintraffic backend.
# Runs every 5 min via cron. Checks ghcr.io for a new image and redeploys.
# (Watchtower is not used — it is incompatible with rootless Podman on RHEL.)
set -euo pipefail

LOG=/home/opc/fintraffic/update.log
IMAGE=ghcr.io/saavuori/fintraffic:latest
COMPOSE_DIR=/home/opc/fintraffic

echo "[$(date -u +%Y-%m-%dT%H:%M:%SZ)] Checking for updates..." >> $LOG

podman pull $IMAGE >> $LOG 2>&1

NEW_ID=$(podman inspect $IMAGE --format '{{.Id}}')
RUNNING_ID=$(podman inspect fintraffic-backend --format '{{.Image}}' 2>/dev/null || echo '')

if [ "$RUNNING_ID" = "$NEW_ID" ]; then
  echo "[$(date -u +%Y-%m-%dT%H:%M:%SZ)] Already up to date." >> $LOG
  exit 0
fi

echo "[$(date -u +%Y-%m-%dT%H:%M:%SZ)] New image detected! Redeploying..." >> $LOG

# Full down/up — the only reliable way with rootless Podman
cd $COMPOSE_DIR
podman-compose down >> $LOG 2>&1 || true
podman-compose up -d >> $LOG 2>&1

echo "[$(date -u +%Y-%m-%dT%H:%M:%SZ)] Redeploy complete." >> $LOG
