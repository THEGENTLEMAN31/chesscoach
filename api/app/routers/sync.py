"""Sync chess.com (batch serveur, moteur natif) pour l'utilisateur connecté +
acceptation des analyses client (local-first, P1).
"""
from __future__ import annotations

import json

import aiosqlite
from fastapi import APIRouter, Depends, HTTPException

from ..dependencies import get_db, get_manager
from ..eval import MOVE_SCORE, acpl_from_losses, accuracy
from ..schemas import GameOut, ImportGameRequest, SyncRequest, SyncResult
from ..services.manager import SyncManager
from ..services.sync import TIME_CLASSES
from ..users import current_username

router = APIRouter(prefix="/api/sync", tags=["sync"])

ACCEPTABLE_CLASSES = TIME_CLASSES | {"bullet", "daily"}


@router.post("", response_model=SyncResult, status_code=202)
async def sync(
    req: SyncRequest,
    manager: SyncManager = Depends(get_manager),
    username: str = Depends(current_username),
) -> SyncResult:
    result = await manager.start(username, req.months)
    if result.get("status") == "already_running":
        raise HTTPException(409, "un pipeline est déjà en cours")
    return SyncResult(**result)


@router.get("/status")
async def sync_status(
    manager: SyncManager = Depends(get_manager),
    username: str = Depends(current_username),
) -> dict:
    return await manager.status(username)


@router.post("/accept", response_model=GameOut)
async def accept_client_analysis(
    req: ImportGameRequest,
    db: aiosqlite.Connection = Depends(get_db),
    username: str = Depends(current_username),
) -> GameOut:
    """Reçoit une partie analysée localement (moteur wasm) et la stocke.

    Idempotent : si la partie existe déjà (pgn ou chesscom_id identique),
    renvoie la partie existante sans réécrire les plis.
    """
    if req.time_class not in ACCEPTABLE_CLASSES:
        raise HTTPException(422, "format non supporté")
    if req.rules != "chess":
        raise HTTPException(422, "seules les parties standards sont acceptées")
    if len(req.plies) < 2 or req.player_color not in ("w", "b"):
        raise HTTPException(422, "partie invalide")

    dedupe_sql = "SELECT id FROM games WHERE username=?"
    dedupe_params: list = [username]
    if req.chesscom_id:
        dedupe_sql += " AND chesscom_id=?"
        dedupe_params.append(req.chesscom_id)
    elif req.pgn:
        dedupe_sql += " AND pgn=?"
        dedupe_params.append(req.pgn)
    else:
        raise HTTPException(422, "chesscom_id ou pgn requis")

    cur = await db.execute(dedupe_sql, dedupe_params)
    row = await cur.fetchone()
    if row:
        game_id = row["id"]
    else:
        white = req.white or "?"
        black = req.black or "?"
        cur = await db.execute(
            """INSERT INTO games (chesscom_id, username, white, black, white_elo, black_elo,
               result, player_color, time_class, time_control, end_time, rules, fen_start,
               eco, opening_name, termination, pgn, status)
               VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?, 'analyzed')""",
            (
                req.chesscom_id,
                username,
                white,
                black,
                req.white_elo,
                req.black_elo,
                req.result,
                req.player_color,
                req.time_class,
                req.time_control,
                req.end_time,
                "chess",
                req.fen_start,
                req.eco,
                req.opening_name,
                req.termination,
                req.pgn,
            ),
        )
        game_id = cur.lastrowid
        for p in req.plies:
            concepts_json = None
            if p.concept and p.classification in ("blunder", "mistake", "inaccuracy"):
                concepts_json = json.dumps(
                    {"concepts": [p.concept], "causes": [], "primary": p.concept},
                    ensure_ascii=False,
                )
            await db.execute(
                """INSERT OR REPLACE INTO plies
                   (game_id, ply, move_number, color, san, uci, fen_before, fen_after,
                    eval_before_cp, mate_before, eval_after_cp, mate_after,
                    best_move_uci, best_move_san, cp_loss,
                    winprob_before, winprob_after, winprob_loss, classification,
                    clk, time_taken, phase, is_book, is_player, concept, concepts)
                   VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)""",
                (
                    game_id, p.ply, p.move_number, p.color, p.san, p.uci,
                    p.fen_before, p.fen_after,
                    p.eval_before_cp, p.mate_before, p.eval_after_cp, p.mate_after,
                    p.best_move_uci, p.best_move_san, p.cp_loss,
                    p.winprob_before, p.winprob_after, p.winprob_loss, p.classification,
                    p.clk, p.time_taken, p.phase, p.is_book, p.is_player, p.concept,
                    concepts_json,
                ),
            )
    # Ré-agrège les indicateurs côté serveur pour rester cohérent avec l'analyse serveur.
    counts: dict[str, int] = {}
    scores: list[float] = []
    losses: list[float] = []
    for p in req.plies:
        if p.is_player and p.classification and p.classification in MOVE_SCORE:
            counts[p.classification] = counts.get(p.classification, 0) + 1
            scores.append(MOVE_SCORE[p.classification])
            if p.winprob_loss is not None:
                losses.append(p.winprob_loss)
    aggreg = {
        "accuracy": accuracy(scores) if scores else None,
        "acpl": acpl_from_losses(losses) if losses else None,
        "classifications": json.dumps(counts, ensure_ascii=False) if counts else None,
    }
    if any(v is not None for v in aggreg.values()):
        await db.execute(
            "UPDATE games SET status='analyzed', accuracy=?, acpl=?, classifications=? WHERE id=?",
            (aggreg["accuracy"], aggreg["acpl"], aggreg["classifications"], game_id),
        )
    await db.commit()

    cur = await db.execute("SELECT * FROM games WHERE id=? AND username=?", (game_id, username))
    data = dict(await cur.fetchone())
    if data.get("classifications"):
        data["classifications"] = json.loads(data["classifications"])
    return GameOut(**data)