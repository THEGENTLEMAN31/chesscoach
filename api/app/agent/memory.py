"""Mémoire longue durée : table coach_memory (profil, prescriptions, diagnostics, feedback).

Les entrées pertinentes sont injectées dans le prompt système à chaque tour ;
l'agent peut y écrire via l'outil memoire_ecrire.
"""
from __future__ import annotations

import aiosqlite
import json


KINDS = ("profile", "prescription", "diagnostic", "feedback", "note")


async def read_memory(db: aiosqlite.Connection, kinds: tuple[str, ...] = KINDS) -> list[dict]:
    q = "SELECT kind, content, source, created_at FROM coach_memory"
    params: list = []
    if kinds:
        q += " WHERE kind IN (%s)" % ",".join("?" * len(kinds))
        params = list(kinds)
    q += " ORDER BY id ASC"
    cur = await db.execute(q, params)
    return [dict(r) for r in await cur.fetchall()]


async def write_memory(db: aiosqlite.Connection, kind: str, content: str, source: str = "agent") -> int:
    if kind not in KINDS:
        raise ValueError(f"kind inconnu: {kind}")
    cur = await db.execute(
        "INSERT INTO coach_memory (kind, content, source) VALUES (?,?,?)",
        (kind, content, source),
    )
    await db.commit()
    return cur.lastrowid


def memory_to_prompt(entries: list[dict]) -> str:
    """Met en forme les souvenirs pour le prompt système (aucun LLM ici)."""
    if not entries:
        return "Aucun souvenir enregistré pour l'instant."
    parts = []
    for e in entries:
        icon = {
            "profile": "Profil",
            "prescription": "Prescription",
            "diagnostic": "Diagnostic",
            "feedback": "Retour du joueur",
            "note": "Note",
        }.get(e["kind"], e["kind"])
        parts.append(f"- [{icon}] {e['content']}")
    return "\n".join(parts)


def dumps_facts(facts: dict) -> str:
    return json.dumps(facts, ensure_ascii=False)
