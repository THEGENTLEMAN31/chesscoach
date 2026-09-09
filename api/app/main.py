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
from .openings import OpeningBook
from .services.manager import SyncManager
from .users import ensure_seed_user, init_user_engine

logging.basicConfig(level=logging.INFO)
logger = logging.getLogger(__name__)


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
    logger.info("API prête (book=%s positions)", len(app.state.book._by_epd))

    yield
    await app.state.manager.shutdown()
    await app.state.analyzer.aclose()
    await app.state.chesscom.aclose()
    await app.state.db.close()


app = FastAPI(title="ChessCoach API", version="0.2.0", lifespan=lifespan)

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