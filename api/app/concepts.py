"""Détection déterministe des CONCEPTS derrière chaque erreur.

C'est la brique « Niveau 2-3 » : au lieu de dire « Qe5?? » (sympton), on cherche
la CAUSE conceptuelle. Le travail se fait sur la position (fen_before), le coup
joué et le coup du moteur — aucune évaluation n'est inventée ici.

Catalogues (clé -> famille -> libellé pédagogique) :
    - tactique          : pièce en prise, prise manquée, fourchette, clouage,
                          mat manqué, coup candidat manqué
    - sécurité du roi   : mat subi, mat première rangée, roque manqué
    - structure         : faiblesse de pions (isolés, doublés)
    - finale            : promotion manquée, pion passé négligé
    - ouverture         : développement insuffisant
    - prophylaxie       : menace adverse négligée

Rien ici ne dépend du LLM : tout est calculé sur les colonnes déjà stockées.
"""
from __future__ import annotations

from dataclasses import dataclass

import chess

PIECE_VALUE = {
    chess.PAWN: 1,
    chess.KNIGHT: 3,
    chess.BISHOP: 3,
    chess.ROOK: 5,
    chess.QUEEN: 9,
    chess.KING: 100,
}

CONCEPTS: dict[str, tuple[str, str]] = {
    # key: (famille, libellé)
    "hanging_piece": ("tactique", "Pièce en prise"),
    "missed_capture": ("tactique", "Prise manquée"),
    "fork": ("tactique", "Fourchette"),
    "pin_moved": ("tactique", "Pièce clouée déplacée"),
    "pin_missed": ("tactique", "Clouage manqué"),
    "missed_mate": ("tactique", "Mat manqué"),
    "candidate": ("tactique", "Coup candidat manqué"),
    "allowed_mate": ("sécurité du roi", "Mat subi"),
    "back_rank": ("sécurité du roi", "Mat de la première rangée"),
    "roque_missed": ("sécurité du roi", "Roque manqué"),
    "pawn_structure": ("structure", "Faiblesse de pions"),
    "promotion": ("finale", "Promotion manquée"),
    "passed_pawn": ("finale", "Pion passé négligé"),
    "development": ("ouverture", "Développement insuffisant"),
    "threat_ignored": ("prophylaxie", "Menace adverse négligée"),
}


@dataclass
class ConceptResult:
    concepts: list[str]
    primary: str | None
    causes: list[str]


def _hanging_squares(board: chess.Board, color: chess.Color) -> set:
    """Cases du camp `color` dont la pièce est attaquable sans perte (pièce en prise)."""
    enemy = not color
    hanging: set = set()
    for sq in board.piece_map():
        if board.color_at(sq) != color:
            continue
        attackers = board.attackers(enemy, sq)
        if not attackers:
            continue
        v = PIECE_VALUE[board.piece_type_at(sq)]
        profitable = any(
            PIECE_VALUE[board.piece_type_at(a)] <= v for a in attackers
        )
        if not profitable:
            continue
        # défense par une pièce de valeur <= ? alors la séquence est juste un échange
        defenders = board.attackers(color, sq)
        if defenders and any(
            PIECE_VALUE[board.piece_type_at(d)] <= v for d in defenders
        ):
            continue
        hanging.add(sq)
    return hanging


def _attacked_enemy_values(board: chess.Board, from_sq: int, color: chess.Color) -> list[int]:
    """Valeurs des pièces ennemies attaquées par la pièce située en from_sq."""
    atk = board.attacks(from_sq)  # attaques pseudo-légales de la pièce en from_sq
    return [
        PIECE_VALUE[board.piece_type_at(to)]
        for to in atk
        if board.color_at(to) is not None and board.color_at(to) != color
    ]


def _is_fork(board: chess.Board, from_sq: int, color: chess.Color) -> bool:
    """Vrai si la pièce en from_sq est une fourchette crédible (≥2 cibles)."""
    atk = _attacked_enemy_values(board, from_sq, color)
    if len(atk) < 2:
        return False
    piece = board.piece_type_at(from_sq)
    # cavalier/fou/pion : fourchette classique dès 2 cibles
    if piece in (chess.KNIGHT, chess.BISHOP, chess.PAWN):
        return True
    # pièce lourde : double attaque réelle sur roi/dame ou 3+ cibles
    return len(atk) >= 3 or max(atk, default=0) >= 9


def _pawn_issues(board: chess.Board, color: chess.Color) -> tuple[int, int]:
    """(pions isolés, pions doublés) du camp `color`."""
    by_file: dict[int, list] = {}
    for sq in board.pieces(chess.PAWN, color):
        by_file.setdefault(chess.square_file(sq), []).append(sq)
    files = set(by_file)
    iso = sum(1 for f in files if (f - 1) not in files and (f + 1) not in files)
    doub = sum(1 for f in files if len(by_file[f]) > 1)
    return iso, doub


def _is_passed(board: chess.Board, color: chess.Color, sq: int) -> bool:
    f = chess.square_file(sq)
    r = chess.square_rank(sq)
    step = 1 if color == chess.WHITE else -1
    r_from = r + step
    r_to = 8 if color == chess.WHITE else -1
    for rf in range(r_from, r_to, step):
        for ff in (f - 1, f, f + 1):
            if 0 <= ff < 8:
                t = board.piece_at(chess.square(ff, rf))
                if t and t.piece_type == chess.PAWN and t.color != color:
                    return False
    return True


def _king_on_back_rank(board: chess.Board, color: chess.Color) -> bool:
    king = board.king(color)
    if king is None:
        return False
    rank = chess.square_rank(king)
    if color == chess.WHITE:
        return rank == 0
    return rank == 7


def _back_rank_threat(board: chess.Board, color: chess.Color) -> bool:
    """Mat de la première rangée : roi enfermé sur la dernière rangée, sans
    échappatoire en avant, et pièce lourde adverse (tour/dame) sur la 7e/8e
    rangée prête à frapper. Heuristique volontairement stricte pour éviter
    de crier au loup sur chaque milieu de partie."""
    king = board.king(color)
    if king is None or not _king_on_back_rank(board, color):
        return False
    kf = chess.square_file(king)
    kr = chess.square_rank(king)
    fwd = 1 if color == chess.WHITE else -1
    for df in (-1, 0, 1):
        ff = kf + df
        if not 0 <= ff < 8:
            continue
        p = board.piece_at(chess.square(ff, kr + fwd))
        # une échappatoire (case vide ou pièce ennemie qui contrôle) => pas un mat de 1re rangée
        if p is None or p.color != color:
            return False
    enemy = not color
    for sq in board.pieces(chess.ROOK, enemy) | board.pieces(chess.QUEEN, enemy):
        r = chess.square_rank(sq)
        # pièce lourde adverse déjà sur la rangée de mat (8e pour le roi blanc,
        # 1re pour le roi noir), prête à descendre dans la colonne.
        if (color == chess.WHITE and r == 7) or (color == chess.BLACK and r == 0):
            return True
    return False


def _opponent_sacrifice(fen_before: str, opponent_san: str | None) -> bool:
    """Vrai si le coup adverse juste avant est un sacrifice matériel (x gagne <)."""
    if not opponent_san or "x" not in opponent_san or not fen_before:
        return False
    try:
        b = chess.Board(fen_before)
        mv = b.parse_san(opponent_san)
    except (ValueError, IndexError):
        return False
    if not b.is_capture(mv):
        return False
    cap = b.piece_type_at(mv.to_square)  # pièce prise
    if cap is None or cap == chess.PAWN:
        return False
    attacker = b.piece_type_at(mv.from_square)
    if attacker is None:
        return False
    return PIECE_VALUE[attacker] < PIECE_VALUE[cap]


def analyze_error(
    *,
    fen_before: str,
    san: str,
    uci: str | None,
    best_uci: str | None,
    best_san: str | None,
    mate_before: int | None,
    mate_after: int | None,
    phase: str | None,
    color: str,
    time_taken: float | None,
    winprob_before: float | None,
    opponent_san: str | None = None,
    opponent_fen: str | None = None,
    is_near_book_exit: bool = False,
    previous_was_error: bool = False,
) -> ConceptResult:
    """Analyse une erreur du joueur et renvoie concepts + causes racines."""
    side = chess.WHITE if color == "w" else chess.BLACK
    board = chess.Board(fen_before)

    concepts: list[str] = []
    causes: list[str] = []

    # ----------------------------------------------------------- mat
    if mate_before is not None and mate_before > 0:
        if best_uci and uci != best_uci:
            concepts.append("missed_mate")
    if mate_after is not None and mate_after > 0:
        concepts.append("allowed_mate")

    # ------------------------------------------------------- temps réel
    if time_taken is not None:
        if time_taken < 2:
            causes.append("temps_flag")
        elif time_taken < 5:
            causes.append("temps")

    # ------------------------------------------------ pièce en prise / prise
    hanging_before = _hanging_squares(board, side)
    if hanging_before and best_san:
        # le moteur sauve la pièce, le joueur ne l'a pas fait
        if best_san not in ("O-O", "O-O-O") and uci != best_uci:
            concepts.append("hanging_piece")
    if best_san and "x" in best_san and uci != best_uci:
        concepts.append("missed_capture")
    if not hanging_before and not (best_san and "x" in best_san):
        # coup joué qui laisse une pièce en prise dans la position résultante
        after = board.copy()
        try:
            after.push_uci(uci or "")
        except (ValueError, IndexError):
            pass
        else:
            if _hanging_squares(after, side):
                concepts.append("hanging_piece")

    # --------------------------------------------------------- fourchette
    if best_uci and uci != best_uci:
        try:
            probe = board.copy()
            mv = probe.parse_uci(best_uci)
            probe.push(mv)
            if _is_fork(probe, mv.to_square, side):
                concepts.append("fork")
        except (ValueError, IndexError):
            pass

    # ----------------------------------------------------------- clouage
    if uci:
        try:
            from_sq = chess.parse_square(uci[:2])
            if board.is_pinned(side, from_sq):
                concepts.append("pin_moved")
        except (ValueError, IndexError):
            pass
    if best_uci and uci != best_uci:
        try:
            probe = board.copy()
            mv = probe.parse_uci(best_uci)
            probe.push(mv)
            # le coup du moteur aurait cloué une pièce du joueur sur le roi/dame
            for sq in probe.pieces(chess.PAWN, side) | probe.pieces(chess.KNIGHT, side) | \
                    probe.pieces(chess.BISHOP, side) | probe.pieces(chess.ROOK, side) | \
                    probe.pieces(chess.QUEEN, side):
                if probe.is_pinned(side, sq):
                    concepts.append("pin_missed")
                    break
        except (ValueError, IndexError):
            pass

    # -------------------------------------------------- sécurité du roi
    if _back_rank_threat(board, side):
        concepts.append("back_rank")
    if best_san in ("O-O", "O-O-O") and uci != best_uci:
        concepts.append("roque_missed")

    # ------------------------------------------------------- structure
    if uci:
        after = board.copy()
        try:
            after.push_uci(uci)
        except (ValueError, IndexError):
            pass
        else:
            b_iso, b_doub = _pawn_issues(board, side)
            a_iso, a_doub = _pawn_issues(after, side)
            if a_iso > b_iso or a_doub > b_doub:
                concepts.append("pawn_structure")

    # ----------------------------------------------------------- finale
    if phase == "endgame":
        if best_san and "=" in best_san and uci != best_uci:
            concepts.append("promotion")
        if best_uci and uci != best_uci:
            try:
                mv = board.parse_uci(best_uci)
                if (
                    board.piece_type_at(mv.from_square) == chess.PAWN
                    and board.color_at(mv.from_square) == side
                    and _is_passed(board, side, mv.from_square)
                ):
                    concepts.append("passed_pawn")
            except (ValueError, IndexError):
                pass

    # ------------------------------------------------------ développement
    if phase == "opening":
        nb = sum(1 for sq in board.piece_map()
                 if board.color_at(sq) == side
                 and board.piece_type_at(sq) in (chess.KNIGHT, chess.BISHOP)
                 and ((side == chess.WHITE and chess.square_rank(sq) <= 1)
                      or (side == chess.BLACK and chess.square_rank(sq) >= 6)))
        if nb >= 2 and not (best_san in ("O-O", "O-O-O") and uci == best_uci):
            concepts.append("development")

    # -------------------------------------------------------- prophylaxie
    if hanging_before and not concepts and uci != best_uci:
        concepts.append("threat_ignored")

    # ---------------------------------------------- causes contextuelles
    if winprob_before is not None and winprob_before >= 80:
        causes.append("position_gagnante")
    if previous_was_error:
        causes.append("apres_erreur")
    if is_near_book_exit:
        causes.append("sortie_ouverture")
    if _opponent_sacrifice(opponent_fen or fen_before, opponent_san):
        causes.append("sacrifice_adverse")

    # fallback : toute erreur tient au moins d'un coup candidat manqué
    if not concepts:
        concepts.append("candidate")
    # dédupliquer en gardant l'ordre du catalogue
    concepts = list(dict.fromkeys(concepts))
    primary = concepts[0]

    # score de sévérité de la cause "temps"
    return ConceptResult(concepts=concepts, primary=primary, causes=list(dict.fromkeys(causes)))


def family(key: str) -> str:
    return CONCEPTS.get(key, ("?", key))[0]


def label(key: str) -> str:
    return CONCEPTS.get(key, (key, key))[1]
