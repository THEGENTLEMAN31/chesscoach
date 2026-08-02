from pydantic import BaseModel, Field


class PositionConfig(BaseModel):
    depth: int = 18
    movetime: int = 2000
    multipv: int = 1


class PositionRequest(BaseModel):
    fen: str
    config: PositionConfig = Field(default_factory=PositionConfig)


class Score(BaseModel):
    cp: int | None = None
    mate: int | None = None


class Line(BaseModel):
    score: Score
    depth: int
    multipv: int
    pv: list[str]  # UCI moves
    nodes: int | None = None


class PositionResult(BaseModel):
    fen: str
    lines: list[Line]
    bestmove: str | None = None
    from_cache: bool = False


class GameRequest(BaseModel):
    game_id: str
    fen_start: str
    ucis: list[str]
    config: PositionConfig = Field(default_factory=PositionConfig)


class GameResult(BaseModel):
    game_id: str
    positions: list[PositionResult]


class LineRequest(BaseModel):
    fen: str
    ucis: list[str]
    config: PositionConfig = Field(default_factory=PositionConfig)


class JobStatus(BaseModel):
    job_id: str
    status: str  # pending | running | done | error
    error: str | None = None
