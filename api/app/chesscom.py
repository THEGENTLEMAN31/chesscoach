"""Client de l'API publique chess.com (PubAPI, JSON-LD, cache serveur 12-24 h).

Endpoints utilisés (tous publics, sans clé) :
  /pub/player/{user}            -> profil
  /pub/player/{user}/games/archives -> liste des mois disponibles
  /pub/player/{user}/games/{YYYY}/{MM} -> parties du mois
"""
from __future__ import annotations

import httpx

BASE = "https://api.chess.com/pub"


class ChessComError(Exception):
    pass


class ChessComClient:
    def __init__(self, timeout: float = 20.0) -> None:
        self._client = httpx.AsyncClient(base_url=BASE, timeout=timeout)

    async def aclose(self) -> None:
        await self._client.aclose()

    async def get_player(self, username: str) -> dict:
        r = await self._client.get(f"/player/{username}")
        if r.status_code == 404:
            raise ChessComError(f"utilisateur inconnu: {username}")
        r.raise_for_status()
        return r.json()

    async def get_archives(self, username: str) -> list[str]:
        r = await self._client.get(f"/player/{username}/games/archives")
        r.raise_for_status()
        return r.json().get("archives", [])

    async def get_month(self, archive_url: str) -> list[dict]:
        r = await self._client.get(archive_url)
        r.raise_for_status()
        return r.json().get("games", [])
