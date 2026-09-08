"""Parties : liste filtrée, détail (plies normalisées côté Blancs), PGN.

Toutes les requêtes sont scopées par le pseudo chess.com de la session.
"""
from __future__ import annotations

import json

import aiosqlite
from fastapi import APIRouter, Depends, HTTPException, Query

from ..dependencies import get_db
from ..schemas import GameDetailOut, GameOut, GamesPage
from ..users import current_username

router = APIRouter(prefix="/api/games", tags=["games"])


def _game_from_row(r: aiosqlite.Row) -> GameOut:
    data = dict(r)
    if data.get("classifications"):
        data["classifications"] = json.loads(data["classifications"])
    return GameOut(**data)


@router.get("", response_model=GamesPage)
async def list_games(
    db: aiosqlite.Connection = Depends(get_db),
    username: str = Depends(current_username),
    time_class: str | None = None,
    status: str | None = None,
    eco: str | None = None,
    limit: int = Query(50, ge=1, le=500),
    offset: int = Query(0, ge=0),
) -> GamesPage:
    sql = "FROM games WHERE username=?"
    params: list = [username]
    if time_class:
        sql += " AND time_class=?"
        params.append(time_class)
    if status:
        sql += " AND status=?"
        params.append(status)
    if eco:
        sql += " AND eco=?"
        params.append(eco)
    cursor = await db.execute("SELECT COUNT(*) AS total " + sql, params)
    total = (await cursor.fetchone())["total"]
    cursor = await db.execute(
        "SELECT * " + sql + " ORDER BY end_time DESC LIMIT ? OFFSET ?",
        [*params, limit, offset],
    )
    items = [_game_from_row(r) for r in await cursor.fetchall()]
    return GamesPage(total=total, items=items)


@router.get("/{game_id}", response_model=GameDetailOut)
async def get_game(
    game_id: int,
    db: aiosqlite.Connection = Depends(get_db),
    username: str = Depends(current_username),
) -> GameDetailOut:
    cursor = await db.execute(
        "SELECT * FROM games WHERE id=? AND username=?", (game_id, username)
    )
    row = await cursor.fetchone()
    if not row:
        raise HTTPException(404, "partie introuvable")
    game = _game_from_row(row)

    plies = []
    cur = await db.execute(
        """SELECT ply, san, uci, fen_before, fen_after, eval_before_cp, mate_before,
                  eval_after_cp, mate_after, best_move_uci, best_move_san, cp_loss,
                  winprob_loss, classification, clk, time_taken, is_player, phase,
                  is_book, concept
           FROM plies WHERE game_id=? ORDER BY ply""", (game_id,)
    )
    for p in await cur.fetchall():
        stm_b = "w" if p["ply"] % 2 == 0 else "b"
        stm_a = "b" if stm_b == "w" else "w"

        def _white_side(score, mate, stm):
            cp = score
            if cp is not None:
                cp = cp if stm == "w" else -cp
            if mate is not None:
                mate = mate if stm == "w" else -mate
            return {"cp": cp, "mate": mate}

        plies.append({
            "ply": p["ply"],
            "san": p["san"],
            "uci": p["uci"],
            "fen_before": p["fen_before"],
            "fen_after": p["fen_after"],
            "eval_before": _white_side(p["eval_before_cp"], p["mate_before"], stm_b),
            "eval_after": _white_side(p["eval_after_cp"], p["mate_after"], stm_a),
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
            "concept": p["concept"],
        })
    return GameDetailOut(**game.model_dump(), plies=plies)


@router.get("/{game_id}/pgn")
async def get_pgn(
    game_id: int,
    db: aiosqlite.Connection = Depends(get_db),
    username: str = Depends(current_username),
) -> dict:
    cursor = await db.execute(
        "SELECT pgn FROM games WHERE id=? AND username=?", (game_id, username)
    )
    row = await cursor.fetchone()
    if not row:
        raise HTTPException(404, "partie introuvable")
    return {"pgn": row["pgn"]}