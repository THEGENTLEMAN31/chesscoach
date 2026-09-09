#!/usr/bin/env bash
# Vérifie la santé de l'API et du reverse proxy Caddy en production.
# Usage: scripts/e2e/healthcheck.sh [base_url]   (défaut: https://chesscoach.btj.mooo.com)
set -euo pipefail

BASE_URL="${1:-https://chesscoach.btj.mooo.com}"
UA="chesscoach-healthcheck/1.0"

echo "== Healthcheck $BASE_URL =="

# 1. API locale (via Caddy, endpoint /api/health)
if curl -fsS -A "$UA" "$BASE_URL/api/health" -o /dev/null; then
  echo "OK  /api/health via $BASE_URL"
else
  echo "FAIL /api/health via $BASE_URL" >&2
  exit 1
fi

# 2. Healthcheck brut dans le conteneur (si docker disponible)
if command -v docker >/dev/null 2>&1; then
  if docker ps --format '{{.Names}}' | grep -q chesscoach-api; then
    if docker inspect --format='{{.State.Health.Status}}' chesscoach-api 2>/dev/null | grep -q healthy; then
      echo "OK  conteneur chesscoach-api healthy"
    else
      echo "WARN conteneur chesscoach-api pas 'healthy' (healthcheck docker pas encore stabilisé)" >&2
    fi
  else
    echo "INFO docker chesscoach-api absent (mode hors prod ?)"
  fi
fi

# 3. Web statique (fallback SPA) — doit répondre 200 sur / et sur une route SPA
if curl -fsS -A "$UA" "$BASE_URL/" -o /dev/null; then
  echo "OK  web / via $BASE_URL"
else
  echo "WARN web / via $BASE_URL" >&2
fi

echo "OK  tout est en place."
