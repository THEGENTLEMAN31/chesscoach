from __future__ import annotations

from dataclasses import dataclass, field

from pydantic import BaseModel


# ------------------------------------------------------------------ moteur
class EvalPoint(BaseModel):
    cp: float | None = None
    mate: int | None = None


# ------------------------------------------------------------- parse PGN
@dataclass
class MoveInfo:
    ply: int          # 0-based index global
    san: str
    uci: str
    comment: str = ""
    clk: float | None = None  # secondes restantes avant le coup ({[%clk mm:ss.t]})
    fen_before: str = ""
    color: str = "w"
    time_taken: float | None = None


@dataclass
class ParsedGame:
    headers: dict[str, str] = field(default_factory=dict)
    moves: list[MoveInfo] = field(default_factory=list)
    fen_start: str = "rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1"
    eco: str = ""
    opening_name: str = ""


# ------------------------------------------------------------------- API
class SyncRequest(BaseModel):
    username: str | None = None
    months: int = 3  # 0 = tout


class SyncResult(BaseModel):
    run_id: int
    username: str
    games_seen: int
    games_new: int
    games_analyzed: int
    status: str


class ImportPly(BaseModel):
    ply: int
    move_number: int | None = None
    color: str | None = None
    san: str | None = None
    uci: str | None = None
    fen_before: str | None = None
    fen_after: str | None = None
    eval_before_cp: float | None = None
    mate_before: int | None = None
    eval_after_cp: float | None = None
    mate_after: int | None = None
    best_move_uci: str | None = None
    best_move_san: str | None = None
    cp_loss: float | None = None
    winprob_before: float | None = None
    winprob_after: float | None = None
    winprob_loss: float | None = None
    classification: str | None = None
    clk: float | None = None
    time_taken: float | None = None
    phase: str | None = None
    is_book: int = 0
    is_player: int = 0
    concept: str | None = None


class ImportGameRequest(BaseModel):
    """Partie analysée côté client (local-first) envoyée au serveur."""
    chesscom_id: int | None = None
    white: str
    black: str
    white_elo: int | None = None
    black_elo: int | None = None
    result: str
    player_color: str
    time_class: str
    time_control: str | None = None
    end_time: int | None = None
    eco: str | None = None
    opening_name: str | None = None
    termination: str | None = None
    fen_start: str | None = None
    pgn: str | None = None
    rules: str = "chess"
    plies: list[ImportPly]


class PlyOut(BaseModel):
    ply: int
    san: str | None
    uci: str | None = None
    fen_before: str
    fen_after: str | None = None
    eval_before: EvalPoint | None = None
    eval_after: EvalPoint | None = None
    best_move: str | None = None
    best_move_san: str | None = None
    cp_loss: float | None = None
    winprob_loss: float | None = None
    classification: str | None = None
    clk: float | None = None
    time_taken: float | None = None
    is_player: bool
    is_book: bool = False
    phase: str | None = None
    concept: str | None = None


class GameOut(BaseModel):
    id: int
    username: str
    white: str
    black: str
    white_elo: int | None
    black_elo: int | None
    result: str
    player_color: str
    time_class: str
    time_control: str | None
    end_time: int | None
    eco: str | None
    opening_name: str | None
    termination: str | None
    status: str
    accuracy: float | None
    acpl: float | None
    classifications: dict | None


class GamesPage(BaseModel):
    total: int
    items: list[GameOut]


class GameDetailOut(GameOut):
    plies: list[PlyOut] = []


class MoveOut(BaseModel):
    game_id: int
    ply: int
    move_number: int | None = None
    san: str | None = None
    classification: str | None = None
    winprob_loss: float | None = None
    cp_loss: float | None = None
    phase: str | None = None
    time_taken: float | None = None
    concept: str | None = None
    fen_before: str | None = None
    best_move_san: str | None = None
    end_time: int | None = None
    time_class: str | None = None
    result: str | None = None
    player_color: str | None = None
    opening_name: str | None = None
    eco: str | None = None
    white: str | None = None
    black: str | None = None


class EtudeAttempt(BaseModel):
    username: str
    time_class: str = "global"
    game_id: int | None = None
    ply: int | None = None
    fen: str
    san: str | None = None
    best_move_uci: str
    best_move_san: str | None = None
    concept: str | None = None
    attempt: str | None = None
    correct: bool = False
