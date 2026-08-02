"""Gestionnaire du pipeline sync+analyse : un seul run à la fois, état exposé.

Les parties "synced" non analysées sont reprises au run suivant — le pipeline
est idempotent et reprenable.
"""
from __future__ import annotations

import asyncio
import logging

import aiosqlite

from ..analysis_client import AnalyzerClient
from ..chesscom import ChessComClient
from ..openings import OpeningBook
from .sync import SyncPipeline

logger = logging.getLogger(__name__)


class SyncManager:
    def __init__(self, db: aiosqlite.Connection, chesscom: ChessComClient,
                 analyzer: AnalyzerClient, book: OpeningBook) -> None:
        self._db = db
        self._pipeline = SyncPipeline(db, chesscom, analyzer, book)
        self._lock = asyncio.Lock()
        self._running = False
        self._run_id: int | None = None
        self._last: dict | None = None
        self._task: asyncio.Task | None = None

    @property
    def running(self) -> bool:
        return self._running

    @property
    def run_id(self) -> int | None:
        return self._run_id

    @property
    def last(self) -> dict | None:
        return self._last

    async def start(self, username: str, months: int) -> dict:
        """Lance le pipeline en tâche de fond ; renvoie immédiatement le run_id."""
        if self._running:
            return {"run_id": self._run_id, "username": username, "status": "already_running"}
        cursor = await self._db.execute(
            "INSERT INTO sync_runs (username) VALUES (?)", (username,)
        )
        await self._db.commit()
        self._run_id = cursor.lastrowid
        self._running = True
        self._task = asyncio.create_task(self._run(username, months))
        return {"run_id": self._run_id, "username": username, "status": "started",
                "games_seen": 0, "games_new": 0, "games_analyzed": 0}

    async def _run(self, username: str, months: int) -> None:
        try:
            async with self._lock:
                result = await self._pipeline.sync(username, months, run_id=self._run_id)
                analyzed = 0
                if result["status"] == "done":
                    analyzed = await self._pipeline.analyze_new(username)
                    await self._db.execute(
                        "UPDATE sync_runs SET games_analyzed=?, status='done', finished_at=datetime('now') WHERE id=?",
                        (analyzed, result["run_id"]),
                    )
                    await self._db.commit()
                    result["games_analyzed"] = analyzed
                self._last = result
                logger.info("Pipeline terminé : %s", result)
        except Exception as exc:  # noqa: BLE001
            logger.exception("Pipeline en échec")
            await self._db.execute(
                "UPDATE sync_runs SET status='error', error=?, finished_at=datetime('now') WHERE id=?",
                (str(exc)[:500], self._run_id),
            )
            await self._db.commit()
            self._last = {"run_id": self._run_id, "username": username,
                          "status": "error", "error": str(exc)}
        finally:
            self._running = False

    async def status(self, username: str) -> dict:
        pending = await self._db.execute(
            "SELECT COUNT(*) AS n FROM games WHERE username=? AND status='synced'", (username,)
        )
        prow = await pending.fetchone()
        cur = await self._db.execute(
            "SELECT * FROM sync_runs WHERE username=? ORDER BY id DESC LIMIT 1", (username,)
        )
        last_row = await cur.fetchone()
        last = dict(last_row) if last_row else None
        return {"running": self._running, "run_id": self._run_id,
                "pending_analysis": prow["n"] if prow else 0, "last": last}
