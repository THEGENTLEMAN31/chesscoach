#!/usr/bin/env bash
# Backup SQLite ChessCoach (base prod montée dans le conteneur api).
# Usage : scripts/backup-db.sh [répertoire cible]
set -euo pipefail

TARGET="${1:-/home/gentleman31/chesscoach/data/backups}"
STAMP="$(date +%Y%m%d_%H%M%S)"
mkdir -p "$TARGET"

docker exec chesscoach-api python3 -c "
import sqlite3, os
src='/app/data/chesscoach.db'; dst='/tmp/cc-backup.db'
con=sqlite3.connect(src)
bak=sqlite3.connect(dst)
con.backup(bak)
bak.close(); con.close()
os.chmod(dst, 0o644)
" || { echo "backup FAILED" >&2; exit 1; }

docker cp "chesscoach-api:/tmp/cc-backup.db" "$TARGET/chesscoach-$STAMP.db"
docker exec chesscoach-api rm -f /tmp/cc-backup.db

# rétention : garder les 14 derniers
ls -1t "$TARGET"/chesscoach-*.db 2>/dev/null | tail -n +15 | xargs -r rm -f

echo "Backup OK: $TARGET/chesscoach-$STAMP.db"
du -h "$TARGET/chesscoach-$STAMP.db" | awk '{print $1}'