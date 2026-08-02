"""Modèle d'évaluation : win-probability, classification, précision.

Déterministe, documenté, testable. C'est le fondement "honnête" du projet :
les seuils sont explicites et constants — aucune intervention du LLM ici.

Modèle de probabilité de gain : logistique standard
    wp(side) = 100 / (1 + 10^(-cp/400))
où cp est l'évaluation côté "side" (négatif si désavantage). Les mats sont
assimilés à 0 % ou 100 %.

Classification (style Lichess, simplifiée et documentée) : une perte de
probabilité de gain d'au moins
    20 points      -> blunder
    10 points      -> mistake
    5 points       -> inaccuracy
    2 points       -> good
    sinon          -> best
"""
from __future__ import annotations

from .schemas import EvalPoint

BEST = "best"
GOOD = "good"
INACCURACY = "inaccuracy"
MISTAKE = "mistake"
BLUNDER = "blunder"

CLASSIFICATION_ORDER = [BLUNDER, MISTAKE, INACCURACY, GOOD, BEST]

# notes par classification (pour la précision)
MOVE_SCORE = {BEST: 1.0, GOOD: 0.7, INACCURACY: 0.4, MISTAKE: 0.1, BLUNDER: 0.0}


def win_prob(eval_point: EvalPoint, side: str) -> float:
    """Probabilité de gain (0-100) du côté `side` ('w'/'b')."""
    cp = eval_point.cp
    if eval_point.mate is not None:
        if side == "w":
            return 100.0 if eval_point.mate > 0 else 0.0
        return 100.0 if eval_point.mate < 0 else 0.0
    # cp est toujours exprimé du point de vue Blancs par le moteur.
    if side == "b":
        cp = -cp
    return max(0.0, min(100.0, 100.0 / (1.0 + 10 ** (-cp / 400.0))))


def classify(eval_before: EvalPoint, eval_after: EvalPoint, side: str) -> tuple[str, float, float, float]:
    """Classe le coup joué. Renvoie (classification, wp_avant, wp_après, perte)."""
    wp_before = win_prob(eval_before, side)
    wp_after = win_prob(eval_after, side)
    loss = wp_before - wp_after
    if loss >= 20:
        cls = BLUNDER
    elif loss >= 10:
        cls = MISTAKE
    elif loss >= 5:
        cls = INACCURACY
    elif loss >= 2:
        cls = GOOD
    else:
        cls = BEST
    return cls, wp_before, wp_after, loss


def accuracy(scores: list[float]) -> float:
    """Précision (0-100) = moyenne pondérée des scores de coups du joueur."""
    if not scores:
        return 0.0
    return round(100.0 * sum(scores) / len(scores), 1)


def acpl_from_losses(losses: list[float]) -> float:
    """ACPL : moyenne des pertes de probabilité, bornée à 0 par coup
    (un coup meilleur que l'attente = gain, pas de perte négative)."""
    if not losses:
        return 0.0
    return round(sum(max(0.0, loss) for loss in losses) / len(losses), 1)
