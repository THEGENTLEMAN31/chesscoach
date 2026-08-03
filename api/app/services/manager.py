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
        self._worker: asyncio.Task | None = None
        self._autosync: asyncio.Task | None = None
        self._username = ""

    @property
    def running(self) -> bool:
        return self._running

    @property
    def run_id(self) -> int | None:
        return self._run_id

    @property
    def last(self) -> dict | None:
        return self._last

    # ------------------------------------------------ worker d'analyse de fond
    def start_worker(self, username: str) -> None:
        """Lance le worker qui draine la file 'synced' en continu (résilient aux redémarrages)."""
        self._username = username
        if self._worker is None:
            self._worker = asyncio.create_task(self._analysis_loop())
            logger.info("Worker d'analyse démarré (%s)", username)

    async def stop_worker(self) -> None:
        if self._worker:
            self._worker.cancel()

    # -------------------------------------------- sync automatique (dernières parties)
    def start_autosync(self, username: str) -> None:
        """Récupère périodiquement les dernières parties chess.com (fetch seul,
        l'analyse est déjà gérée en continu par le worker de fond)."""
        self._username = username
        if self._autosync is None:
            self._autosync = asyncio.create_task(self._autosync_loop())
            logger.info("Auto-sync démarrée (%s)", username)

    async def stop_autosync(self) -> None:
        if self._autosync:
            self._autosync.cancel()

    async def _autosync_loop(self) -> None:
        from ..config import settings

        await asyncio.sleep(settings.sync_auto_initial_delay)
        while True:
            try:
                if not self._running:
                    res = await self.start(self._username, settings.sync_months)
                    logger.info("Auto-sync déclenchée (run %s)", res.get("run_id"))
            except asyncio.CancelledError:
                raise
            except Exception as exc:  # noqa: BLE001
                logger.warning("Auto-sync : %s", exc)
            await asyncio.sleep(settings.sync_auto_interval_h * 3600)

    async def _analysis_loop(self) -> None:
        from ..config import settings

        while True:
            try:
                if not self._running:  # pas en pleine sync : on laisse la priorité
                    run_id = self._run_id
                    analyzed = await self._pipeline.analyze_new(
                        self._username, limit=settings.analysis_batch_size
                    )
                    if analyzed:
                        await self._touch_analyzed(analyzed, run_id)
            except asyncio.CancelledError:
                raise
            except Exception as exc:  # noqa: BLE001
                logger.warning("Worker d'analyse : %s", exc)
            await asyncio.sleep(settings.analysis_batch_sleep)

    async def _touch_analyzed(self, n: int, run_id: int | None = None) -> None:
        """Incrémente games_analyzed du run auquel ce lot de parties appartient
        (le run en cours au début du lot, pas forcément le tout dernier)."""
        if run_id is None:
            await self._db.execute(
                "UPDATE sync_runs SET games_analyzed = games_analyzed + ? "
                "WHERE id = (SELECT id FROM sync_runs ORDER BY id DESC LIMIT 1)",
                (n,),
            )
        else:
            await self._db.execute(
                "UPDATE sync_runs SET games_analyzed = games_analyzed + ? "
                "WHERE id=? AND username=?",
                (n, run_id, self._username),
            )
        await self._db.commit()

    async def start(self, username: str, months: int) -> dict:
        """Lance le pipeline en tâche de fond ; renvoie immédiatement le run_id."""
        if self._running:
            return {"run_id": self._run_id, "username": username, "status": "already_running"}
        # Verrou atomique : on marque _running AVANT le premier await pour éviter
        # que deux POST /api/sync concurrents ne lancent deux pipelines.
        self._running = True
        try:
            cursor = await self._db.execute(
                "INSERT INTO sync_runs (username) VALUES (?)", (username,)
            )
            await self._db.commit()
            self._run_id = cursor.lastrowid
            self._task = asyncio.create_task(self._run(username, months))
        except Exception:
            self._running = False
            raise
        return {"run_id": self._run_id, "username": username, "status": "started",
                "games_seen": 0, "games_new": 0, "games_analyzed": 0}

    async def _run(self, username: str, months: int) -> None:
        try:
            async with self._lock:
                result = await self._pipeline.sync(username, months, run_id=self._run_id)
                # L'analyse se fait par le worker de fond (draine la file 'synced').
                self._last = result
                logger.info("Sync terminée : %s", result)
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
