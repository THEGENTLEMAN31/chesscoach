"""Accès déterministe aux données : toutes les agrégations du coach.

Aucun LLM ici. Chaque fonction renvoie des structures simples que les outils
de l'agent (ou le digest nocturne) présentent ensuite.
"""
from __future__ import annotations

import aiosqlite


async def get_game(db: aiosqlite.Connection, game_id: int) -> dict | None:
    cur = await db.execute("SELECT * FROM games WHERE id=?", (game_id,))
    row = await cur.fetchone()
    return dict(row) if row else None


async def list_games(
    db: aiosqlite.Connection, username: str, time_class: str | None = None,
    limit: int = 20,
) -> list[dict]:
    sql = "SELECT id, end_time, white, black, result, player_color, time_class, eco, opening_name, accuracy, acpl FROM games WHERE username=?"
    params: list = [username]
    if time_class:
        sql += " AND time_class=?"
        params.append(time_class)
    sql += " ORDER BY end_time DESC LIMIT ?"
    params.append(limit)
    cur = await db.execute(sql, params)
    return [dict(r) for r in await cur.fetchall()]


def _side_cp(cp: float | None, side: str) -> float | None:
    """cp moteur (du point de vue du trait) -> point de vue du côté `side`."""
    if cp is None:
        return None
    return cp if side == "w" else -cp


async def review_game(db: aiosqlite.Connection, game_id: int) -> dict | None:
    game = await get_game(db, game_id)
    if not game:
        return None
    cur = await db.execute(
        """SELECT ply, move_number, san, color, classification, eval_before_cp, eval_after_cp,
                  winprob_before, winprob_after, winprob_loss, best_move_uci, best_move_san,
                  time_taken, clk, phase, is_book, is_player, fen_before
           FROM plies WHERE game_id=? ORDER BY ply""", (game_id,)
    )
    plies = [dict(r) for r in await cur.fetchall()]
    player_color = game["player_color"]

    player_moves = [p for p in plies if p["is_player"] and not p["is_book"]]
    bad = [p for p in player_moves if p["classification"] in ("blunder", "mistake")]
    bad.sort(key=lambda p: p["winprob_loss"] or 0, reverse=True)

    by_class: dict[str, int] = {}
    total_loss = 0.0
    for p in player_moves:
        by_class[p["classification"]] = by_class.get(p["classification"], 0) + 1
        total_loss += max(0.0, p["winprob_loss"] or 0)
    if player_moves:
        by_class["acpl"] = round(total_loss / len(player_moves), 1)

    return {
        "game": {k: game[k] for k in
                 ("id", "white", "black", "white_elo", "black_elo", "result",
                  "player_color", "time_class", "time_control", "end_time",
                  "eco", "opening_name", "termination", "accuracy", "acpl")},
        "player_color": player_color,
        "summary": {
            "n_plies": len(plies),
            "player_moves": len(player_moves),
            "by_class": by_class,
        },
        "worst": [
            {
                "move_number": p["move_number"], "san": p["san"],
                "classification": p["classification"],
                "loss": p["winprob_loss"],
                # cp normalisé du point de vue du camp qui a joué le coup
                # (positif = mieux pour lui). ev_before = trait = color,
                # ev_after = trait adverse.
                "eval_before_cp": _side_cp(p["eval_before_cp"], p["color"]),
                "eval_after_cp": _side_cp(p["eval_after_cp"], "b" if p["color"] == "w" else "w"),
                "best_move_san": p["best_move_san"],
                "phase": p["phase"], "time_taken": p["time_taken"],
                "fen_before": p["fen_before"],
            }
            for p in bad[:8]
        ],
    }


async def stats(db: aiosqlite.Connection, username: str) -> dict:
    cur = await db.execute(
        """SELECT time_class, COUNT(*) AS n,
                  ROUND(AVG(accuracy),1) AS avg_acc, ROUND(AVG(acpl),1) AS avg_acpl
           FROM games WHERE username=? AND status='analyzed'
           GROUP BY time_class ORDER BY n DESC""", (username,)
    )
    by_class = [dict(r) for r in await cur.fetchall()]
    cur = await db.execute(
        """SELECT classification, COUNT(*) AS n FROM plies
           WHERE is_player=1 AND classification IS NOT NULL
           GROUP BY classification ORDER BY n DESC""", ()
    )
    by_class_moves = {r["classification"]: r["n"] for r in await cur.fetchall()}
    return {"by_time_class": by_class, "move_classifications": by_class_moves}


async def patterns(db: aiosqlite.Connection, username: str) -> dict:
    """Motifs récurrents : phases, pièces, temps, ouvertures, conversions."""
    cur = await db.execute(
        """SELECT p.phase, p.classification, COUNT(*) AS n
           FROM plies p JOIN games g ON g.id=p.game_id
           WHERE g.username=? AND p.is_player=1 AND p.classification IN ('blunder','mistake')
           GROUP BY p.phase, p.classification ORDER BY n DESC""", (username,)
    )
    by_phase = [dict(r) for r in await cur.fetchall()]

    cur = await db.execute(
        """SELECT substr(p.san,1,1) AS piece, p.classification, COUNT(*) AS n
           FROM plies p JOIN games g ON g.id=p.game_id
           WHERE g.username=? AND p.is_player=1 AND p.san IS NOT NULL
             AND p.classification IN ('blunder','mistake')
           GROUP BY piece, p.classification ORDER BY n DESC""", (username,)
    )
    by_piece = [dict(r) for r in await cur.fetchall()]

    cur = await db.execute(
        """SELECT CASE WHEN p.time_taken < 5 THEN 'tres_rapide'
                       WHEN p.time_taken < 10 THEN 'rapide'
                       WHEN p.time_taken < 30 THEN 'normal'
                       ELSE 'lent' END AS bucket,
                  p.classification, COUNT(*) AS n
           FROM plies p JOIN games g ON g.id=p.game_id
           WHERE g.username=? AND p.is_player=1 AND p.time_taken IS NOT NULL
             AND p.classification IN ('blunder','mistake')
           GROUP BY bucket ORDER BY bucket""", (username,)
    )
    by_time = [dict(r) for r in await cur.fetchall()]

    cur = await db.execute(
        """SELECT eco, opening_name, COUNT(*) AS n,
                  SUM(CASE WHEN (g.result LIKE '1-0%' AND g.player_color='w')
                             OR (g.result LIKE '0-1%' AND g.player_color='b') THEN 1 ELSE 0 END) AS wins
           FROM games g
           WHERE g.username=? AND g.status='analyzed' AND g.eco IS NOT NULL
           GROUP BY g.eco, opening_name ORDER BY n DESC LIMIT 6""", (username,)
    )
    openings = [dict(r) for r in await cur.fetchall()]

    cur = await db.execute(
        """SELECT
            SUM(CASE WHEN p.winprob_before >= 80 AND p.winprob_after <= 50 THEN 1 ELSE 0 END) AS wins_blown,
            SUM(CASE WHEN p.winprob_before <= 20 AND p.winprob_after >= 50 THEN 1 ELSE 0 END) AS losses_saved,
            COUNT(*) AS n
           FROM plies p JOIN games g ON g.id=p.game_id
           WHERE g.username=? AND p.is_player=1 AND p.winprob_before IS NOT NULL""", (username,)
    )
    swings = dict((await cur.fetchone()))

    return {"by_phase": by_phase, "by_piece": by_piece, "by_time": by_time,
            "openings": openings, "swings": swings}


async def repertoire(db: aiosqlite.Connection, username: str) -> dict:
    cur = await db.execute(
        """SELECT player_color, eco, opening_name, COUNT(*) AS n,
                  AVG(accuracy) AS avg_acc
           FROM games WHERE username=? AND status='analyzed' AND eco IS NOT NULL
           GROUP BY player_color, eco, opening_name ORDER BY n DESC LIMIT 12""", (username,)
    )
    return {"repertoire": [dict(r) for r in await cur.fetchall()]}


async def exercices(db: aiosqlite.Connection, username: str, limit: int = 6) -> list[dict]:
    """Les pires bévues récentes, transformées en exercices (fen + solution)."""
    cur = await db.execute(
        """SELECT g.id AS game_id, p.ply, p.san, p.fen_before, p.best_move_uci,
                  p.best_move_san, p.winprob_loss, p.phase, p.move_number
           FROM plies p JOIN games g ON g.id=p.game_id
           WHERE g.username=? AND p.is_player=1 AND p.classification='blunder'
             AND p.best_move_uci IS NOT NULL
           ORDER BY p.winprob_loss DESC LIMIT ?""", (username, limit)
    )
    return [dict(r) for r in await cur.fetchall()]


async def what_if(db: aiosqlite.Connection, game_id: int, ply: int) -> dict | None:
    cur = await db.execute(
        """SELECT ply, san, eval_before_cp, eval_after_cp, winprob_before, winprob_after,
                  best_move_san, classification, move_number, color
           FROM plies WHERE game_id=? AND ply=?""", (game_id, ply)
    )
    row = await cur.fetchone()
    if not row:
        return None
    return {
        "played": dict(row),
        "explanation": (
            "Si tu avais joué le coup du moteur, l'évaluation serait restée proche de "
            "celle d'avant (avant-coup). L'écart est la perte en points de probabilité."
        ),
    }
