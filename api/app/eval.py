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


def has_score(eval_point: EvalPoint) -> bool:
    """Vrai si le moteur a produit une évaluation (cp ou mat) pour la position."""
    return eval_point.mate is not None or eval_point.cp is not None


def win_prob(eval_point: EvalPoint, stm: str, side: str) -> float:
    """Probabilité de gain (0-100) du côté `side` à partir d'une évaluation
    moteur exprimée du point de vue du camp au trait (`stm`), comme l'exige
    le protocole UCI (score cp/mat positifs = avantage/mat pour le trait)."""
    if eval_point.mate is not None:
        stm_wins = eval_point.mate > 0
        if side == stm:
            return 100.0 if stm_wins else 0.0
        return 0.0 if stm_wins else 100.0
    cp = eval_point.cp
    if cp is None:
        # position terminale sans évaluation (ex. mat livré) : neutre
        return 50.0
    # score STM -> score côté Blancs -> score côté `side`
    cp_w = cp if stm == "w" else -cp
    if side == "b":
        cp_w = -cp_w
    return max(0.0, min(100.0, 100.0 / (1.0 + 10 ** (-cp_w / 400.0))))


def classify(
    eval_before: EvalPoint,
    eval_after: EvalPoint,
    side: str,
    wp_before: float | None = None,
    wp_after: float | None = None,
) -> tuple[str, float, float, float]:
    """Classe le coup joué. Renvoie (classification, wp_avant, wp_après, perte).

    `wp_before`/`wp_after` peuvent être fournis par l'appelant pour surcharger
    le calcul (utile quand l'évaluation après coup est absente : on considère
    alors une probabilité inchangée plutôt qu'une chute arbitraire).
    """
    if wp_before is None:
        wp_before = win_prob(eval_before, side, side)
    if wp_after is None:
        wp_after = win_prob(eval_after, "w" if side == "b" else "b", side)
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
