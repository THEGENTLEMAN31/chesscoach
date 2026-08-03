"""Digest nocturne : faits déterministes + narration française.

Les faits sont calculés par SQL (source de vérité). Le LLM ne fait QUE narrer
le digest ; s'il est indisponible, un gabarit déterministe prend le relais.
"""
from __future__ import annotations

import json
import logging
from datetime import date, datetime, timedelta

import aiosqlite

from ..config import settings
from .data_service import patterns

logger = logging.getLogger(__name__)


async def compute_facts(db: aiosqlite.Connection, username: str, days: int = 7) -> dict:
    since = int((datetime.now() - timedelta(days=days)).timestamp())
    cur = await db.execute(
        """SELECT COUNT(*) AS n, ROUND(AVG(accuracy),1) AS acc,
                  SUM(CASE WHEN result LIKE '1/2%' THEN 1 ELSE 0 END) AS draws,
                  SUM(CASE WHEN (result LIKE '1-0%' AND player_color='w')
                            OR (result LIKE '0-1%' AND player_color='b') THEN 1 ELSE 0 END) AS wins
           FROM games WHERE username=? AND status='analyzed' AND end_time>=?""",
        (username, since),
    )
    totals = dict((await cur.fetchone()))

    cur = await db.execute(
        """SELECT COUNT(*) AS blunders, SUM(CASE WHEN time_taken<5 THEN 1 ELSE 0 END) AS blunders_rapides
           FROM plies p JOIN games g ON g.id=p.game_id
           WHERE g.username=? AND p.is_player=1 AND p.classification='blunder' AND g.end_time>=?""",
        (username, since),
    )
    blunders = dict((await cur.fetchone()))

    cur = await db.execute(
        """SELECT g.eco, g.opening_name, COUNT(DISTINCT g.id) AS n, AVG(p.winprob_loss) AS avg_loss
           FROM plies p JOIN games g ON g.id=p.game_id
           WHERE g.username=? AND p.is_player=1 AND p.classification IN ('blunder','mistake')
             AND g.end_time>=? AND g.eco IS NOT NULL
           GROUP BY g.eco, g.opening_name HAVING n>=3 ORDER BY avg_loss DESC LIMIT 3""",
        (username, since),
    )
    worst_openings = [dict(r) for r in await cur.fetchall()]

    cur = await db.execute(
        """SELECT phase, COUNT(*) AS n FROM plies p JOIN games g ON g.id=p.game_id
           WHERE g.username=? AND p.is_player=1 AND p.classification='blunder' AND g.end_time>=?
           GROUP BY phase ORDER BY n DESC LIMIT 1""", (username, since)
    )
    r = await cur.fetchone()
    worst_phase = dict(r) if r else None

    cur = await db.execute(
        """SELECT accuracy FROM games WHERE username=? AND status='analyzed' AND end_time>=?
           ORDER BY end_time DESC LIMIT 10""", (username, since)
    )
    recent = [r["accuracy"] for r in await cur.fetchall()]
    trend = None
    if len(recent) >= 6:
        half = len(recent) // 2
        older = sum(recent[:half]) / half
        newer = sum(recent[half:]) / (len(recent) - half)
        trend = round(newer - older, 1)

    pats = await patterns(db, username)

    cur = await db.execute(
        """SELECT p.concept, COUNT(*) AS n, ROUND(AVG(p.winprob_loss),1) AS avg_loss
           FROM plies p JOIN games g ON g.id=p.game_id
           WHERE g.username=? AND p.is_player=1 AND p.classification IN ('blunder','mistake')
             AND g.end_time>=? AND p.concept IS NOT NULL
           GROUP BY p.concept ORDER BY n DESC LIMIT 4""", (username, since)
    )
    concepts_week = [dict(r) for r in await cur.fetchall()]

    focus = None
    if blunders.get("blunders_rapides"):
        focus = "jouer plus lentement en position difficile : les bévues arrivent souvent en < 5 s"
    elif worst_phase:
        focus = f"travailler la phase '{worst_phase['phase']}' (le plus de bévues)"
    elif worst_openings:
        focus = f"revoir l'ouverture {worst_openings[0]['eco']} {worst_openings[0]['opening_name']}"

    return {
        "period_days": days,
        "games": totals,
        "blunders": blunders,
        "worst_openings": worst_openings,
        "worst_phase": worst_phase,
        "trend_accuracy_last10": trend,
        "concepts_week": concepts_week,
        "swings": pats.get("swings"),
        "suggested_focus": focus,
    }


TEMPLATE = """Récapitulatif des {days} derniers jours pour {username} :
- {n} partie(s) analysée(s), dont {wins} victoire(s) et {draws} nulle(s).
- Précision moyenne : {acc} %.
- {blunders} bévue(s), dont {fast} en moins de 5 s de réflexion.
{focus_line}
Conseil de la semaine : {focus}."""


def template_narrative(facts: dict, username: str) -> str:
    g = facts["games"] or {}
    b = facts["blunders"] or {}
    focus = facts.get("suggested_focus") or "continuer l'analyse régulière des parties"
    return TEMPLATE.format(
        days=facts["period_days"], username=username,
        n=g.get("n", 0), wins=g.get("wins", 0), draws=g.get("draws", 0),
        acc=g.get("acc", "—"), blunders=b.get("blunders", 0),
        fast=b.get("blunders_rapides", 0),
        focus_line="", focus=focus,
    )


async def narrate_facts(model, facts: dict, username: str) -> tuple[str, dict]:
    """Narration LLM (ou gabarit si le LLM est indisponible)."""
    summary = json.dumps(facts, ensure_ascii=False, default=str)
    prompt = (
        "Voici les faits calculés sur les parties d'un joueur de club. Rédige un petit "
        "digest de coaching en français (5-8 lignes), bienveillant, concret, avec un conseil "
        "actionnable. N'invente aucune donnée : utilise uniquement ces faits.\n\n"
        f"Faits : {summary}"
    )
    try:
        res = await model.ainvoke(prompt)
        usage = res.response_metadata.get("usage", {})
        return res.content or "", usage
    except Exception as exc:  # noqa: BLE001
        logger.warning("Narration LLM indisponible (%s) — gabarit", exc)
        return template_narrative(facts, username), {}


async def generate_digest(db: aiosqlite.Connection, username: str, model=None, days: int = 7) -> dict:
    # Recalcule le profil : produit un snapshot d'historique quotidien (courbe Elo).
    try:
        from .profile import get_profile

        profile = await get_profile(db, username, recompute=True)
    except Exception as exc:  # noqa: BLE001
        logger.warning("Profil indisponible pour le digest : %s", exc)
        profile = {}
    facts = await compute_facts(db, username, days)
    facts["profile"] = {
        "elo": profile.get("rating", {}).get("latest"),
        "trend_30d": profile.get("progress", {}).get("elo_trend"),
        "recommendations": profile.get("recommendations", []),
        "improving": profile.get("trends", {}).get("improving", []),
        "worsening": profile.get("trends", {}).get("worsening", []),
    }
    narrative, usage = ("", {})
    if model is not None:
        narrative, usage = await narrate_facts(model, facts, username)
    else:
        narrative = template_narrative(facts, username)
    period = date.today().isoformat()
    cur = await db.execute(
        """INSERT INTO digests (period, facts, narrative, status) VALUES (?,?,?,?)
           ON CONFLICT(id) DO NOTHING""",
        (period, json.dumps(facts, ensure_ascii=False, default=str), narrative, "done"),
    )
    await db.commit()
    return {"period": period, "facts": facts, "narrative": narrative, "usage": usage}
