"""Backfill : calcule le concept (concepts.py) pour les erreurs déjà stockées.

Utilisation (dans le conteneur api, depuis /app) :
    python scripts/backfill_concepts.py

Idempotent : ne touche que les plies où `concept` est NULL.
"""
from __future__ import annotations

import asyncio
import json
import logging
import sys

sys.path.insert(0, "/app")

from pathlib import Path

import aiosqlite  # noqa: E402

from app import concepts as concepts_mod  # noqa: E402
from app.config import settings  # noqa: E402
from app.db import connect, migrate  # noqa: E402

logging.basicConfig(level=logging.INFO, format="%(asctime)s %(message)s")
logger = logging.getLogger("backfill")


async def main() -> None:
    db = await connect(Path(settings.db_path))
    db.row_factory = aiosqlite.Row
    await migrate(db)
    logger.info("Migration appliquée (user_version à jour)")

    # toutes les plies des parties contenant au moins une erreur du joueur
    cur = await db.execute(
        """SELECT p.game_id, p.ply, p.is_player, p.fen_before, p.san, p.uci,
                  p.best_move_uci, p.best_move_san, p.mate_before, p.mate_after,
                  p.phase, p.color, p.time_taken, p.winprob_before, p.classification,
                  p.is_book, p.concept, p.id
           FROM plies p
           JOIN (SELECT DISTINCT game_id FROM plies
                 WHERE is_player=1 AND classification IN ('blunder','mistake')
                   AND concept IS NULL) err ON err.game_id = p.game_id
           ORDER BY p.game_id, p.ply"""
    )
    rows = await cur.fetchall()

    # regroupement par partie
    by_game: dict[int, list[dict]] = {}
    for r in rows:
        by_game.setdefault(r["game_id"], []).append(dict(r))

    updated = 0
    total_err = sum(
        1
        for plies in by_game.values()
        for p in plies
        if p["is_player"] and p["classification"] in ("blunder", "mistake") and p["concept"] is None
    )
    logger.info("Erreurs à étiqueter : %s", total_err)
    for game_id, plies in by_game.items():
        exit_ply = max((p["ply"] for p in plies if p["is_book"]), default=-1)
        prev_player_error = False
        for p in plies:
            k = p["ply"]
            if p["is_player"] and p["classification"] in ("blunder", "mistake") and p["concept"] is None:
                opp_san = None
                opp_fen = None
                if k > 0:
                    prev = plies_map(plies).get(k - 1)
                    if prev:
                        opp_san = prev["san"]
                        opp_fen = prev["fen_before"]
                res = concepts_mod.analyze_error(
                    fen_before=p["fen_before"],
                    san=p["san"],
                    uci=p["uci"],
                    best_uci=p["best_move_uci"],
                    best_san=p["best_move_san"],
                    mate_before=p["mate_before"],
                    mate_after=p["mate_after"],
                    phase=p["phase"],
                    color=p["color"],
                    time_taken=p["time_taken"],
                    winprob_before=p["winprob_before"],
                    opponent_san=opp_san,
                    opponent_fen=opp_fen,
                    is_near_book_exit=exit_ply >= 0 and k <= exit_ply + 2,
                    previous_was_error=prev_player_error,
                )
                await db.execute(
                    "UPDATE plies SET concept=?, concepts=? WHERE id=?",
                    (
                        res.primary,
                        json.dumps(
                            {"concepts": res.concepts, "causes": res.causes, "primary": res.primary},
                            ensure_ascii=False,
                        ),
                        p["id"],
                    ),
                )
                updated += 1
                if updated % 200 == 0:
                    await db.commit()
                    logger.info("  ...%s/%s", updated, total_err)
            if p["is_player"]:
                prev_player_error = p["classification"] in ("blunder", "mistake")
        await db.commit()
    await db.close()
    logger.info("Terminé : %s plies étiquetés", updated)


def plies_map(plies: list[dict]) -> dict[int, dict]:
    return {p["ply"]: p for p in plies}


if __name__ == "__main__":
    asyncio.run(main())
