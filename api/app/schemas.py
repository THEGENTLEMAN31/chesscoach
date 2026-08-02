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


class PlyOut(BaseModel):
    ply: int
    san: str | None
    fen_before: str
    eval_before: EvalPoint | None = None
    eval_after: EvalPoint | None = None
    best_move: str | None = None
    cp_loss: float | None = None
    classification: str | None = None
    clk: float | None = None
    is_player: bool
    phase: str | None = None


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


class GameDetailOut(GameOut):
    plies: list[PlyOut] = []
