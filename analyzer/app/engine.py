"""Wrapper UCI du moteur Stockfish : processus unique, thread-safe, robuste.

Le moteur est un juge déterministe. Tout ce qui sort d'ici est la vérité
technique du projet : aucune évaluation/coup ne doit venir d'ailleurs.

La lecture utilise `select` + `os.read` sur le fd brut avec un buffer de
lignes maison : contrairement à une TextIOWrapper, elle ne se fige jamais
quand l'octet attendu est déjà présent dans le buffer interne Python.
"""
from __future__ import annotations

import logging
import os
import re
import select
import subprocess
import threading
import time
from dataclasses import dataclass

from .schemas import Line, PositionResult, Score

logger = logging.getLogger(__name__)

_INFO_RE = re.compile(
    r"depth (?P<depth>\d+).*?multipv (?P<multipv>\d+)"
    r".*?score (cp (?P<cp>-?\d+)|mate (?P<mate>-?\d+))"
    r".*?pv (?P<pv>.*)$"
)


@dataclass
class EngineConfig:
    path: str = "/usr/local/bin/stockfish"
    threads: int = 2
    hash_mb: int = 512
    startup_timeout: float = 20.0
    command_timeout: float = 30.0


class StockfishEngine:
    """Client UCI synchrone et thread-safe vers un processus Stockfish."""

    def __init__(self, config: EngineConfig | None = None) -> None:
        self.cfg = config or EngineConfig()
        self._lock = threading.Lock()
        self._proc: subprocess.Popen | None = None
        self._pending = b""

    # ------------------------------------------------------------------ vie
    def start(self) -> None:
        with self._lock:
            if self._proc is not None:
                return
            logger.info("Démarrage de Stockfish (%s, threads=%s, hash=%s)",
                        self.cfg.path, self.cfg.threads, self.cfg.hash_mb)
            self._pending = b""
            self._proc = subprocess.Popen(
                [self.cfg.path],
                stdin=subprocess.PIPE,
                stdout=subprocess.PIPE,
                stderr=subprocess.DEVNULL,
            )
            self._send_nolock("uci")
            self._read_until(b"uciok", self.cfg.startup_timeout)
            for option, value in (
                ("Threads", self.cfg.threads),
                ("Hash", self.cfg.hash_mb),
                ("MultiPV", 1),
            ):
                self._send_nolock(f"setoption name {option} value {value}")
            self._send_nolock("isready")
            self._read_until(b"readyok", self.cfg.startup_timeout)
            logger.info("Stockfish prêt.")

    def stop(self) -> None:
        with self._lock:
            if self._proc is not None:
                try:
                    self._send_nolock("quit")
                except Exception:
                    pass
                try:
                    self._proc.wait(timeout=3)
                except Exception:
                    self._proc.kill()
                self._proc = None

    def _ensure_alive(self) -> None:
        if self._proc is None or self._proc.poll() is not None:
            self._proc = None
            self.start()

    # ----------------------------------------------------------- primitives
    def _send_nolock(self, cmd: str) -> None:
        assert self._proc and self._proc.stdin
        self._proc.stdin.write(cmd.encode() + b"\n")
        self._proc.stdin.flush()

    def _send(self, cmd: str) -> None:
        self._ensure_alive()
        self._send_nolock(cmd)

    def _read_until(self, marker: bytes, timeout: float | None = None) -> list[str]:
        """Lit des lignes complètes jusqu'au marqueur (inclus), renvoie les
        lignes précédentes. Ne se fige jamais : timeout dur + stop."""
        assert self._proc and self._proc.stdout
        fd = self._proc.stdout.fileno()
        deadline = time.monotonic() + (timeout if timeout is not None else self.cfg.command_timeout)
        out: list[str] = []

        def process(data: bytes) -> None:
            self._pending += data
            while b"\n" in self._pending:
                line, self._pending = self._pending.split(b"\n", 1)
                out.append(line.decode(errors="replace").strip())

        process(b"")  # ventiler un éventuel résidu
        marker_s = marker.decode()
        while True:
            if out and out[-1].startswith(marker_s):
                return out[:-1]
            remaining = deadline - time.monotonic()
            if remaining <= 0:
                logger.warning("Timeout UCI en attendant '%s'", marker)
                try:
                    self._send_nolock("stop")
                except Exception:
                    pass
                raise TimeoutError(f"timeout en attendant {marker}")
            ready, _, _ = select.select([fd], [], [], max(0.0, remaining))
            if not ready:
                continue  # réévaluer le deadline
            try:
                data = os.read(fd, 8192)
            except (OSError, ValueError):
                raise RuntimeError("lecture Stockfish interrompue")
            if not data:
                raise RuntimeError("Stockfish a fermé sa sortie")
            process(data)

    # ------------------------------------------------------------- analyse
    def analyze(self, fen: str, depth: int, movetime: int, multipv: int = 1) -> PositionResult:
        with self._lock:
            self._ensure_alive()
            if multipv > 1:
                self._send_nolock(f"setoption name MultiPV value {multipv}")
                self._send_nolock("isready")
                self._read_until(b"readyok")
            self._send_nolock(f"position fen {fen}")
            self._send_nolock(f"go depth {depth} movetime {movetime}")
            lines = self._read_until(b"bestmove")
            if multipv > 1:
                self._send_nolock("setoption name MultiPV value 1")
                self._send_nolock("isready")
                self._read_until(b"readyok")

        parsed = self._parse_info(lines)
        best = None
        for l in parsed:
            if l.pv:
                best = l.pv[0]
                break
        return PositionResult(fen=fen, lines=parsed, bestmove=best)

    @staticmethod
    def _parse_info(lines: list[str]) -> list[Line]:
        by_pv: dict[int, Line] = {}
        for raw in lines:
            m = _INFO_RE.search(raw)
            if not m:
                continue
            pv = m.group("pv").split()
            pv = [p for p in pv if re.fullmatch(r"[a-h][1-8][a-h][1-8]?", p)]
            idx = int(m.group("multipv"))
            entry = by_pv.setdefault(
                idx, Line(score=Score(), depth=0, multipv=idx, pv=[])
            )
            entry.depth = max(entry.depth, int(m.group("depth")))
            entry.pv = pv
            if m.group("cp"):
                entry.score.cp = int(m.group("cp"))
            if m.group("mate"):
                entry.score.mate = int(m.group("mate"))
        return [by_pv[k] for k in sorted(by_pv)]
