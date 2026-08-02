"""Parsing des PGN chess.com : coups, commentaires, horloges ({[%clk ...]}).

python-chess garantit la légalité ; on en extrait les métadonnées utiles
(temps restant avant chaque coup) et la liste des FEN.
"""
from __future__ import annotations

import io
import re

import chess
import chess.pgn

from .schemas import MoveInfo, ParsedGame

CLK_RE = re.compile(r"\[%clk (?:(\d+):)?(\d+):(\d+(?:\.\d+)?)\]")


def _parse_clock(comment: str) -> float | None:
    m = CLK_RE.search(comment)
    if not m:
        return None
    h, mm, ss = m.group(1), m.group(2), m.group(3)
    h = int(h) if h else 0
    return h * 3600 + int(mm) * 60 + float(ss)


def _color_of_ply(ply: int) -> str:
    return "w" if ply % 2 == 0 else "b"


def parse_pgn(pgn: str) -> ParsedGame:
    game = chess.pgn.read_game(io.StringIO(pgn))
    if game is None:
        raise ValueError("PGN illisible")

    parsed = ParsedGame(headers=dict(game.headers))
    board = game.board()
    node = game
    ply = 0
    while node.variations:
        node = node.variations[0]
        comment = node.comment or ""
        moves = parsed.moves
        moves.append(
            MoveInfo(
                ply=ply,
                san=node.san(),
                uci=node.move.uci(),
                comment=comment,
                clk=_parse_clock(comment),
                fen_before=board.fen(),
            )
        )
        board.push(node.move)
        ply += 1

    parsed.fen_start = parsed.moves[0].fen_before if parsed.moves else parsed.fen_start
    parsed.eco = parsed.headers.get("ECO", "")
    parsed.opening_name = parsed.headers.get("Opening", "")

    # Déduction des temps de réflexion (delta d'horloge entre deux coups du
    # même joueur). La couleur d'un coup = parité du ply (0 = Blancs).
    last_clk: dict[str, float | None] = {"w": None, "b": None}
    for m in parsed.moves:
        color = _color_of_ply(m.ply)
        m.color = color
        prev = last_clk[color]
        if prev is not None and m.clk is not None:
            m.time_taken = round(max(0.0, prev - m.clk), 1)
        last_clk[color] = m.clk

    return parsed
