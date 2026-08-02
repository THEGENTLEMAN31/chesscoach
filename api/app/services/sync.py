"""Pipeline "nuit" : sync chess.com -> stockage -> analyse moteur -> plies.

Séparé en deux étapes distinctes (sync puis analyse) pour être repris :
une partie 'synced' mais pas 'analyzed' est reprise au prochain passage.
"""
from __future__ import annotations

import asyncio
import json
import logging
import re
from datetime import datetime, timezone

import aiosqlite
import chess
import chess.pgn

from ..analysis_client import AnalyzerClient
from ..chesscom import ChessComClient, ChessComError
from ..config import settings
from .. import eval as eval_mod
from ..openings import OpeningBook
from ..pgn import parse_pgn
from ..schemas import EvalPoint

logger = logging.getLogger(__name__)

# classes de temps analysées
TIME_CLASSES = {"rapid", "blitz"}


def _utcnow() -> str:
    return datetime.now(timezone.utc).isoformat(timespec="seconds")


def _chesscom_game_id(raw: dict) -> int | None:
    """L'API chess.com n'expose pas d'`id` : on l'extrait de l'URL."""
    url = raw.get("url") or ""
    m = re.search(r"/(\d+)(?:\?|$)", url)
    return int(m.group(1)) if m else None


def phase_of(board: chess.Board, ply: int) -> str:
    """Détection de phase : endgame par matériel restant, sinon opening/middlegame."""
    material = 0
    queens = 0
    for _, piece in board.piece_map().items():
        if piece.piece_type in (chess.PAWN, chess.KING):
            continue
        material += {chess.QUEEN: 9, chess.ROOK: 5, chess.BISHOP: 3, chess.KNIGHT: 3}[piece.piece_type]
        if piece.piece_type == chess.QUEEN:
            queens += 1
    if queens == 0 and material <= 13:
        return "endgame"
    if queens > 0 and material <= 6:
        return "endgame"
    return "opening" if ply < 20 else "middlegame"


def _eval_point(result: dict) -> EvalPoint:
    line = (result.get("lines") or [{}])[0]
    score = line.get("score") or {}
    return EvalPoint(cp=score.get("cp"), mate=score.get("mate"))


class SyncPipeline:
    def __init__(self, db: aiosqlite.Connection, chesscom: ChessComClient,
                 analyzer: AnalyzerClient, book: OpeningBook) -> None:
        self.db = db
        self.chesscom = chesscom
        self.analyzer = analyzer
        self.book = book

    # ------------------------------------------------------------ sync
    async def sync(self, username: str, months: int, run_id: int | None = None) -> dict:
        if run_id is None:
            cursor = await self.db.execute(
                "INSERT INTO sync_runs (username) VALUES (?)", (username,)
            )
            run_id = cursor.lastrowid
            await self.db.commit()
        else:
            await self.db.execute(
                "UPDATE sync_runs SET username=?, started_at=datetime('now'), status='running' WHERE id=?",
                (username, run_id),
            )
            await self.db.commit()

        try:
            archives = await self.chesscom.get_archives(username)
            if months > 0:
                archives = archives[-months:]
            seen = 0
            new = 0
            for url in archives:
                games = await self.chesscom.get_month(url)
                for raw in games:
                    seen += 1
                    try:
                        inserted = await self._store_game(username, raw)
                    except Exception as exc:  # noqa: BLE001
                        logger.warning("Partie ignorée (%s): %s", url, exc)
                        continue
                    if inserted:
                        new += 1
            await self.db.execute(
                "UPDATE sync_runs SET games_seen=?, games_new=?, status='done', finished_at=? WHERE id=?",
                (seen, new, _utcnow(), run_id),
            )
            await self.db.execute(
                "INSERT INTO players (username, is_active, last_analyzed_at) VALUES (?, 1, ?) "
                "ON CONFLICT(username) DO UPDATE SET is_active=1, last_analyzed_at=excluded.last_analyzed_at",
                (username, _utcnow()),
            )
            await self.db.commit()
            return {"run_id": run_id, "username": username, "games_seen": seen,
                    "games_new": new, "games_analyzed": 0, "status": "done"}
        except Exception as exc:  # noqa: BLE001
            await self.db.execute(
                "UPDATE sync_runs SET status='error', error=?, finished_at=? WHERE id=?",
                (str(exc), _utcnow(), run_id),
            )
            await self.db.commit()
            raise

    async def _store_game(self, username: str, raw: dict) -> bool:
        """Stocke une partie si elle est nouvelle et dans les classes analysées."""
        time_class = raw.get("time_class", "")
        if time_class not in TIME_CLASSES:
            return False
        if raw.get("rules", "chess") != "chess":
            return False
        pgn = raw.get("pgn", "")
        if not pgn:
            return False
        parsed = parse_pgn(pgn)
        if not parsed.moves:
            return False

        white = raw.get("white") or {}
        black = raw.get("black") or {}
        white_name = white.get("username") or (white.get("user") or {}).get("username", "")
        black_name = black.get("username") or (black.get("user") or {}).get("username", "")
        player_color = "w" if white_name.lower() == username.lower() else "b"
        result = parsed.headers.get("Result") or (white.get("result") + "-" + black.get("result"))

        fen_list = [parsed.fen_start] + [m.fen_before for m in parsed.moves]
        opening = self.book.classify_fens(fen_list) if self.book._loaded else None

        row = await self.db.execute(
            "SELECT id FROM games WHERE pgn=? AND username=?", (pgn, username)
        )
        if await row.fetchone():
            return False

        cursor = await self.db.execute(
            """INSERT INTO games (chesscom_id, username, white, black, white_elo, black_elo,
               result, player_color, time_class, time_control, end_time, rules, fen_start,
               eco, opening_name, termination, pgn, status)
               VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?, 'synced')""",
            (
                _chesscom_game_id(raw),
                username,
                white_name,
                black_name,
                white.get("rating"),
                black.get("rating"),
                result,
                player_color,
                time_class,
                raw.get("time_control"),
                raw.get("end_time"),
                raw.get("rules", "chess"),
                parsed.fen_start,
                opening[0] if opening else parsed.eco,
                opening[1] if opening else parsed.opening_name,
                raw.get("termination"),
                pgn,
            ),
        )
        game_id = cursor.lastrowid
        await self.db.commit()
        logger.info("Nouvelle partie #%s (%s, %s)", game_id, username, time_class)
        return True

    # --------------------------------------------------------- analyse
    async def analyze_new(self, username: str, limit: int | None = None) -> int:
        """Analyse les parties 'synced' non encore analysées."""
        q = "SELECT id, fen_start, pgn, time_class FROM games WHERE username=? AND status='synced' ORDER BY end_time DESC"
        params: list = [username]
        if limit:
            q += " LIMIT ?"
            params.append(limit)
        cursor = await self.db.execute(q, params)
        rows = await cursor.fetchall()

        depth_by_class = {
            "rapid": settings.analysis_depth_rapid,
            "blitz": settings.analysis_depth_blitz,
        }
        done = 0
        for row in rows:
            try:
                await self._analyze_one(row, depth_by_class.get(row["time_class"], 16))
                done += 1
            except Exception as exc:  # noqa: BLE001
                logger.error("Analyse échouée partie #%s: %s", row["id"], exc)
                await self.db.execute(
                    "UPDATE games SET status='error', error=? WHERE id=?",
                    (str(exc)[:500], row["id"]),
                )
                await self.db.commit()
        return done

    async def _analyze_one(self, row: aiosqlite.Row, depth: int) -> None:
        game_id = row["id"]
        parsed = parse_pgn(row["pgn"])
        ucis = [m.uci for m in parsed.moves]

        result = await self.analyzer.analyze_game(
            game_id, row["fen_start"], ucis, depth, settings.analysis_movetime
        )
        positions = result["positions"]
        if len(positions) != len(ucis) + 1:
            raise ValueError(f"nb positions incohérent: {len(positions)}")

        # fen avant chaque coup : positions[k] est l'évaluation APRÈS k coups,
        # donc avant le coup d'indice k. Aucun décalage à introduire.
        fen_list = [m.fen_before for m in parsed.moves]
        fen_after_list = []
        board = chess.Board(row["fen_start"])
        for uci in ucis:
            board.push_uci(uci)
            fen_after_list.append(board.fen())

        # Livre d'ouvertures : positions = [avant coup 0, ..., avant coup n, fin].
        book_fens = fen_list + [fen_after_list[-1] if fen_after_list else row["fen_start"]]
        opening = self.book.classify_fens(book_fens) if self.book._loaded else None
        exit_ply = opening[2] if opening else -1

        player_color = (await (await self.db.execute(
            "SELECT player_color FROM games WHERE id=?", (game_id,)
        )).fetchone())["player_color"]

        scores: list[float] = []
        losses: list[float] = []
        counts: dict[str, int] = {}

        for k, m in enumerate(parsed.moves):
            before = positions[k]
            after = positions[k + 1]
            ev_before = _eval_point(before)
            ev_after = _eval_point(after)

            board = chess.Board(fen_list[k])  # position avant le coup
            # is_book : la position ATTEINTE par le coup est-elle encore connue ?
            is_book = (k + 1) <= exit_ply

            if is_book:
                classification = "book"
                stm_b = m.color
                wp_b = eval_mod.win_prob(ev_before, stm_b, m.color)
                wp_a = wp_b
            else:
                stm_b = m.color
                stm_a = "w" if m.color == "b" else "b"
                wp_b = eval_mod.win_prob(ev_before, stm_b, m.color)
                wp_a = wp_b if not eval_mod.has_score(ev_after) else eval_mod.win_prob(ev_after, stm_a, m.color)
                classification, wp_b, wp_a, loss = eval_mod.classify(
                    ev_before, ev_after, m.color, wp_before=wp_b, wp_after=wp_a
                )
                counts[classification] = counts.get(classification, 0) + 1
                if m.color == player_color:
                    scores.append(eval_mod.MOVE_SCORE[classification])
                    losses.append(wp_b - wp_a)

            best_move_uci = before.get("bestmove")
            best_move_san = self._to_san(fen_list[k], best_move_uci) if best_move_uci else None

            # cp_loss : perte en centipawns du point de vue du trait (positif = perte).
            # Le moteur exprime cp du point de vue du camp au trait : pour le coup k,
            # ev_before a pour trait m.color, ev_after a pour trait l'adversaire.
            cp_loss = None
            if ev_before.cp is not None and ev_after.cp is not None:
                # ev_before a pour trait m.color : cp déjà du point de vue du trait.
                before_side = ev_before.cp
                # ev_after a pour trait l'adversaire.
                after_side = -ev_after.cp if m.color == "w" else ev_after.cp
                cp_loss = round(before_side - after_side, 1)

            await self.db.execute(
                """INSERT OR REPLACE INTO plies
                   (game_id, ply, move_number, color, san, uci, fen_before, fen_after,
                    eval_before_cp, mate_before, eval_after_cp, mate_after,
                    best_move_uci, best_move_san, pv_best, cp_loss,
                    winprob_before, winprob_after, winprob_loss, classification,
                    clk, time_taken, phase, is_book, is_player)
                   VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)""",
                (
                    game_id, m.ply, m.ply // 2 + 1, m.color, m.san, m.uci,
                    fen_list[k], fen_after_list[k],
                    ev_before.cp, ev_before.mate, ev_after.cp, ev_after.mate,
                    best_move_uci, best_move_san,
                    json.dumps((before.get("lines") or [{}])[0].get("pv", [])) if before.get("lines") else None,
                    cp_loss,
                    round(wp_b, 2),
                    round(wp_a, 2),
                    round(wp_b - wp_a, 2),
                    classification,
                    m.clk, m.time_taken, phase_of(board, m.ply),
                    1 if is_book else 0,
                    1 if m.color == player_color else 0,
                ),
            )

        accuracy = eval_mod.accuracy(scores)
        acpl = eval_mod.acpl_from_losses(losses)
        await self.db.execute(
            """UPDATE games SET status='analyzed', accuracy=?, acpl=?, classifications=?,
               analyzed_at=?, eco=?, opening_name=? WHERE id=?""",
            (accuracy, acpl, json.dumps(counts), _utcnow(),
             opening[0] if opening else None, opening[1] if opening else None, game_id),
        )
        await self.db.commit()
        logger.info("Partie #%s analysée (accuracy=%s, blunders=%s)", game_id, accuracy, counts.get("blunder", 0))

    @staticmethod
    def _to_san(fen: str, uci: str) -> str | None:
        try:
            board = chess.Board(fen)
            return board.san(board.uci(chess.Move.from_uci(uci)))
        except Exception:
            return uci
