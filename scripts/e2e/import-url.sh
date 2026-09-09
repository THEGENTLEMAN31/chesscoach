#!/usr/bin/env bash
# Test d'un véritable import URL chess.com (flow local-first P1) en production.
#
# Vérifie que la PubAPI renvoie bien le PGN d'une partie donnée (ce que le
# navigateur importe puis envoie à /api/sync/accept). Ne modifie rien.
#
# Usage: scripts/e2e/import-url.sh https://www.chess.com/game/live/123456789
set -euo pipefail

URL="${1:-}"
UA="ChessCoach/2.0 (e2e; contact: admin@chesscoach.io)"

if [ -z "$URL" ]; then
  echo "Usage: $0 <chess.com game URL>" >&2
  exit 2
fi

# Formats acceptés :
#   https://www.chess.com/game/live/{id}
#   https://www.chess.com/game/{user}/{id}
USER=""
GAMEID=""
if [[ "$URL" =~ /game/live/([0-9]+) ]]; then
  GAMEID="${BASH_REMATCH[1]}"
elif [[ "$URL" =~ /game/([^/]+)/([0-9]+) ]]; then
  USER="${BASH_REMATCH[1]}"
  GAMEID="${BASH_REMATCH[2]}"
elif [[ "$URL" =~ ([0-9]+) ]]; then
  GAMEID="${BASH_REMATCH[1]}"
else
  echo "Impossible d'extraire un ID de partie de: $URL" >&2
  exit 2
fi

echo "== Import URL chess.com =="
echo "   URL   : $URL"
echo "   user  : ${USER:-?}  id : $GAMEID"

for cand in "https://api.chess.com/pub/game/$GAMEID" "https://api.chess.com/pub/game/$USER/$GAMEID"; do
  TMP="$(mktemp)"
  if curl -fsS -A "$UA" "$cand" -o "$TMP" 2>/dev/null; then
    if grep -q '"pgn"' "$TMP"; then
      pgn_len=$(python3 -c 'import json,sys;print(len(json.load(open(sys.argv[1]))["pgn"]))' "$TMP" 2>/dev/null || echo "?")
      echo "OK  PubAPI a renvoyé un PGN ($cand, longueur $pgn_len octets)."
      rm -f "$TMP"
      exit 0
    fi
  fi
  rm -f "$TMP"
done

echo "FAIL aucune source PubAPI n'a renvoyé de PGN pour cette partie." >&2
exit 1
