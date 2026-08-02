"""Client HTTP vers le service analyzer (moteur Stockfish)."""
from __future__ import annotations

import httpx

from .config import settings


class AnalyzerClient:
    def __init__(self, base_url: str | None = None) -> None:
        self._base = base_url or settings.analyzer_url
        self._client = httpx.AsyncClient(base_url=self._base, timeout=600.0)

    async def aclose(self) -> None:
        await self._client.aclose()

    async def analyze_game(
        self, game_id: int, fen_start: str, ucis: list[str], depth: int, movetime: int
    ) -> dict:
        payload = {
            "game_id": str(game_id),
            "fen_start": fen_start,
            "ucis": ucis,
            "config": {"depth": depth, "movetime": movetime, "multipv": 1},
        }
        r = await self._client.post("/games/analyze", json=payload)
        r.raise_for_status()
        return r.json()

    async def analyze_position(
        self, fen: str, depth: int = 20, movetime: int = 3000, multipv: int = 1
    ) -> dict:
        payload = {"fen": fen, "config": {"depth": depth, "movetime": movetime, "multipv": multipv}}
        r = await self._client.post("/positions/analyze", json=payload)
        r.raise_for_status()
        return r.json()

    async def analyze_line(self, fen: str, ucis: list[str], depth: int = 20, movetime: int = 3000) -> dict:
        payload = {"fen": fen, "ucis": ucis,
                   "config": {"depth": depth, "movetime": movetime, "multipv": 1}}
        r = await self._client.post("/lines/analyze", json=payload)
        r.raise_for_status()
        return r.json()
