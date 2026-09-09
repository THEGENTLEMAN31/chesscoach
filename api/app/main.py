"""API ChessCoach V2 — FastAPI.

Multi-utilisateur : l'identité est le pseudo chess.com de la session
(fastapi-users, cookie httpOnly JWT). Tous les endpoints de données sont
scopés par l'utilisateur connecté. Le coach LLM est supprimé (agent dormant).
"""
from __future__ import annotations

import asyncio
import logging
from contextlib import asynccontextmanager

from pathlib import Path

from fastapi import FastAPI

from .analysis_client import AnalyzerClient
from .chesscom import ChessComClient
from .config import settings
from .db import init_db
from .logging_setup import RequestIdMiddleware, setup_logging
from .openings import OpeningBook
from .ratelimit import MemorySlidingWindow, RateLimitMiddleware
from .services.manager import SyncManager
from .users import ensure_seed_user, init_user_engine

setup_logging(logging.INFO)
logger = logging.getLogger(__name__)

# Garde-fou sécurité : si le secret JWT n'est pas surchargé ET l'inscription
# publique est ouverte, on refuse de démarrer (secret par défaut = compromission).
if settings.jwt_secret == "dev-secret-change-me" and settings.allow_registration:
    raise SystemExit(
        "Refus de démarrer : JWT_SECRET par défaut avec l'inscription ouverte. "
        "Surchargez JWT_SECRET (et SEED_ADMIN_PASSWORD) via l'environnement."
    )


async def _autosync_loop(app: FastAPI) -> None:
    """Récupère périodiquement les dernières parties de tous les comptes connus.

    Attend `sync_auto_initial_delay` s, puis boucle toutes les
    `sync_auto_interval_h` heures. Ne force jamais : si un pipeline est déjà
    en cours pour un utilisateur, il est ignoré (idempotent).
    """
    manager: SyncManager = app.state.manager
    db = app.state.db
    await asyncio.sleep(settings.sync_auto_initial_delay)
    while True:
        try:
            cur = await db.execute(
                "SELECT DISTINCT username FROM games WHERE username IS NOT NULL"
            )
            users = [r["username"] for r in await cur.fetchall()]
            for username in users:
                try:
                    await manager.start(username, settings.sync_months)
                except Exception as exc:  # noqa: BLE001 — un compte ne bloque pas les autres
                    logger.warning("Auto-sync échoué pour %s : %s", username, exc)
        except asyncio.CancelledError:
            return
        except Exception as exc:  # noqa: BLE001
            logger.warning("Boucle auto-sync : erreur : %s", exc)
        await asyncio.sleep(settings.sync_auto_interval_h * 3600)


@asynccontextmanager
async def lifespan(app: FastAPI):
    app.state.db = await init_db(Path(settings.db_path))
    app.state.chesscom = ChessComClient()
    app.state.analyzer = AnalyzerClient()
    app.state.book = OpeningBook()
    await asyncio.to_thread(app.state.book.load)
    app.state.manager = SyncManager(
        app.state.db, app.state.chesscom, app.state.analyzer, app.state.book
    )
    # Auth : table `users` (SQLAlchemy) + seed admin sur la data historique.
    await init_user_engine()
    await ensure_seed_user(app.state.db)
    autosync = asyncio.create_task(_autosync_loop(app))
    logger.info("API prête (book=%s positions)", len(app.state.book._by_epd))

    yield
    autosync.cancel()
    await app.state.manager.shutdown()
    await app.state.analyzer.aclose()
    await app.state.chesscom.aclose()
    await app.state.db.close()


app = FastAPI(title="ChessCoach API", version="0.2.0", lifespan=lifespan)
app.add_middleware(RequestIdMiddleware)
app.add_middleware(RateLimitMiddleware, limiter=MemorySlidingWindow())

from .routers import auth, games, stats, sync, training  # noqa: E402

app.include_router(auth.router)
app.include_router(sync.router)
app.include_router(games.router)
app.include_router(stats.router)
app.include_router(training.router)


@app.get("/health")
async def health() -> dict:
    row = await (await app.state.db.execute("SELECT 1")).fetchone()
    return {"ok": row is not None}


@app.get("/api/health")
async def api_health() -> dict:
    row = await (await app.state.db.execute("SELECT 1")).fetchone()
    return {"ok": row is not None, "service": "api"}


if __name__ == "__main__":
    import uvicorn

    uvicorn.run("app.main:app", host="0.0.0.0", port=8001)