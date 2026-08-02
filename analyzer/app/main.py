"""Service Analyzer : juge technique (Stockfish). Ne connaît ni le LLM ni le profil."""
from __future__ import annotations

import logging
from contextlib import asynccontextmanager
from pathlib import Path

import chess
from fastapi import FastAPI
from fastapi.responses import JSONResponse

from .cache import PositionCache
from .engine import EngineConfig, StockfishEngine
from .manager import EngineManager, P0_INTERACTIVE, P1_BATCH
from .schemas import (GameRequest, GameResult, LineRequest, PositionConfig,
                      PositionRequest, PositionResult)

logging.basicConfig(level=logging.INFO)
logger = logging.getLogger("analyzer")

CACHE_PATH = Path("/app/cache/positions.db")


@asynccontextmanager
async def lifespan(app: FastAPI):
    engine = StockfishEngine(EngineConfig())
    cache = PositionCache(CACHE_PATH)
    manager = EngineManager(engine, cache)
    await manager.start()
    app.state.manager = manager
    app.state.cache = cache
    yield
    await manager.shutdown()
    cache.close()


app = FastAPI(title="ChessCoach Analyzer", lifespan=lifespan)


@app.get("/health")
async def health():
    return {"status": "ok", "engine": "stockfish"}


@app.post("/positions/analyze", response_model=PositionResult)
async def analyze_position(req: PositionRequest):
    return await app.state.manager.analyze(req.fen, req.config, P0_INTERACTIVE)


@app.post("/lines/analyze", response_model=PositionResult)
async def analyze_line(req: LineRequest):
    board = chess.Board(req.fen)
    for uci in req.ucis:
        try:
            board.push_uci(uci)
        except ValueError:
            return JSONResponse(status_code=400, content={"detail": f"coup illégal: {uci}"})
    return await app.state.manager.analyze(board.fen(), req.config, P0_INTERACTIVE)


@app.post("/games/analyze", response_model=GameResult)
async def analyze_game(req: GameRequest):
    """Analyse toutes les positions d'une partie (batch P1, ~1-2 s/coup)."""
    board = chess.Board(req.fen_start)
    results: list[PositionResult] = []
    results.append(await app.state.manager.analyze(board.fen(), req.config, P1_BATCH))
    for uci in req.ucis:
        try:
            board.push_uci(uci)
        except ValueError:
            return JSONResponse(status_code=400, content={"detail": f"coup illégal: {uci}"})
        results.append(await app.state.manager.analyze(board.fen(), req.config, P1_BATCH))
    return GameResult(game_id=req.game_id, positions=results)
