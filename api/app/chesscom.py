"""Client de l'API publique chess.com (PubAPI, JSON-LD, cache serveur 12-24 h).

Endpoints utilisés (tous publics, sans clé) :
  /pub/player/{user}            -> profil
  /pub/player/{user}/games/archives -> liste des mois disponibles
  /pub/player/{user}/games/{YYYY}/{MM} -> parties du mois

Robustesse : retry exponentiel (tenacity) sur erreurs transitoires (429/5xx,
408, timeouts, transport) avec respect du header `Retry-After` de chess.com.
"""
from __future__ import annotations

import asyncio
import random

import httpx
from tenacity import retry, retry_if_exception, stop_after_attempt, wait_exponential

BASE = "https://api.chess.com/pub"


class ChessComError(Exception):
    pass


def _is_transient(exc: BaseException) -> bool:
    """429=ralenti ; 5xx ; 408 ; timeouts/transport."""
    if isinstance(exc, (httpx.TimeoutException, httpx.TransportError)):
        return True
    if isinstance(exc, httpx.HTTPStatusError):
        return exc.response.status_code in (429, 500, 502, 503, 504, 408)
    return False


class ChessComClient:
    def __init__(self, timeout: float = 20.0, max_attempts: int = 3) -> None:
        self._client = httpx.AsyncClient(base_url=BASE, timeout=timeout)
        self._max_attempts = max_attempts

    async def aclose(self) -> None:
        await self._client.aclose()

    @retry(
        retry=retry_if_exception(_is_transient),
        stop=stop_after_attempt(3),
        wait=wait_exponential(multiplier=1, min=1, max=8),
        reraise=True,
    )
    async def _get(self, path: str) -> httpx.Response:
        r = await self._client.get(path)
        if r.status_code in (429, 500, 502, 503, 504, 408):
            retry_after = r.headers.get("Retry-After")
            if retry_after and retry_after.isdigit():
                # Délai explicite fourni par chess.com : attendre avant de relancer.
                await asyncio.sleep(min(int(retry_after), 30))
            else:
                # Petit jitter avant le backoff tenacity.
                await asyncio.sleep(random.uniform(0, 0.4))
            r.raise_for_status()
        return r

    async def get_player(self, username: str) -> dict:
        try:
            r = await self._get(f"/player/{username}")
        except Exception:
            raise ChessComError(f"indisponible (réessais épuisés): {username}")
        if r.status_code == 404:
            raise ChessComError(f"utilisateur inconnu: {username}")
        r.raise_for_status()
        return r.json()

    async def get_archives(self, username: str) -> list[str]:
        try:
            r = await self._get(f"/player/{username}/games/archives")
        except Exception:
            raise ChessComError(f"archives indisponibles (réessais épuisés): {username}")
        r.raise_for_status()
        return r.json().get("archives", [])

    async def get_month(self, archive_url: str) -> list[dict]:
        path = archive_url if archive_url.startswith("http") else f"{BASE}{archive_url}"
        try:
            r = await self._get(path)
        except Exception:
            raise ChessComError(f"parties indisponibles (réessais épuisés): {archive_url}")
        r.raise_for_status()
        return r.json().get("games", [])