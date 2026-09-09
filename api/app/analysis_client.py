"""Client HTTP vers le service analyzer (moteur Stockfish).

Retry exponentiel (tenacity) sur erreurs transitoires (timeout/transport/5xx)
pour ne pas marquer une partie en `error` permanente à cause d'un redémarrage
du moteur ou d'une surcharge momentanée.
"""
from __future__ import annotations

import httpx
from tenacity import retry, retry_if_exception, stop_after_attempt, wait_exponential

from .config import settings


def _is_transient(exc: BaseException) -> bool:
    if isinstance(exc, (httpx.TimeoutException, httpx.TransportError)):
        return True
    if isinstance(exc, httpx.HTTPStatusError):
        return exc.response.status_code in (429, 500, 502, 503, 504)
    return False


class AnalyzerClient:
    def __init__(self, base_url: str | None = None, max_attempts: int = 3) -> None:
        self._base = base_url or settings.analyzer_url
        self._client = httpx.AsyncClient(base_url=self._base, timeout=600.0)
        self._max_attempts = max_attempts

    async def aclose(self) -> None:
        await self._client.aclose()

    def _retry(self) -> object:
        return retry(
            retry=retry_if_exception(_is_transient),
            stop=stop_after_attempt(self._max_attempts),
            wait=wait_exponential(multiplier=1, min=1, max=8),
            reraise=True,
        )

    async def analyze_game(
        self, game_id: int, fen_start: str, ucis: list[str], depth: int, movetime: int
    ) -> dict:
        payload = {
            "game_id": str(game_id),
            "fen_start": fen_start,
            "ucis": ucis,
            "config": {"depth": depth, "movetime": movetime, "multipv": 1},
        }

        @self._retry()
        async def _call() -> dict:
            r = await self._client.post("/games/analyze", json=payload)
            r.raise_for_status()
            return r.json()

        return await _call()

    async def analyze_position(
        self, fen: str, depth: int = 20, movetime: int = 3000, multipv: int = 1
    ) -> dict:
        payload = {"fen": fen, "config": {"depth": depth, "movetime": movetime, "multipv": multipv}}

        @self._retry()
        async def _call() -> dict:
            r = await self._client.post("/positions/analyze", json=payload)
            r.raise_for_status()
            return r.json()

        return await _call()

    async def analyze_line(self, fen: str, ucis: list[str], depth: int = 20, movetime: int = 3000) -> dict:
        payload = {"fen": fen, "ucis": ucis,
                   "config": {"depth": depth, "movetime": movetime, "multipv": 1}}

        @self._retry()
        async def _call() -> dict:
            r = await self._client.post("/lines/analyze", json=payload)
            r.raise_for_status()
            return r.json()

        return await _call()