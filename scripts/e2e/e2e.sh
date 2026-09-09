#!/usr/bin/env bash
# E2E API en production : auth + endpoints scopés + import d'une vraie partie URL chess.com.
#
# Prérequis : un compte et son mot de passe. Par défaut utilise l'admin de prod
# si SEED_ADMIN_PASSWORD est fournie dans l'env.
#
# Usage:
#   EMAIL=admin@chesscoach.io PASSWORD=... \
#     BASE_URL=https://chesscoach.btj.mooo.com scripts/e2e/e2e.sh
set -euo pipefail

BASE_URL="${BASE_URL:-https://chesscoach.btj.mooo.com}"
EMAIL="${EMAIL:-admin@chesscoach.io}"
PASSWORD="${PASSWORD:-${SEED_ADMIN_PASSWORD:-}}"
COOKIE_JAR="$(mktemp)"
UA="chesscoach-e2e/1.0"
TMP="$(mktemp -d)"

if [ -z "$PASSWORD" ]; then
  echo "PASSWORD non fourni (ou SEED_ADMIN_PASSWORD). Abandon." >&2
  exit 2
fi

fail() { echo "FAIL $*" >&2; rm -f "$COOKIE_JAR"; rm -rf "$TMP"; exit 1; }
ok() { echo "OK  $*"; }

login() {
  curl -fsS -A "$UA" -c "$COOKIE_JAR" -X POST "$BASE_URL/api/auth/jwt/login" \
    --data-urlencode "username=$EMAIL" --data-urlencode "password=$PASSWORD" -o /dev/null
}

# --- 1. health
curl -fsS -A "$UA" "$BASE_URL/api/health" -o /dev/null && ok "health /api/health" || fail "health"

# --- 2. login (cookie httpOnly)
login && ok "login (cookie httpOnly)" || fail "login"
curl -fsS -A "$UA" -b "$COOKIE_JAR" "$BASE_URL/api/auth/users/me" -o "$TMP/me.json"
grep -q '"id"' "$TMP/me.json" && ok "me (session active)" || fail "me"

# --- 3. stats scopés (pas de 401, JSON exploitable)
curl -fsS -A "$UA" -b "$COOKIE_JAR" "$BASE_URL/api/stats" -o "$TMP/stats.json" \
  && ok "stats" || fail "stats"

# --- 4. profil all
curl -fsS -A "$UA" -b "$COOKIE_JAR" "$BASE_URL/api/profile/all" -o "$TMP/profile.json" \
  && ok "profile/all" || fail "profile/all"

# --- 5. objectifs Elo (get + put)
curl -fsS -A "$UA" -b "$COOKIE_JAR" "$BASE_URL/api/profile/objectives" -o "$TMP/obj.json" \
  && ok "objectives GET" || fail "objectives GET"
curl -fsS -A "$UA" -b "$COOKIE_JAR" -X PUT "$BASE_URL/api/profile/objectives" \
  -H 'Content-Type: application/json' -d '{"rapid":2000,"blitz":1800}' -o /dev/null \
  && ok "objectives PUT" || fail "objectives PUT"

# --- 6. sync status
curl -fsS -A "$UA" -b "$COOKIE_JAR" "$BASE_URL/api/sync/status" -o "$TMP/sync.json" \
  && ok "sync/status" || fail "sync/status"

echo
ok "E2E API complété (étapes 1-6). L'import URL chess.com réel nécessite un ID de partie —"
ok "lancé séparément par scripts/e2e/import-url.sh (voir README)."

rm -f "$COOKIE_JAR"
rm -rf "$TMP"
