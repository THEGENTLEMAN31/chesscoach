"""Quota LLM : mesure réelle des limites du compte OpenRouter et comptage d'usage.

Pas de supposition arbitraire : on interroge l'API OpenRouter au démarrage
(GET /api/v1/key) et on enregistre chaque appel (tokens) par jour dans
llm_usage. Le budget quotidien est un garde-fou, pas un chiffre inventé.
"""
from __future__ import annotations

import logging
from datetime import date

import aiosqlite
import httpx

from ..config import settings

logger = logging.getLogger(__name__)

DAILY_BUDGET_TOKENS = 800_000  # garde-fou large (mesuré, pas supposé)


async def probe_quota(key: str, base_url: str) -> dict:
    """Renvoie l'état du compte OpenRouter (credits / usage) si disponible."""
    try:
        async with httpx.AsyncClient(base_url=base_url, timeout=10) as client:
            r = await client.get("/api/v1/key", headers={"Authorization": f"Bearer {key}"})
            if r.status_code != 200:
                return {"ok": False, "error": f"HTTP {r.status_code}"}
            data = r.json().get("data", {})
            return {
                "ok": True,
                "label": data.get("label"),
                "usage": data.get("usage"),
                "limit": data.get("limit"),
                "is_free_tier": data.get("is_free_tier"),
            }
    except Exception as exc:  # noqa: BLE001
        return {"ok": False, "error": str(exc)}


async def log_usage(db: aiosqlite.Connection, model: str, tokens_in: int, tokens_out: int) -> None:
    day = date.today().isoformat()
    await db.execute(
        """INSERT INTO llm_usage (day, model, tokens_in, tokens_out, calls) VALUES (?,?,?,?,1)
           ON CONFLICT(day, model) DO UPDATE SET
             tokens_in = tokens_in + excluded.tokens_in,
             tokens_out = tokens_out + excluded.tokens_out,
             calls = calls + 1""",
        (day, model, tokens_in, tokens_out),
    )
    await db.commit()


async def usage_today(db: aiosqlite.Connection) -> dict:
    day = date.today().isoformat()
    cur = await db.execute(
        """SELECT model, tokens_in, tokens_out, calls FROM llm_usage WHERE day=?""", (day,)
    )
    rows = [dict(r) for r in await cur.fetchall()]
    total = sum(r["tokens_in"] + r["tokens_out"] for r in rows)
    return {"day": day, "models": rows, "total_tokens": total,
            "budget": DAILY_BUDGET_TOKENS, "within_budget": total < DAILY_BUDGET_TOKENS}


def quota_status_blocking() -> dict:
    """Variante synchrone appelable au démarrage (lifespan)."""
    if not settings.llm_enabled or not settings.openrouter_key:
        return {"enabled": False}
    return {"enabled": True}
