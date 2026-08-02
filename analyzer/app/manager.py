"""Orchestration de l'accès au moteur : file prioritaire, cache, sérialisation.

Le moteur est un processus unique (Threads=2) : toutes les requêtes passent
par une file asyncio prioritaire. P0 = interactif, P1 = batch nocturne.
Les positions en cache court-circuitent la file.
"""
from __future__ import annotations

import asyncio
import logging

from .cache import PositionCache
from .engine import StockfishEngine
from .schemas import PositionConfig, PositionResult

logger = logging.getLogger(__name__)

P0_INTERACTIVE = 0
P1_BATCH = 1


class EngineManager:
    def __init__(self, engine: StockfishEngine, cache: PositionCache) -> None:
        self._engine = engine
        self._cache = cache
        self._queue: asyncio.PriorityQueue = asyncio.PriorityQueue()
        self._seq = 0
        self._worker: asyncio.Task | None = None

    async def start(self) -> None:
        await asyncio.to_thread(self._engine.start)
        self._worker = asyncio.create_task(self._consume(), name="engine-consumer")

    async def shutdown(self) -> None:
        if self._worker:
            self._worker.cancel()
        await asyncio.to_thread(self._engine.stop)

    async def analyze(self, fen: str, config: PositionConfig, priority: int = P1_BATCH) -> PositionResult:
        cached = await asyncio.to_thread(self._cache.get, fen, config.depth)
        if cached is not None:
            return cached
        loop = asyncio.get_running_loop()
        fut: asyncio.Future = loop.create_future()
        item = (priority, self._seq, fen, config, fut)
        self._seq += 1
        await self._queue.put(item)
        return await fut

    async def _consume(self) -> None:
        while True:
            _, _, fen, config, fut = await self._queue.get()
            try:
                result = await asyncio.to_thread(
                    self._engine.analyze, fen, config.depth, config.movetime, config.multipv
                )
                await asyncio.to_thread(self._cache.put, fen, config.depth, result)
                fut.set_result(result)
            except asyncio.CancelledError:
                fut.set_exception(RuntimeError("moteur arrêté"))
                raise
            except Exception as exc:  # noqa: BLE001
                logger.exception("Échec analyse %s", fen)
                fut.set_exception(exc)
