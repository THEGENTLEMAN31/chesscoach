"""Statistiques agrégées + profil joueur (multi-tenant) + digest hebdo.

Trois blocs regroupés ici puisqu'ils partagent la même dépendance
`current_username` (pseudo chess.com de la session).
"""
from __future__ import annotations

import json

import aiosqlite
from fastapi import APIRouter, Depends, HTTPException, Query
from pydantic import BaseModel

from ..dependencies import get_db
from ..users import current_username

router = APIRouter(tags=["stats"])


@router.get("/api/stats")
async def stats(
    db: aiosqlite.Connection = Depends(get_db),
    username: str = Depends(current_username),
) -> dict:
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
    by_class = [{
        "time_class": r["time_class"], "games": r["n"], "accuracy": r["avg_acc"],
        "acpl": r["avg_acpl"], "wins": r["wins"], "draws": r["draws"],
        "losses": r["n"] - r["wins"] - r["draws"],
    } for r in await cur.fetchall()]

    cur = await db.execute(
        """SELECT p.classification AS cls, COUNT(*) AS n
           FROM plies p JOIN games g ON g.id = p.game_id
           WHERE g.username=? AND p.is_player=1 AND p.classification IS NOT NULL
           GROUP BY p.classification ORDER BY n DESC""", (username,)
    )
    cls_counts = {r["cls"]: r["n"] for r in await cur.fetchall()}

    cur = await db.execute(
        """SELECT eco, opening_name, COUNT(*) AS n
           FROM games WHERE username=? AND status='analyzed' AND eco IS NOT NULL
           GROUP BY eco, opening_name ORDER BY n DESC LIMIT 10""", (username,)
    )
    openings = [dict(r) for r in await cur.fetchall()]

    cur = await db.execute(
        """SELECT ROUND(AVG(p.winprob_loss),1) AS blunder_acpl,
                  ROUND(AVG(p.cp_loss),1) AS avg_cp_loss
           FROM plies p JOIN games g ON g.id = p.game_id
           WHERE g.username=? AND p.is_player=1 AND p.winprob_loss IS NOT NULL""", (username,)
    )
    sr = await cur.fetchone()

    return {"by_time_class": by_class, "move_classifications": cls_counts,
            "openings": openings, "totals": dict(sr)}


@router.get("/api/players")
async def players(
    db: aiosqlite.Connection = Depends(get_db),
    username: str = Depends(current_username),
) -> list[dict]:
    cur = await db.execute(
        "SELECT username, is_active, last_analyzed_at FROM players WHERE username=?",
        (username,),
    )
    return [dict(r) for r in await cur.fetchall()]


# --------------------------------------------------------------- profil joueur
@router.get("/api/profile")
async def profile_get(
    db: aiosqlite.Connection = Depends(get_db),
    username: str = Depends(current_username),
    time_class: str = Query("global"),
) -> dict:
    from ..agent.profile import get_profile

    try:
        return await get_profile(db, username, time_class=time_class)
    except Exception as exc:  # noqa: BLE001
        raise HTTPException(500, f"Profil impossible : {exc}") from exc


@router.get("/api/profile/all", name="profile_all")
async def profile_all(
    db: aiosqlite.Connection = Depends(get_db),
    username: str = Depends(current_username),
    recompute: bool = Query(False),
) -> dict:
    from ..agent.profile import get_all

    try:
        return await get_all(db, username, recompute=recompute)
    except Exception as exc:  # noqa: BLE001
        raise HTTPException(500, f"Profil impossible : {exc}") from exc


@router.post("/api/profile/recompute")
async def profile_recompute(
    db: aiosqlite.Connection = Depends(get_db),
    username: str = Depends(current_username),
    time_class: str = Query("global"),
) -> dict:
    from ..agent.profile import get_profile

    try:
        return await get_profile(db, username, recompute=True, time_class=time_class)
    except Exception as exc:  # noqa: BLE001
        raise HTTPException(500, f"Profil impossible : {exc}") from exc


@router.get("/api/profile/history")
async def profile_history_endpoint(
    db: aiosqlite.Connection = Depends(get_db),
    username: str = Depends(current_username),
    time_class: str | None = None,
) -> dict:
    from ..agent.profile import profile_history

    return await profile_history(db, username, time_class=time_class)


# ------------------------------------------------------------- objectifs Elo
class ObjectivesIn(BaseModel):
    rapid: int | None = None
    blitz: int | None = None


@router.get("/api/profile/objectives")
async def objectives_get(
    db: aiosqlite.Connection = Depends(get_db),
    username: str = Depends(current_username),
) -> dict:
    from ..agent.profile import get_objectives

    return {"username": username, "targets": await get_objectives(db, username)}


@router.put("/api/profile/objectives")
async def objectives_put(
    req: ObjectivesIn,
    db: aiosqlite.Connection = Depends(get_db),
    username: str = Depends(current_username),
) -> dict:
    from ..agent.profile import SUPPORTED_OBJECTIVE_CLASSES

    values: dict[str, int | None] = {"rapid": req.rapid, "blitz": req.blitz}
    # Supprime les champs absents du dictionnaire (Pydantic sert None pour les champs
    # explicitement envoyés à null : on les efface pour retomber sur les défauts).
    existing = {"rapid": None, "blitz": None}
    cur = await db.execute(
        "SELECT rapid, blitz FROM player_objectives WHERE username=?", (username,)
    )
    row = await cur.fetchone()
    if row:
        existing = {"rapid": row["rapid"], "blitz": row["blitz"]}
    merged = {k: (values[k] if values[k] is not None else existing[k]) for k in SUPPORTED_OBJECTIVE_CLASSES}
    await db.execute(
        """INSERT INTO player_objectives (username, rapid, blitz, updated_at)
           VALUES (?,?,?,datetime('now'))
           ON CONFLICT(username) DO UPDATE SET
               rapid=excluded.rapid, blitz=excluded.blitz, updated_at=excluded.updated_at""",
        (username, merged["rapid"], merged["blitz"]),
    )
    # Force le recalcul des profils pour refléter la nouvelle cible.
    from ..agent.profile import get_profile

    await get_profile(db, username, recompute=True, time_class="rapid")
    await get_profile(db, username, recompute=True, time_class="blitz")
    await db.commit()
    return await objectives_get(db, username)


# --------------------------------------------------------------- digest (sans LLM)
@router.get("/api/digest/latest")
async def digest_latest(
    db: aiosqlite.Connection = Depends(get_db),
    username: str = Depends(current_username),
) -> dict:
    cur = await db.execute(
        "SELECT period, facts, narrative, created_at FROM digests "
        "WHERE username=? ORDER BY id DESC LIMIT 1", (username,)
    )
    row = await cur.fetchone()
    if not row:
        return {"period": None, "facts": None, "narrative": None}
    return {"period": row["period"], "facts": json.loads(row["facts"] or "{}"),
            "narrative": row["narrative"], "created_at": row["created_at"]}


@router.post("/api/digest/generate")
async def digest_generate(
    db: aiosqlite.Connection = Depends(get_db),
    username: str = Depends(current_username),
) -> dict:
    from ..agent.digest import generate_digest

    return await generate_digest(db, username, model=None)