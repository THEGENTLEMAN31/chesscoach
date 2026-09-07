"""Livre d'ouvertures (lichess-org/chess-openings, CC0) : epd -> (eco, name).

Construction à l'import : pour chaque ligne `eco \\t name \\t pgn`, on rejoue
le PGN et on indexe l'EPD finale. La correspondance par EPD gère les
transpositions (même position atteinte par des coups différents).
"""
from __future__ import annotations

import io
import logging
from pathlib import Path

import chess
import chess.pgn

logger = logging.getLogger(__name__)

DEFAULT_DIR = Path("/app/openings")
if not DEFAULT_DIR.exists():
    DEFAULT_DIR = Path(__file__).resolve().parent.parent / "data" / "openings"
BOOK_DIR = DEFAULT_DIR


def epd_of(fen: str) -> str:
    return " ".join(fen.split()[:4])


class OpeningBook:
    def __init__(self, directory: Path = BOOK_DIR) -> None:
        self._by_epd: dict[str, tuple[str, str]] = {}
        self._loaded = False

    def load(self) -> None:
        for letter in "abcde":
            path = self._directory() / f"{letter}.tsv"
            if not path.exists():
                continue
            with path.open() as fh:
                header = fh.readline()
                for line in fh:
                    parts = line.rstrip("\n").split("\t")
                    if len(parts) != 3:
                        continue
                    eco, name, pgn = parts
                    try:
                        game = chess.pgn.read_game(io.StringIO(pgn))
                    except Exception:
                        continue
                    if game is None:
                        continue
                    board = game.board()
                    for node in game.mainline():
                        board.push(node.move)
                    self._by_epd[epd_of(board.fen())] = (eco, name)
        self._loaded = True
        logger.info("Livre d'ouvertures chargé : %s positions", len(self._by_epd))

    def _directory(self) -> Path:
        return BOOK_DIR

    def classify_fens(self, fens: list[str]) -> tuple[str, str, int] | None:
        """Renvoie (eco, nom, pli_max) de la plus profonde position connue."""
        best: tuple[str, str, int] | None = None
        for i, fen in enumerate(fens):
            entry = self._by_epd.get(epd_of(fen))
            if entry and (best is None or i > best[2]):
                best = (entry[0], entry[1], i)
        return best
