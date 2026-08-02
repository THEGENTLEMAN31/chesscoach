"""API du coach d'échecs — FastAPI.

Expose les données analysées (parties, coups, stats) et déclenche le pipeline
nocturne. Le LLM n'intervient nulle part ici : tout est déterministe.
"""
from __future__ import annotations

import asyncio
import json
import logging
from contextlib import asynccontextmanager

from fastapi import FastAPI, HTTPException, Query

from .analysis_client import AnalyzerClient
from .chesscom import ChessComClient
from .config import settings
from .db import init_db
from .openings import OpeningBook
from .schemas import GameDetailOut, GameOut, SyncRequest, SyncResult
from .services.manager import SyncManager

logging.basicConfig(level=logging.INFO)
logger = logging.getLogger(__name__)


@asynccontextmanager
async def lifespan(app: FastAPI):
    app.state.db = await init_db(settings.db_dir / "chesscoach.db")
    app.state.chesscom = ChessComClient()
    app.state.analyzer = AnalyzerClient()
    app.state.book = OpeningBook()
    await asyncio.to_thread(app.state.book.load)
    app.state.manager = SyncManager(
        app.state.db, app.state.chesscom, app.state.analyzer, app.state.book
    )
    logger.info("API prête (book=%s positions)", len(app.state.book._by_epd))
    yield
    await app.state.analyzer.aclose()
    await app.state.chesscom.aclose()
    await app.state.db.close()


app = FastAPI(title="ChessCoach API", version="0.1.0", lifespan=lifespan)


def _db():
    return app.state.db


def _game_from_row(r) -> GameOut:
    data = dict(r)
    data["classifications"] = json.loads(data["classifications"]) if data.get("classifications") else None
    return GameOut(**data)


@app.get("/health")
async def health() -> dict:
    row = await (await _db().execute("SELECT 1")).fetchone()
    return {"ok": row is not None}


# ---------------------------------------------------------------- sync
@app.post("/api/sync", response_model=SyncResult, status_code=202)
async def sync(req: SyncRequest) -> SyncResult:
    username = req.username or settings.coach_username
    if not username:
        raise HTTPException(400, "username requis")
    result = await app.state.manager.start(username, req.months)
    if result.get("status") == "already_running":
        raise HTTPException(409, "un pipeline est déjà en cours")
    return SyncResult(**result)


@app.get("/api/sync/status")
async def sync_status() -> dict:
    return await app.state.manager.status(settings.coach_username)


# --------------------------------------------------------------- games
@app.get("/api/games", response_model=list[GameOut])
async def list_games(
    username: str = Query(settings.coach_username),
    time_class: str | None = None,
    status: str | None = None,
    limit: int = Query(50, ge=1, le=500),
    offset: int = Query(0, ge=0),
) -> list[GameOut]:
    sql = "SELECT * FROM games WHERE username=?"
    params: list = [username]
    if time_class:
        sql += " AND time_class=?"
        params.append(time_class)
    if status:
        sql += " AND status=?"
        params.append(status)
    sql += " ORDER BY end_time DESC LIMIT ? OFFSET ?"
    params += [limit, offset]
    cursor = await _db().execute(sql, params)
    return [_game_from_row(r) for r in await cursor.fetchall()]


@app.get("/api/games/{game_id}", response_model=GameDetailOut)
async def get_game(game_id: int) -> GameDetailOut:
    cursor = await _db().execute("SELECT * FROM games WHERE id=?", (game_id,))
    row = await cursor.fetchone()
    if not row:
        raise HTTPException(404, "partie introuvable")
    game = _game_from_row(row)

    plies = []
    cur = await _db().execute(
        """SELECT ply, san, uci, fen_before, fen_after, eval_before_cp, mate_before, eval_after_cp,
                  mate_after, best_move_uci, best_move_san, cp_loss, winprob_loss, classification,
                  clk, time_taken, is_player, phase, is_book
           FROM plies WHERE game_id=? ORDER BY ply""", (game_id,)
    )
    for p in await cur.fetchall():
        plies.append({
            "ply": p["ply"],
            "san": p["san"],
            "uci": p["uci"],
            "fen_before": p["fen_before"],
            "fen_after": p["fen_after"],
            "eval_before": {"cp": p["eval_before_cp"], "mate": p["mate_before"]},
            "eval_after": {"cp": p["eval_after_cp"], "mate": p["mate_after"]},
            "best_move": p["best_move_uci"],
            "best_move_san": p["best_move_san"],
            "cp_loss": p["cp_loss"],
            "winprob_loss": p["winprob_loss"],
            "classification": p["classification"],
            "clk": p["clk"],
            "time_taken": p["time_taken"],
            "is_player": bool(p["is_player"]),
            "is_book": bool(p["is_book"]),
            "phase": p["phase"],
        })
    return GameDetailOut(**game.model_dump(), plies=plies)


@app.get("/api/games/{game_id}/pgn")
async def get_pgn(game_id: int) -> dict:
    cursor = await _db().execute("SELECT pgn FROM games WHERE id=?", (game_id,))
    row = await cursor.fetchone()
    if not row:
        raise HTTPException(404, "partie introuvable")
    return {"pgn": row["pgn"]}


# --------------------------------------------------------------- stats
@app.get("/api/stats")
async def stats(username: str = settings.coach_username) -> dict:
    db = _db()
    cur = await db.execute(
        """SELECT time_class,
                  COUNT(*) AS n,
                  ROUND(AVG(accuracy),1) AS avg_acc,
                  ROUND(AVG(acpl),1) AS avg_acpl,
                  SUM(CASE WHEN result LIKE '1/2%' THEN 1 ELSE 0 END) AS draws,
                  SUM(CASE WHEN result LIKE '%1-0%' AND player_color='w' THEN 1
                           WHEN result LIKE '%0-1%' AND player_color='b' THEN 1
                           ELSE 0 END) AS wins
           FROM games WHERE username=? AND status='analyzed'
           GROUP BY time_class ORDER BY n DESC""", (username,)
    )
    by_class = []
    for r in await cur.fetchall():
        by_class.append({
            "time_class": r["time_class"], "games": r["n"], "accuracy": r["avg_acc"],
            "acpl": r["avg_acpl"], "wins": r["wins"], "draws": r["draws"],
            "losses": r["n"] - r["wins"] - r["draws"],
        })

    cur = await db.execute(
        """SELECT classification AS cls, COUNT(*) AS n
           FROM plies WHERE is_player=1 AND classification IS NOT NULL
           GROUP BY classification ORDER BY n DESC""", ()
    )
    cls_counts = {r["cls"]: r["n"] for r in await cur.fetchall()}

    cur = await db.execute(
        """SELECT eco, opening_name, COUNT(*) AS n
           FROM games WHERE username=? AND status='analyzed' AND eco IS NOT NULL
           GROUP BY eco, opening_name ORDER BY n DESC LIMIT 10""", (username,)
    )
    openings = [dict(r) for r in await cur.fetchall()]

    cur = await db.execute(
        """SELECT ROUND(AVG(winprob_loss),1) AS blunder_acpl,
                  ROUND(AVG(cp_loss),1) AS avg_cp_loss
           FROM plies WHERE is_player=1 AND winprob_loss IS NOT NULL""", ()
    )
    sr = await cur.fetchone()

    return {"by_time_class": by_class, "move_classifications": cls_counts,
            "openings": openings, "totals": dict(sr)}


@app.get("/api/players")
async def players() -> list[dict]:
    cur = await _db().execute(
        "SELECT username, is_active, last_analyzed_at FROM players ORDER BY last_analyzed_at DESC"
    )
    return [dict(r) for r in await cur.fetchall()]


if __name__ == "__main__":
    import uvicorn

    uvicorn.run("app.main:app", host="0.0.0.0", port=8001)
