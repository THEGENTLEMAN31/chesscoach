"""Outils de l'agent : catalogue accessible par le LLM (tool-calling).

Chaque fonction est déterministe ; le LLM décide seul lesquelles appeler.
"""
from __future__ import annotations

import json
from dataclasses import dataclass

import aiosqlite
from langchain_core.tools import tool

from ..analysis_client import AnalyzerClient
from ..chesscom import ChessComClient
from . import data_service as ds
from . import memory as mem


@dataclass
class AgentContext:
    db: aiosqlite.Connection
    analyzer: AnalyzerClient
    chesscom: ChessComClient
    username: str
    sync_manager: object = None  # SyncManager (facultatif)


def _out(obj) -> str:
    return json.dumps(obj, ensure_ascii=False)


def build_tools(ctx: AgentContext) -> list:
    @tool
    async def get_partie(partie_id: int) -> str:
        """Récupère le récap d'une partie analysée (adversaire, résultat, ouverture, précision) et ses coups fautifs."""
        game = await ds.get_game(ctx.db, partie_id)
        if not game:
            return "Partie introuvable."
        review = await ds.review_game(ctx.db, partie_id)
        return _out(review)

    @tool
    async def review_partie(partie_id: int) -> str:
        """Analyse pédagogique d'une partie : liste les pires coups du joueur (bévues/erreurs) avec position, perte et coup recommandé."""
        review = await ds.review_game(ctx.db, partie_id)
        if not review:
            return "Partie introuvable ou non analysée."
        return _out(review)

    @tool
    async def stats_joueur() -> str:
        """Statistiques globales du joueur : précision et ACPL par format, répartition des coups."""
        return _out(await ds.stats(ctx.db, ctx.username))

    @tool
    async def patterns_joueur() -> str:
        """Motifs récurrents du joueur : bévues par phase, par pièce, par temps de réflexion, ouvertures jouées, conversions de position gagnante."""
        return _out(await ds.patterns(ctx.db, ctx.username))

    @tool
    async def repertoire() -> str:
        """Le répertoire d'ouvertures du joueur (comme Blancs/Noirs), avec fréquences et précision moyenne."""
        return _out(await ds.repertoire(ctx.db, ctx.username))

    @tool
    async def exercices(nombre: int = 6) -> str:
        """Propose des exercices à partir des pires bévues du joueur : position FEN, coup joué, coup du moteur."""
        return _out(await ds.exercices(ctx.db, ctx.username, nombre))

    @tool
    async def check_solution(fen: str, coup: str) -> str:
        """Vérifie une solution proposée par le joueur sur une position (FEN + coup UCI). Analyse la position et compare au coup du moteur."""
        try:
            res = await ctx.analyzer.analyze_position(fen, depth=16, movetime=1500)
        except Exception as exc:  # noqa: BLE001
            return f"Analyse impossible: {exc}"
        best = res.get("bestmove")
        lines = res.get("lines") or []
        score = (lines[0].get("score") if lines else {}) or {}
        ok = bool(best and coup == best)
        return _out({
            "correct": ok,
            "coup_joue": coup,
            "coup_du_moteur": best,
            "eval": score,
            "message": "Bien vu !" if ok else f"Raté : le coup du moteur est {best}.",
        })

    @tool
    async def analyse_position(fen: str, profondeur: int = 18) -> str:
        """Analyse une position au moteur (FEN). Renvoie évaluation et meilleur coup."""
        try:
            res = await ctx.analyzer.analyze_position(fen, depth=profondeur, movetime=3000)
        except Exception as exc:  # noqa: BLE001
            return f"Analyse impossible: {exc}"
        lines = res.get("lines") or []
        line = lines[0] if lines else {}
        return _out({"fen": fen, "score": line.get("score"), "depth": line.get("depth"),
                     "bestmove": res.get("bestmove"), "pv": (line.get("pv") or [])[:6]})

    @tool
    async def variante(fen: str, coups: list[str]) -> str:
        """Analyse une ligne/variante depuis une position (FEN + liste de coups UCI)."""
        try:
            res = await ctx.analyzer.analyze_line(fen, coups, depth=18, movetime=3000)
        except Exception as exc:  # noqa: BLE001
            return f"Analyse impossible: {exc}"
        lines = res.get("lines") or []
        line = lines[0] if lines else {}
        return _out({"fen": res.get("fen"), "score": line.get("score"),
                     "bestmove": res.get("bestmove"), "pv": (line.get("pv") or [])[:6]})

    @tool
    async def what_if(partie_id: int, pli: int) -> str:
        """'Et si tu avais joué le coup du moteur ?' — compare sur un coup précis d'une partie."""
        return _out(await ds.what_if(ctx.db, partie_id, pli))

    @tool
    async def sync_parties(mois: int = 1) -> str:
        """Lance la synchronisation + analyse des parties chess.com (tâche de fond)."""
        if ctx.sync_manager is None:
            return "Synchronisation non disponible."
        try:
            res = await ctx.sync_manager.start(ctx.username, mois)
            return _out(res)
        except Exception as exc:  # noqa: BLE001
            return f"Échec: {exc}"

    @tool
    async def memoire_lire() -> str:
        """Relit la mémoire longue durée (profil, prescriptions, diagnostics, retours)."""
        entries = await mem.read_memory(ctx.db)
        return mem.memory_to_prompt(entries)

    @tool
    async def memoire_ecrire(kind: str, contenu: str) -> str:
        """Écrit une note en mémoire longue durée. kind ∈ profile|prescription|diagnostic|feedback|note."""
        try:
            eid = await mem.write_memory(ctx.db, kind, contenu, source="agent")
            return f"Mémorisé (#{eid}, {kind})."
        except ValueError as exc:
            return f"Erreur: {exc}"

    return [
        get_partie, review_partie, stats_joueur, patterns_joueur, repertoire,
        exercices, check_solution, analyse_position, variante, what_if,
        sync_parties, memoire_lire, memoire_ecrire,
    ]
