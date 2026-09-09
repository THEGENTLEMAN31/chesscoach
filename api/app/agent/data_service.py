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
    status: str | None = None, limit: int = 20, offset: int = 0,
) -> list[dict]:
    sql = "SELECT id, end_time, white, black, result, player_color, time_class, eco, opening_name, accuracy, acpl FROM games WHERE username=?"
    params: list = [username]
    if time_class:
        sql += " AND time_class=?"
        params.append(time_class)
    if status:
        sql += " AND status=?"
        params.append(status)
    sql += " ORDER BY end_time DESC LIMIT ? OFFSET ?"
    params += [limit, offset]
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


async def exercices(db: aiosqlite.Connection, username: str, limit: int = 6,
                    concept: str | None = None,
                    time_class: str | None = None,
                    classification: str | None = None) -> list[dict]:
    """Les pires bévues récentes, transformées en exercices (fen + solution), avec rotation.

    `concept` : filtre sur le concept détecté (clé concepts, ex. "hanging_piece").
    `time_class` : filtre sur le format de la partie d'origine (rapid / blitz / ...).
    `classification` : liste de gravités séparées par des virgules
        (ex. "blunder,mistake"). Vide par défaut → seules les bévues (blunder).

    Rotation : priorité de base = perte de probabilité (les pires d'abord) ; un échec
    récent fait remonter la position (à retenter) ; une réussite récente (ou répétée)
    la fait descendre dans la liste — on n'offre pas toujours les mêmes exercices.
    """
    if classification:
        classes = [c.strip() for c in classification.split(",") if c.strip()]
        if not classes:
            classes = ["blunder"]
    else:
        classes = ["blunder"]
    q = """SELECT g.id AS game_id, p.ply, p.san, p.fen_before, p.best_move_uci,
                  p.best_move_san, p.winprob_loss, p.cp_loss, p.phase, p.move_number,
                  p.concept, p.color, g.white, g.black, g.result, g.player_color,
                  g.end_time, g.opening_name, g.eco, g.time_class,
                  COALESCE(s.correct_count,0) AS correct_count,
                  COALESCE(s.wrong_count,0) AS wrong_count,
                  s.last_attempt AS last_attempt, s.last_correct AS last_correct
           FROM plies p
           JOIN games g ON g.id=p.game_id
           LEFT JOIN (
               SELECT game_id, ply,
                      SUM(correct) AS correct_count,
                      SUM(1-correct) AS wrong_count,
                      MAX(created_at) AS last_attempt,
                      MAX(CASE WHEN correct=1 THEN created_at END) AS last_correct
               FROM studied_positions
               GROUP BY game_id, ply
           ) s ON s.game_id=p.game_id AND s.ply=p.ply
           WHERE g.username=? AND p.is_player=1
             AND p.classification IN (""" + ",".join("?" * len(classes)) + """)
             AND p.best_move_uci IS NOT NULL"""
    params: list = [username, *classes]
    if concept:
        q += " AND p.concept=?"
        params.append(concept)
    if time_class:
        q += " AND g.time_class=?"
        params.append(time_class)
    rows = [dict(r) for r in await (await db.execute(q, params)).fetchall()]

    for r in rows:
        correct = r["correct_count"]
        score = r["winprob_loss"] or 0
        if r["last_attempt"]:
            if r["last_correct"] is None or r["last_attempt"] > r["last_correct"]:
                score += 150  # dernier essai raté → remonter pour retenter
            else:
                score -= 250  # dernier essai réussi → descendre
        if correct >= 2:
            score -= 200      # maîtrisé (réussi plusieurs fois) → tout en bas
        elif correct >= 1:
            score -= 80
        r["_score"] = score

    rows.sort(key=lambda r: r["_score"], reverse=True)
    for r in rows:
        r.pop("_score", None)
    rows = rows[:limit]

    # Multi-coups : pour chaque exercice, la suite de la partie (fen + san + meilleur coup)
    # sur 3 plis, pour pouvoir rejouer une SÉQUENCE et pas un seul coup.
    if rows:
        by_game: dict[int, list[dict]] = {}
        gids = list({r["game_id"] for r in rows})
        gsel = ",".join("?" * len(gids))
        cur = await db.execute(
            f"""SELECT game_id, ply, san, uci, fen_before, best_move_uci,
                       best_move_san, is_player
                FROM plies WHERE game_id IN ({gsel})
                ORDER BY game_id, ply""",
            gids,
        )
        for pr in (dict(x) for x in await cur.fetchall()):
            by_game.setdefault(pr["game_id"], []).append(pr)
        for r in rows:
            seq = [q for q in by_game.get(r["game_id"], []) if q["ply"] > r["ply"]][:3]
            r["line"] = [
                {
                    "san": q["san"],
                    "fen_before": q["fen_before"],
                    "best_move_uci": q["best_move_uci"],
                    "best_move_san": q["best_move_san"],
                    "is_player": q.get("is_player", 0),
                }
                for q in seq
            ]
    return rows


async def recent_moves(
    db: aiosqlite.Connection, username: str,
    classification: str | None = None, time_class: str | None = None,
    eco: str | None = None, concept: str | None = None,
    phase: str | None = None, order: str = "recent", limit: int = 20,
) -> list[dict]:
    """Coups fautifs du joueur (blunders/mistakes), joints aux infos de partie.

    Filtres optionnels : classification (liste séparée par des virgules), time_class,
    eco, concept, phase. Tri par `recent` (date) ou `worst` (perte de probabilité).
    """
    classes = [c.strip() for c in (classification or "").split(",") if c.strip()]
    if not classes:
        classes = ["blunder", "mistake"]
    sql = """
        SELECT g.id AS game_id, p.ply, p.move_number, p.san, p.classification,
               p.winprob_loss, p.cp_loss, p.phase, p.time_taken, p.concept,
               p.fen_before, p.best_move_san, g.end_time, g.time_class, g.result,
               g.player_color, g.opening_name, g.eco, g.white, g.black
        FROM plies p JOIN games g ON g.id = p.game_id
        WHERE g.username=? AND p.is_player=1 AND p.is_book=0
          AND p.classification IN (""" + ",".join("?" * len(classes)) + """)"""
    params: list = [username, *classes]
    if time_class:
        sql += " AND g.time_class=?"
        params.append(time_class)
    if eco:
        sql += " AND g.eco=?"
        params.append(eco)
    if concept:
        sql += " AND p.concept=?"
        params.append(concept)
    if phase:
        sql += " AND p.phase=?"
        params.append(phase)
    if order == "worst":
        sql += " ORDER BY COALESCE(p.winprob_loss,0) DESC, g.end_time DESC"
    else:
        sql += " ORDER BY g.end_time DESC, p.ply"
    sql += " LIMIT ?"
    params.append(limit)
    cur = await db.execute(sql, params)
    return [dict(r) for r in await cur.fetchall()]


async def etude_stats(db: aiosqlite.Connection, username: str,
                      time_class: str | None = None) -> dict:
    """Statistiques des positions étudiées (exercices tentés) par format."""
    where = " WHERE username=?"
    params: list = [username]
    if time_class:
        where += " AND time_class=?"
        params.append(time_class)
    cur = await db.execute(
        """SELECT COUNT(*) AS n, COALESCE(SUM(correct),0) AS correct,
                  ROUND(100.0*COALESCE(SUM(correct),0)/MAX(1,COUNT(*)),1) AS correct_rate,
                  MIN(created_at) AS first_at, MAX(created_at) AS last_at
           FROM studied_positions""" + where, params)
    row = dict((await cur.fetchone()))
    cur = await db.execute(
        """SELECT concept, COUNT(*) AS n,
                  COALESCE(SUM(correct),0) AS correct
           FROM studied_positions
           """ + where + """ AND concept IS NOT NULL
           GROUP BY concept ORDER BY n DESC LIMIT 6""", params)
    row["by_concept"] = [
        {
            "concept": r["concept"],
            "n": r["n"],
            "correct": r["correct"],
            "correct_rate": round(100.0 * r["correct"] / max(1, r["n"]), 1),
        }
        for r in await cur.fetchall()
    ]
    cur = await db.execute(
        """SELECT COUNT(*) AS n FROM studied_positions
           """ + where + """ AND created_at >= datetime('now','-7 days')""", params)
    row["last_7d"] = (await cur.fetchone())["n"]
    return row


async def record_etude(db: aiosqlite.Connection, payload) -> int:
    """Enregistre une tentative d'exercice (position étudiée)."""
    cur = await db.execute(
        """INSERT INTO studied_positions
           (username, time_class, game_id, ply, fen, san, best_move_uci,
            best_move_san, concept, attempt, correct)
           VALUES (?,?,?,?,?,?,?,?,?,?,?)""",
        (payload.username, payload.time_class, payload.game_id, payload.ply,
         payload.fen, payload.san, payload.best_move_uci, payload.best_move_san,
         payload.concept, payload.attempt, 1 if payload.correct else 0))
    await db.commit()
    return cur.lastrowid


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
