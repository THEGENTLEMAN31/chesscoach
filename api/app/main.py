"""API du coach d'échecs — FastAPI.

Expose les données analysées (parties, coups, stats) et déclenche le pipeline
nocturne. Le LLM n'intervient nulle part ici : tout est déterministe.
"""
from __future__ import annotations

import asyncio
import json
import logging
from contextlib import asynccontextmanager

import aiosqlite
from fastapi import FastAPI, HTTPException, Query
from pydantic import BaseModel
from sse_starlette.sse import EventSourceResponse

from .analysis_client import AnalyzerClient
from .chesscom import ChessComClient
from .config import settings
from .db import init_db
from .openings import OpeningBook
from .schemas import GameDetailOut, GameOut, SyncRequest, SyncResult
from .services.manager import SyncManager

logging.basicConfig(level=logging.INFO)
logger = logging.getLogger(__name__)


class ChatRequest(BaseModel):
    message: str
    thread_id: str = "default"


@asynccontextmanager
async def lifespan(app: FastAPI):
    app.state.db = await init_db(settings.db_dir / "chesscoach.db")
    app.state.chesscom = ChessComClient()
    app.state.analyzer = AnalyzerClient()
    app.state.book = OpeningBook()
    await asyncio.to_thread(app.state.book.load)
    app.state.manager = SyncManager(
        app.state.db, app.state.chesscom, app.state.analyzer, app.state.book
    )
    logger.info("API prête (book=%s positions)", len(app.state.book._by_epd))

    # --- agent LLM (facultatif, mesure le quota réel au démarrage) ---
    app.state.agent = None
    app.state.quota = {"enabled": False}
    app.state.nightly_task = None
    if settings.llm_enabled and settings.openrouter_key:
        from .agent.graph import ChessCoachAgent
        from .agent.quota import probe_quota
        from .agent.tools import AgentContext

        memory_db = await aiosqlite.connect(str(settings.db_dir / "chesscoach.db"))
        memory_db.row_factory = aiosqlite.Row
        app.state.memory_db = memory_db

        quota = await probe_quota(settings.openrouter_key, settings.openrouter_base_url)
        app.state.quota = quota
        logger.info("Quota OpenRouter mesuré : %s", quota)

        ctx = AgentContext(db=app.state.db, analyzer=app.state.analyzer,
                           chesscom=app.state.chesscom,
                           username=settings.coach_username,
                           sync_manager=app.state.manager)
        app.state.agent = ChessCoachAgent(ctx, memory_db)

        async def nightly_loop():
            from .agent.digest import generate_digest

            while True:
                try:
                    cur = await app.state.db.execute(
                        "SELECT COUNT(*) AS n FROM digests WHERE period=date('now') AND status='done'"
                    )
                    row = await cur.fetchone()
                    if not row or not row["n"]:
                        await generate_digest(app.state.db, settings.coach_username,
                                              model=app.state.agent._model)
                        logger.info("Digest du jour généré")
                except Exception as exc:  # noqa: BLE001
                    logger.warning("Digest échoué : %s", exc)
                await asyncio.sleep(3600)

        app.state.nightly_task = asyncio.create_task(nightly_loop())
        logger.info("Agent LLM activé (modèle=%s)", settings.openrouter_model)
    else:
        logger.info("Agent LLM désactivé (LLM_ENABLED=%s)", settings.llm_enabled)

    yield
    if app.state.nightly_task:
        app.state.nightly_task.cancel()
    if getattr(app.state, "memory_db", None):
        await app.state.memory_db.close()
    await app.state.analyzer.aclose()
    await app.state.chesscom.aclose()
    await app.state.db.close()


app = FastAPI(title="ChessCoach API", version="0.1.0", lifespan=lifespan)


def _db():
    return app.state.db


def _game_from_row(r) -> GameOut:
    data = dict(r)
    data["classifications"] = json.loads(data["classifications"]) if data.get("classifications") else None
    return GameOut(**data)


@app.get("/health")
async def health() -> dict:
    row = await (await _db().execute("SELECT 1")).fetchone()
    return {"ok": row is not None}


# ---------------------------------------------------------------- sync
@app.post("/api/sync", response_model=SyncResult, status_code=202)
async def sync(req: SyncRequest) -> SyncResult:
    username = req.username or settings.coach_username
    if not username:
        raise HTTPException(400, "username requis")
    result = await app.state.manager.start(username, req.months)
    if result.get("status") == "already_running":
        raise HTTPException(409, "un pipeline est déjà en cours")
    return SyncResult(**result)


@app.get("/api/sync/status")
async def sync_status() -> dict:
    return await app.state.manager.status(settings.coach_username)


# --------------------------------------------------------------- games
@app.get("/api/games", response_model=list[GameOut])
async def list_games(
    username: str = Query(settings.coach_username),
    time_class: str | None = None,
    status: str | None = None,
    limit: int = Query(50, ge=1, le=500),
    offset: int = Query(0, ge=0),
) -> list[GameOut]:
    sql = "SELECT * FROM games WHERE username=?"
    params: list = [username]
    if time_class:
        sql += " AND time_class=?"
        params.append(time_class)
    if status:
        sql += " AND status=?"
        params.append(status)
    sql += " ORDER BY end_time DESC LIMIT ? OFFSET ?"
    params += [limit, offset]
    cursor = await _db().execute(sql, params)
    return [_game_from_row(r) for r in await cursor.fetchall()]


@app.get("/api/games/{game_id}", response_model=GameDetailOut)
async def get_game(game_id: int) -> GameDetailOut:
    cursor = await _db().execute("SELECT * FROM games WHERE id=?", (game_id,))
    row = await cursor.fetchone()
    if not row:
        raise HTTPException(404, "partie introuvable")
    game = _game_from_row(row)

    plies = []
    cur = await _db().execute(
        """SELECT ply, san, uci, fen_before, fen_after, eval_before_cp, mate_before, eval_after_cp,
                  mate_after, best_move_uci, best_move_san, cp_loss, winprob_loss, classification,
                  clk, time_taken, is_player, phase, is_book
           FROM plies WHERE game_id=? ORDER BY ply""", (game_id,)
    )
    for p in await cur.fetchall():
        # Le moteur exprime cp/mat du point de vue du camp au trait : on
        # normalise côté Blancs pour l'affichage (ev_before = trait du coup,
        # ev_after = trait adverse).
        stm_b = "w" if p["ply"] % 2 == 0 else "b"
        stm_a = "b" if stm_b == "w" else "w"

        def _white_side(score, mate, stm):
            cp = score
            if cp is not None:
                cp = cp if stm == "w" else -cp
            if mate is not None:
                mate = mate if stm == "w" else -mate
            return {"cp": cp, "mate": mate}

        plies.append({
            "ply": p["ply"],
            "san": p["san"],
            "uci": p["uci"],
            "fen_before": p["fen_before"],
            "fen_after": p["fen_after"],
            "eval_before": _white_side(p["eval_before_cp"], p["mate_before"], stm_b),
            "eval_after": _white_side(p["eval_after_cp"], p["mate_after"], stm_a),
            "best_move": p["best_move_uci"],
            "best_move_san": p["best_move_san"],
            "cp_loss": p["cp_loss"],
            "winprob_loss": p["winprob_loss"],
            "classification": p["classification"],
            "clk": p["clk"],
            "time_taken": p["time_taken"],
            "is_player": bool(p["is_player"]),
            "is_book": bool(p["is_book"]),
            "phase": p["phase"],
        })
    return GameDetailOut(**game.model_dump(), plies=plies)


@app.get("/api/games/{game_id}/pgn")
async def get_pgn(game_id: int) -> dict:
    cursor = await _db().execute("SELECT pgn FROM games WHERE id=?", (game_id,))
    row = await cursor.fetchone()
    if not row:
        raise HTTPException(404, "partie introuvable")
    return {"pgn": row["pgn"]}


# --------------------------------------------------------------- stats
@app.get("/api/stats")
async def stats(username: str = settings.coach_username) -> dict:
    db = _db()
    cur = await db.execute(
        """SELECT time_class,
                  COUNT(*) AS n,
                  ROUND(AVG(accuracy),1) AS avg_acc,
                  ROUND(AVG(acpl),1) AS avg_acpl,
                  SUM(CASE WHEN result LIKE '1/2%' THEN 1 ELSE 0 END) AS draws,
                  SUM(CASE WHEN result LIKE '%1-0%' AND player_color='w' THEN 1
                           WHEN result LIKE '%0-1%' AND player_color='b' THEN 1
                           ELSE 0 END) AS wins
           FROM games WHERE username=? AND status='analyzed'
           GROUP BY time_class ORDER BY n DESC""", (username,)
    )
    by_class = []
    for r in await cur.fetchall():
        by_class.append({
            "time_class": r["time_class"], "games": r["n"], "accuracy": r["avg_acc"],
            "acpl": r["avg_acpl"], "wins": r["wins"], "draws": r["draws"],
            "losses": r["n"] - r["wins"] - r["draws"],
        })

    cur = await db.execute(
        """SELECT classification AS cls, COUNT(*) AS n
           FROM plies WHERE is_player=1 AND classification IS NOT NULL
           GROUP BY classification ORDER BY n DESC""", ()
    )
    cls_counts = {r["cls"]: r["n"] for r in await cur.fetchall()}

    cur = await db.execute(
        """SELECT eco, opening_name, COUNT(*) AS n
           FROM games WHERE username=? AND status='analyzed' AND eco IS NOT NULL
           GROUP BY eco, opening_name ORDER BY n DESC LIMIT 10""", (username,)
    )
    openings = [dict(r) for r in await cur.fetchall()]

    cur = await db.execute(
        """SELECT ROUND(AVG(winprob_loss),1) AS blunder_acpl,
                  ROUND(AVG(cp_loss),1) AS avg_cp_loss
           FROM plies WHERE is_player=1 AND winprob_loss IS NOT NULL""", ()
    )
    sr = await cur.fetchone()

    return {"by_time_class": by_class, "move_classifications": cls_counts,
            "openings": openings, "totals": dict(sr)}


@app.get("/api/players")
async def players() -> list[dict]:
    cur = await _db().execute(
        "SELECT username, is_active, last_analyzed_at FROM players ORDER BY last_analyzed_at DESC"
    )
    return [dict(r) for r in await cur.fetchall()]


# --------------------------------------------------------------- chat
@app.get("/api/chat/status")
async def chat_status() -> dict:
    from .agent.quota import usage_today

    enabled = app.state.agent is not None
    usage = await usage_today(_db()) if enabled else None
    return {"enabled": enabled, "model": settings.openrouter_model,
            "quota": app.state.quota, "usage": usage}


@app.post("/api/chat")
async def chat(req: ChatRequest):
    if not req.message.strip():
        raise HTTPException(400, "message vide")
    agent = app.state.agent
    if agent is None:
        return {"text": (
            "Le coach LLM n'est pas activé (LLM_ENABLED=false). "
            "Vous pouvez quand même consulter le tableau de bord et la revue de parties."
        )}

    from .agent.quota import usage_today

    usage = await usage_today(_db())
    if not usage["within_budget"]:
        return {"text": "Budget LLM quotidien atteint — repasse demain."}

    async def gen():
        yield {"event": "start", "data": json.dumps({"thread_id": req.thread_id})}
        parts: list[str] = []
        try:
            async for chunk in agent.stream(req.thread_id, req.message):
                parts.append(chunk)
                yield {"event": "token", "data": chunk}
        except Exception as exc:  # noqa: BLE001
            logger.exception("Chat en échec")
            yield {"event": "error", "data": json.dumps({"error": str(exc)[:500]})}
            return
        full = "".join(parts)
        yield {"event": "done", "data": json.dumps({"text": full})}

    return EventSourceResponse(gen())


# -------------------------------------------------------------- digest
@app.post("/api/digest/generate")
async def digest_generate() -> dict:
    from .agent.digest import generate_digest

    result = await generate_digest(
        _db(), settings.coach_username,
        model=app.state.agent._model if app.state.agent else None,
    )
    return result


@app.get("/api/digest/latest")
async def digest_latest() -> dict:
    cur = await _db().execute(
        "SELECT period, facts, narrative, created_at FROM digests ORDER BY id DESC LIMIT 1"
    )
    row = await cur.fetchone()
    if not row:
        return {"period": None, "facts": None, "narrative": None}
    return {"period": row["period"], "facts": json.loads(row["facts"] or "{}"),
            "narrative": row["narrative"], "created_at": row["created_at"]}


if __name__ == "__main__":
    import uvicorn

    uvicorn.run("app.main:app", host="0.0.0.0", port=8001)
