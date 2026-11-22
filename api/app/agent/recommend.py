"""Algorithme de recommandation d'exercices (déterministe).

Deux briques éprouvées, volontairement simples (pas de sur-ingénierie) :
- sélection : score borné = faiblesse du concept x sévérité x récence x échéance
  de révision x (1 - maîtrise), avec un départage déterministe par jour ;
- planification : SM-2 simplifié (intervalle 1 -> 3 -> x ease, échec = reset).
"""
from __future__ import annotations

import hashlib
from datetime import datetime, timedelta, timezone


def clamp(x: float, lo: float, hi: float) -> float:
    return max(lo, min(hi, x))


def concept_weights(counts: dict[str, int]) -> dict[str, float]:
    """Poids relatif de chaque concept (1.0 pour le plus fréquent)."""
    if not counts:
        return {}
    mx = max(counts.values()) or 1
    return {k: v / mx for k, v in counts.items()}


def mastery(correct: int, wrong: int) -> float:
    """Maîtrise lissée (Laplace) : évite 0/0 et 100 % sur un seul essai."""
    return (correct + 1.0) / (correct + wrong + 2.0)


def due_factor(card: dict | None, now: datetime) -> float:
    """Facteur d'échéance de révision.
    1.0 = jamais vue ; 0.15 = pas encore due ; 1+ au fil du retard."""
    if not card:
        return 1.0
    nd = card.get("next_due_at")
    if not nd:
        return 0.8
    try:
        due = datetime.fromisoformat(nd)
    except (ValueError, TypeError):
        return 0.8
    if due.tzinfo is None:
        due = due.replace(tzinfo=timezone.utc)
    if due <= now:
        interval = max(1, int(card.get("interval_days") or 1))
        late = (now - due).total_seconds() / 86400.0
        return 1.0 + clamp(late / interval, 0.0, 1.0)
    return 0.15


def score_candidate(*, loss: float | None, concept_w: float, age_days: float,
                    due: float, mastery_v: float) -> float:
    """Score borné. Une seule échelle, pas de constantes additives arbitraires."""
    severity = clamp((loss or 0.0) / 50.0, 0.0, 1.0)
    recency = 0.5 ** (max(0.0, age_days) / 14.0)
    return 100.0 * concept_w * severity * max(recency, 0.05) * max(due, 0.15) * max(1.0 - mastery_v, 0.05)


def tiebreak(today: str, game_id: int, ply: int) -> str:
    """Départage déterministe et stable intra-journée."""
    return hashlib.md5(f"{today}:{game_id}:{ply}".encode()).hexdigest()


def sm2_update(card: dict | None, correct: bool, now: datetime) -> dict:
    """SM-2 simplifié : renvoie les nouveaux champs de la carte."""
    if card:
        interval = int(card.get("interval_days") or 0)
        ease = float(card.get("ease") or 2.5)
        reps = int(card.get("reps") or 0)
        lapses = int(card.get("lapses") or 0)
    else:
        interval, ease, reps, lapses = 0, 2.5, 0, 0
    if correct:
        reps += 1
        if reps == 1:
            interval = 1
        elif reps == 2:
            interval = 3
        else:
            interval = max(1, round(interval * ease))
        ease = min(3.0, ease + 0.1)
    else:
        reps = 0
        interval = 1
        ease = max(1.3, ease - 0.2)
        lapses += 1
    next_due = (now + timedelta(days=interval)).isoformat(timespec="seconds")
    return {"interval_days": interval, "ease": ease, "reps": reps,
            "lapses": lapses, "next_due_at": next_due}
