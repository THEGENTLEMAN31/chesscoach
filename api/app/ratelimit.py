"""Rate limiting léger, en mémoire, sans dépendance externe (pas slowapi).

Sliding window par (adresse distante, route) : un dict de buckets contient les
timestamps des requêtes récentes ; celles plus vieilles que la fenêtre sont
purifiées. Limites par route configurées en start/startup.

Assez pour stopper un abus trivial (spam register/sync) sur un VPS mono-site ;
pour du multi-node il faudrait un store partagé (Redis) — hors périmètre actuel.
"""
from __future__ import annotations

import asyncio
import logging
import time

from starlette.requests import Request
from starlette.responses import JSONResponse

logger = logging.getLogger(__name__)

# Limites : (préfixe de chemin, max_requêtes, fenêtre_secondes)
# Ordre important : on matche le préfixe le plus long.
DEFAULT_LIMITS = [
    ("/api/auth/register", 5, 300),     # 5 inscriptions / 5 min (inscription coûteuse)
    ("/api/auth/jwt/login", 10, 300),   # 10 connexions / 5 min
    ("/api/sync", 10, 300),             # 10 lancements de sync / 5 min
    ("/api/etudes", 30, 60),            # écritures exercices
]
# Limite par défaut pour le reste des routes authentifiées.
DEFAULT_TOTAL = (120, 60)


class MemorySlidingWindow:
    def __init__(self, limits: list[tuple[str, int, int]] | None = None) -> None:
        self._limits: list[tuple[str, int, int]] = limits or DEFAULT_LIMITS
        self._buckets: dict[tuple[str, str], tuple[float, int]] = {}
        self._lock = asyncio.Lock()

    def _window(self, path: str) -> tuple[int, int]:
        best: tuple[str, int, int] | None = None
        for prefix, n, sec in self._limits:
            if path.startswith(prefix) and (best is None or len(prefix) > len(best[0])):
                best = (prefix, n, sec)
        if best:
            return best[1], best[2]
        return DEFAULT_TOTAL

    async def allow(self, key: str, path: str, now: float | None = None) -> bool:
        """Consomme un ticket si sous la limite ; True si autorisé."""
        now = now or time.monotonic()
        max_n, window = self._window(path)
        bkey = (key, path.split("?")[0])
        async with self._lock:
            start, count = self._buckets.get(bkey, (now, 0))
            if now - start > window:
                start = now
                count = 0
            if count >= max_n:
                self._buckets[bkey] = (start, count)
                return False
            self._buckets[bkey] = (start, count + 1)
            return True


class RateLimitMiddleware:
    def __init__(self, app, limiter: MemorySlidingWindow) -> None:
        self.app = app
        self.limiter = limiter

    async def __call__(self, scope, receive, send) -> None:
        if scope["type"] != "http":
            await self.app(scope, receive, send)
            return
        req = Request(scope, receive)
        path = req.url.path
        if path.startswith("/api/"):
            client = req.client.host if req.client else "?"
            if not await self.limiter.allow(client, path):
                logger.warning("Rate limit dépassé : %s %s (from %s)", req.method, path, client)
                res = JSONResponse(
                    {"detail": "trop de requêtes, réessayez dans un instant"},
                    status_code=429,
                )
                await res(scope, receive, send)
                return
        await self.app(scope, receive, send)