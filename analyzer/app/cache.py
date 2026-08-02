"""Cache des positions analysées (SQLite, un seul écrivain, WAL).

Clé = FEN normalisée (placement + trait + roques + ep) + niveau de profondeur
demandé. On ne dégrade jamais une entrée existante avec une profondeur
inférieure (UPSERT sans downgrade).
"""
from __future__ import annotations

import json
import sqlite3
import threading
from pathlib import Path

from .schemas import Line, PositionResult, Score


def normalize_fen(fen: str) -> str:
    return " ".join(fen.split()[:4])


class PositionCache:
    def __init__(self, path: Path) -> None:
        path.parent.mkdir(parents=True, exist_ok=True)
        self._conn = sqlite3.connect(str(path), timeout=10, check_same_thread=False)
        self._conn.execute("PRAGMA journal_mode=WAL")
        self._conn.execute("PRAGMA busy_timeout=5000")
        self._conn.execute(
            """CREATE TABLE IF NOT EXISTS position_cache (
                fen_key TEXT PRIMARY KEY,
                depth_req INTEGER NOT NULL,
                depth_achieved INTEGER NOT NULL,
                result TEXT NOT NULL,
                cached_at REAL NOT NULL
            )"""
        )
        self._conn.commit()
        self._lock = threading.Lock()

    def get(self, fen: str, depth_req: int) -> PositionResult | None:
        key = normalize_fen(fen)
        with self._lock:
            row = self._conn.execute(
                "SELECT result FROM position_cache WHERE fen_key=? AND depth_req>=?",
                (key, depth_req),
            ).fetchone()
        if not row:
            return None
        try:
            return PositionResult.model_validate_json(row[0])
        except Exception:
            return None

    def put(self, fen: str, depth_req: int, result: PositionResult) -> None:
        key = normalize_fen(fen)
        best_depth = max((l.depth for l in result.lines), default=0)
        with self._lock:
            existing = self._conn.execute(
                "SELECT depth_req FROM position_cache WHERE fen_key=?", (key,)
            ).fetchone()
            if existing and existing[0] >= depth_req:
                return  # ne pas dégrader
            self._conn.execute(
                """INSERT INTO position_cache (fen_key, depth_req, depth_achieved, result, cached_at)
                   VALUES (?, ?, ?, ?, ?)
                   ON CONFLICT(fen_key) DO UPDATE SET
                       depth_req=excluded.depth_req,
                       depth_achieved=excluded.depth_achieved,
                       result=excluded.result,
                       cached_at=excluded.cached_at""",
                (key, depth_req, best_depth, result.model_dump_json(), time_now()),
            )
            self._conn.commit()

    def close(self) -> None:
        with self._lock:
            self._conn.close()


def time_now() -> float:
    import time

    return time.time()
