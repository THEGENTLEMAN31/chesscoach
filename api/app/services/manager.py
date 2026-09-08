"""Gestionnaire du pipeline sync+analyse : un run par utilisateur, état exposé.

En V2, chaque utilisateur déclenche son propre batch (POST /api/sync) et son
statut (GET /api/sync/status). Plus de worker global : l'analyse des dernières
parties se fait côté client (local-first) ; le batch serveur reste utile pour
reconstruire l'historique à l'inscription. Idempotent et reprenable.
"""
from __future__ import annotations

import asyncio
import logging

import aiosqlite

from ..analysis_client import AnalyzerClient
from ..chesscom import ChessComClient
from ..config import settings
from ..openings import OpeningBook
from .sync import SyncPipeline

logger = logging.getLogger(__name__)


class SyncManager:
    def __init__(self, db: aiosqlite.Connection, chesscom: ChessComClient,
                 analyzer: AnalyzerClient, book: OpeningBook) -> None:
        self._db = db
        self._pipeline = SyncPipeline(db, chesscom, analyzer, book)
        self._lock = asyncio.Lock()
        self._tasks: dict[str, asyncio.Task] = {}
        self._pending: set[str] = set()
        self._last: dict[str, dict] = {}

    def running(self, username: str) -> bool:
        return username in self._tasks

    def last(self, username: str) -> dict | None:
        return self._last.get(username)

    async def start(self, username: str, months: int) -> dict:
        """Lance le pipeline d'analyse d'historique en tâche de fond ; renvoie
        immédiatement le run_id. Un seul run par utilisateur à la fois."""
        if username in self._tasks or username in self._pending:
            return {"run_id": None, "username": username, "status": "already_running"}
        # Verrou atomique : on réserve AVANT le premier await pour éviter que
        # deux POST concurrents pour le même utilisateur lancent deux pipelines.
        self._pending.add(username)
        try:
            cursor = await self._db.execute(
                "INSERT INTO sync_runs (username) VALUES (?)", (username,)
            )
            await self._db.commit()
            run_id = cursor.lastrowid
        except Exception:
            self._pending.discard(username)
            raise
        task = asyncio.create_task(self._run(username, months, run_id))
        self._tasks[username] = task
        self._pending.discard(username)
        return {"run_id": run_id, "username": username, "status": "started",
                "games_seen": 0, "games_new": 0, "games_analyzed": 0}

    async def _run(self, username: str, months: int, run_id: int) -> None:
        try:
            async with self._lock:
                result = await self._pipeline.sync(username, months, run_id=run_id)
                # Analyse des parties 'synced' dans la foulée, par lots reprenables.
                analyzed = 0
                while True:
                    done = await self._pipeline.analyze_new(
                        username, limit=settings.analysis_batch_size
                    )
                    if not done:
                        break
                    analyzed += done
                if analyzed:
                    await self._db.execute(
                        "UPDATE sync_runs SET games_analyzed=? WHERE id=?",
                        (analyzed, run_id),
                    )
                    await self._db.commit()
                result["games_analyzed"] = result.get("games_analyzed", 0) + analyzed
                self._last[username] = result
                logger.info("Sync terminée pour %s : %s", username, result)
        except asyncio.CancelledError:
            raise
        except Exception as exc:  # noqa: BLE001
            logger.exception("Pipeline en échec (%s)", username)
            await self._db.execute(
                "UPDATE sync_runs SET status='error', error=?, finished_at=datetime('now') WHERE id=?",
                (str(exc)[:500], run_id),
            )
            await self._db.commit()
            self._last[username] = {"run_id": run_id, "username": username,
                                    "status": "error", "error": str(exc)}
        finally:
            self._tasks.pop(username, None)

    async def status(self, username: str) -> dict:
        pending = await self._db.execute(
            "SELECT COUNT(*) AS n FROM games WHERE username=? AND status='synced'",
            (username,),
        )
        prow = await pending.fetchone()
        cur = await self._db.execute(
            "SELECT * FROM sync_runs WHERE username=? ORDER BY id DESC LIMIT 1",
            (username,),
        )
        last_row = await cur.fetchone()
        last = dict(last_row) if last_row else None
        return {"running": self.running(username), "run_id": self._last.get(username, {}).get("run_id"),
                "pending_analysis": prow["n"] if prow else 0, "last": last}

    async def shutdown(self) -> None:
        tasks = list(self._tasks.values())
        for task in tasks:
            task.cancel()
        if tasks:
            await asyncio.gather(*tasks, return_exceptions=True)