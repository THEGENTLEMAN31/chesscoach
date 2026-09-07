"""Modèle dynamique de l'élève — le cœur des niveaux 1, 4 et 5.

À partir des plies/concepts stockés (déterministes), on construit un profil
structuré : forces, faiblesses, concepts manquants, causes racines, style,
mental, conversion et progression. Le LLM ne fait QUE raconter ce modèle ;
il ne le fabrique jamais.
"""
from __future__ import annotations

import json
import logging
from datetime import datetime, timedelta, timezone

import aiosqlite

from ..config import settings
from .. import concepts as cx
from .data_service import etude_stats

logger = logging.getLogger(__name__)

ERRORS = ("blunder", "mistake")
# Objectifs Elo par format (la cible de l'utilisateur n'est pas la même partout).
ELO_TARGETS = {"rapid": 2000, "blitz": 1800}
CAUSE_LABELS = {
    "temps": "Joue trop vite (< 5 s)",
    "temps_flag": "Décision en flag ( < 2 s)",
    "position_gagnante": "Relâchement en position gagnante",
    "apres_erreur": "Fait une 2e erreur après une erreur",
    "sortie_ouverture": "Erreur en sortie de théorie",
    "sacrifice_adverse": "Panique après un sacrifice adverse",
}
CAUSE_TZ = getattr(settings, "profile_tz_offset_h", 2)


# ------------------------------------------------------------------ utilitaires
def _french_date(ts: int) -> str:
    try:
        return datetime.fromtimestamp(ts, timezone.utc).strftime("%Y-%m-%d")
    except (ValueError, OSError):
        return ""


def _local_hour(ts: int) -> int:
    try:
        return (datetime.fromtimestamp(ts, timezone.utc) + timedelta(hours=CAUSE_TZ)).hour
    except (ValueError, OSError):
        return 12


async def _errors(db: aiosqlite.Connection, username: str,
                  time_class: str | None = None) -> list[dict]:
    """Toutes les erreurs du joueur avec leur concept/causes et le contexte de la partie."""
    sql = """SELECT p.concept, p.concepts, p.classification, p.winprob_loss, p.time_taken,
                  p.phase, p.fen_before, p.san, p.uci, p.move_number, p.ply,
                  p.winprob_before, p.winprob_after, g.end_time, g.time_class, g.result,
                  g.player_color, g.id AS game_id
           FROM plies p JOIN games g ON g.id=p.game_id
           WHERE g.username=? AND p.is_player=1 AND p.classification IN ('blunder','mistake')"""
    params: list = [username]
    if time_class:
        sql += " AND g.time_class=?"
        params.append(time_class)
    sql += " ORDER BY g.end_time DESC"
    cur = await db.execute(sql, params)
    return [dict(r) for r in await cur.fetchall()]


async def _player_moves(db: aiosqlite.Connection, username: str,
                        time_class: str | None = None) -> list[dict]:
    """Coups du joueur (hors théorie) : temps, type de coup, évaluations."""
    sql = """SELECT p.san, p.uci, p.time_taken, p.winprob_before, p.winprob_after,
                  p.classification, p.phase, p.fen_before, p.is_book, p.ply,
                  g.id AS game_id, g.time_class
           FROM plies p JOIN games g ON g.id=p.game_id
           WHERE g.username=? AND p.is_player=1 AND p.is_book=0"""
    params: list = [username]
    if time_class:
        sql += " AND g.time_class=?"
        params.append(time_class)
    cur = await db.execute(sql, params)
    return [dict(r) for r in await cur.fetchall()]


def _sacrifice(captured_piece, attacker_piece) -> bool:
    return attacker_piece is not None and captured_piece is not None and attacker_piece < captured_piece


async def _game_rows(db: aiosqlite.Connection, username: str,
                     time_class: str | None = None) -> list[dict]:
    sql = """SELECT id, white_elo, black_elo, player_color, result, accuracy, acpl, time_class,
                  end_time, eco, opening_name
           FROM games WHERE username=? AND status='analyzed'"""
    params: list = [username]
    if time_class:
        sql += " AND time_class=?"
        params.append(time_class)
    sql += " ORDER BY end_time ASC"
    cur = await db.execute(sql, params)
    return [dict(r) for r in await cur.fetchall()]


# ------------------------------------------------------------------ aggrégations
def _aggregate(games: list[dict], errors: list[dict], moves: list[dict],
               username: str, time_class: str | None = None,
               etudes: dict | None = None) -> dict:
    """Agrège les données déjà chargées en base en un profil complet.

    `games`/`errors`/`moves` doivent déjà être filtrés par `time_class` (ou tous
    formats si `None`, ce qui correspond au profil « global »).
    """
    import chess as _chess  # noqa: PLC0415

    # ------- progression Elo (courbe) + tendance
    elo_pts: list[tuple[str, int]] = []
    for g in games:
        elo = g["white_elo"] if g["player_color"] == "w" else g["black_elo"]
        if elo:
            elo_pts.append((_french_date(g["end_time"] or 0), elo))
    latest_elo = elo_pts[-1][1] if elo_pts else None
    rating = {
        "min": min((e for _, e in elo_pts), default=None),
        "max": max((e for _, e in elo_pts), default=None),
        "latest": latest_elo,
    }
    half = len(elo_pts) // 2
    elo_trend = None
    if half >= 3:
        older = sum(e for _, e in elo_pts[:half]) / half
        newer = sum(e for _, e in elo_pts[half:]) / (len(elo_pts) - half)
        elo_trend = round(newer - older, 0)
    if len(elo_pts) > 250:
        step = max(1, len(elo_pts) // 250)
        elo_pts = elo_pts[::step]

    acc_trend = None
    accs = [g["accuracy"] for g in games if g["accuracy"] is not None]
    if len(accs) >= 8:
        h = len(accs) // 2
        acc_trend = round(sum(accs[h:]) / len(accs[h:]) - sum(accs[:h]) / h, 1)

    # ------- erreurs par concept (famille + libellé)
    by_concept: dict[str, dict] = {}
    for e in errors:
        c = e["concept"] or "candidate"
        fam = cx.family(c)
        entry = by_concept.setdefault(c, {"key": c, "family": fam, "label": cx.label(c), "n": 0, "blunders": 0, "loss": 0.0})
        entry["n"] += 1
        entry["loss"] += max(0.0, e["winprob_loss"] or 0)
        if e["classification"] == "blunder":
            entry["blunders"] += 1
    for entry in by_concept.values():
        entry["avg_loss"] = round(entry["loss"] / entry["n"], 1)
    concepts_missing = sorted(by_concept.values(), key=lambda x: -x["n"])

    # ------- causes racines
    cause_counts: dict[str, int] = {}
    for e in errors:
        try:
            meta = json.loads(e["concepts"] or "{}")
            causes = meta.get("causes", [])
        except (ValueError, TypeError):
            causes = []
        for c in causes:
            cause_counts[c] = cause_counts.get(c, 0) + 1
    root_causes = [
        {"cause": c, "label": CAUSE_LABELS.get(c, c), "n": n,
         "share": round(100.0 * n / max(1, len(errors)), 1)}
        for c, n in sorted(cause_counts.items(), key=lambda x: -x[1])
    ]

    # ------- faiblesses (familles) + forces
    by_family: dict[str, dict] = {}
    for e in errors:
        c = e["concept"] or "candidate"
        fam = cx.family(c)
        f = by_family.setdefault(fam, {"family": fam, "n": 0, "loss": 0.0, "blunders": 0})
        f["n"] += 1
        f["loss"] += max(0.0, e["winprob_loss"] or 0)
        if e["classification"] == "blunder":
            f["blunders"] += 1
    for f in by_family.values():
        f["avg_loss"] = round(f["loss"] / f["n"], 1)
    weaknesses = sorted(by_family.values(), key=lambda x: -x["n"])

    # forces : familles peu fautives + ouvertures gagnantes + phase la plus précise
    phases_acc: dict[str, list[float]] = {}
    for m in moves:
        if m["classification"] not in ("book", "best", "good"):
            continue
        phases_acc.setdefault(m["phase"] or "middlegame", []).append(1.0 if m["classification"] == "best" else 0.7)
    strengths: list[dict] = []
    for fam in ("structure", "finale", "ouverture", "prophylaxie"):
        f = by_family.get(fam)
        if not f or f["n"] <= 2:
            continue
        if f["n"] < 30 and f["n"] / max(1, len(errors)) < 0.08:
            strengths.append({"label": f"Rarement fautif en « {fam} »", "detail": f"{f['n']} erreur(s) seulement"})
    if phases_acc:
        best_phase = max(phases_acc.items(), key=lambda kv: sum(kv[1]) / len(kv[1]))
        if len(best_phase[1]) >= 20:
            strengths.append({
                "label": f"Phase la plus solide : {best_phase[0]}",
                "detail": f"{(100.0 * sum(best_phase[1]) / len(best_phase[1])):.1f}% de coups corrects",
            })

    # ------- style
    captures = 0
    total_moves = len(moves)
    times: list[float] = []
    fast = 0
    for m in moves:
        if m["time_taken"] is not None:
            times.append(m["time_taken"])
            if m["time_taken"] < 5:
                fast += 1
        if m["san"] and "x" in m["san"]:
            captures += 1
    sacrifices = 0
    for m in moves:
        try:
            b = _chess.Board(m["fen_before"])
            mv = b.parse_san(m["san"])
            cap = b.piece_type_at(mv.to_square) if b.is_capture(mv) else None
            attacker = b.piece_type_at(mv.from_square)
            if _sacrifice(cap, attacker):
                sacrifices += 1
        except (ValueError, IndexError):
            pass

    openings: dict[str, dict] = {}
    for g in games:
        key = g["eco"] or g["opening_name"] or "?"
        o = openings.setdefault(key, {"name": g["opening_name"] or g["eco"] or "?", "color": g["player_color"], "n": 0, "wins": 0, "acc": []})
        o["n"] += 1
        if (g["player_color"] == "w" and g["result"].startswith("1-0")) or \
           (g["player_color"] == "b" and g["result"].startswith("0-1")):
            o["wins"] += 1
        if g["accuracy"] is not None:
            o["acc"].append(g["accuracy"])
    for o in openings.values():
        o["winrate"] = round(100.0 * o["wins"] / o["n"], 1)
        o["acc"] = round(sum(o["acc"]) / len(o["acc"]), 1) if o["acc"] else None
    rep = sorted(openings.values(), key=lambda x: -x["n"])[:12]

    style = {
        "avg_time_per_move": round(sum(times) / len(times), 1) if times else None,
        "fast_move_pct": round(100.0 * fast / max(1, total_moves), 1),
        "capture_pct": round(100.0 * captures / max(1, total_moves), 1),
        "sacrifices": sacrifices,
        "openings": rep,
    }

    # ------- mental
    fast_blunders = [e for e in errors if e["time_taken"] is not None and e["time_taken"] < 5]
    winning_blunders = [e for e in errors if (e["winprob_before"] or 0) >= 80]
    evening = [e for e in errors if e["end_time"] and _local_hour(e["end_time"]) in (22, 23, 0, 1)]

    # tilt : 2+ erreurs consécutives du joueur dans la même partie
    tilt_seq = 0
    for gid in {e["game_id"] for e in errors}:
        seq = sorted([e for e in errors if e["game_id"] == gid], key=lambda x: x["ply"])
        run = 0
        for e in seq:
            if e["classification"] in ERRORS:
                run += 1
            else:
                if run >= 2:
                    tilt_seq += 1
                run = 0
        if run >= 2:
            tilt_seq += 1

    mental = [
        {
            "label": "Bévues sous pression de temps",
            "value": f"{round(100.0 * len(fast_blunders) / max(1, len(errors)), 0):.0f}%",
            "detail": f"{len(fast_blunders)} erreurs commises en moins de 5 s",
        },
        {
            "label": "Erreurs en position gagnante",
            "value": f"{round(100.0 * len(winning_blunders) / max(1, len(errors)), 0):.0f}%",
            "detail": f"{len(winning_blunders)} erreurs alors que tu étais à ≥80% de chances",
        },
        {
            "label": "Bévues en soirée (22h-02h)",
            "value": f"{round(100.0 * len(evening) / max(1, len(errors)), 0):.0f}%",
            "detail": f"{len(evening)} erreurs commises tard dans la journée",
        },
        {
            "label": "Tilt (2 erreurs de suite)",
            "value": f"{tilt_seq} partie(s)",
            "detail": "Séquence de deux erreurs consécutives dans la même partie",
        },
    ]

    # ------- conversion
    won = sum(1 for m in moves if (m["winprob_before"] or 0) >= 80)
    lost = sum(1 for m in moves if (m["winprob_before"] or 0) <= 20)
    won_blown = sum(1 for m in moves if (m["winprob_before"] or 0) >= 80 and (m["winprob_after"] or 50) <= 50)
    lost_saved = sum(1 for m in moves if (m["winprob_before"] or 0) <= 20 and (m["winprob_after"] or 50) >= 50)
    conversion = {
        "won_positions": won,
        "won_blown": won_blown,
        "conversion_rate": round(100.0 * (won - won_blown) / max(1, won), 1),
        "lost_positions": lost,
        "lost_saved": lost_saved,
    }

    # ------- cognitif (niveau 3) : hypothèses sur la réflexion
    n_err = max(1, len(errors))
    cognitive: list[str] = []
    shares = {c["key"]: c["n"] for c in concepts_missing}
    if shares.get("hanging_piece", 0) / n_err > 0.25:
        cognitive.append("Vérifie rarement si tes pièces sont en prise avant de jouer.")
    if shares.get("missed_capture", 0) / n_err > 0.15:
        cognitive.append("Tu n'explores pas assez les coups candidats qui capturent.")
    if shares.get("fork", 0) / n_err > 0.15:
        cognitive.append("Tu ne repères pas les fourchettes adverses ni les tiennes.")
    if shares.get("pin_moved", 0) / n_err > 0.12:
        cognitive.append("Tu déplaces des pièces clouées sans traiter l'attaque derrière.")
    if (shares.get("back_rank", 0) + shares.get("allowed_mate", 0)) / n_err > 0.10:
        cognitive.append("Tu négliges la sécurité de ton roi (et la dernière rangée).")
    if cause_counts.get("temps", 0) / n_err > 0.35:
        cognitive.append("Tu joues souvent trop vite : les erreurs arrivent en moins de 5 s.")
    if cause_counts.get("position_gagnante", 0) / n_err > 0.20:
        cognitive.append("Tu relâches ta vigilance dans les positions gagnantes.")
    if cause_counts.get("apres_erreur", 0) / n_err > 0.20:
        cognitive.append("Après une erreur, tu en commets souvent une seconde (tilt).")
    if cause_counts.get("sacrifice_adverse", 0) / n_err > 0.05:
        cognitive.append("Un sacrifice adverse te déstabilise : tu réponds mal à l'attaque.")
    if not cognitive:
        cognitive.append("Profil équilibré : aucune faiblesse cognitive dominante détectée.")

    # ------- objectif long terme (niveau 14, estimation) — cible propre au format
    target = ELO_TARGETS.get(time_class)  # None pour le profil « global »
    if target is not None and latest_elo is not None:
        remaining = max(0, target - latest_elo)
        months_est = max(1, round(remaining / 25))
        progression_pct = min(100, round(100.0 * latest_elo / target))
    else:
        remaining, months_est, progression_pct = None, None, None

    # ------- tendances 30 jours (niveau 5) : ce qui s'améliore / se dégrade
    now = datetime.now(timezone.utc)
    cutoff = int((now - timedelta(days=30)).timestamp())
    recent_errors = [e for e in errors if e["end_time"] and e["end_time"] >= cutoff]

    def _concept_stats(errs: list[dict]) -> tuple[dict, int]:
        d: dict[str, int] = {}
        for e in errs:
            c = e["concept"] or "candidate"
            d[c] = d.get(c, 0) + 1
        return d, max(1, len(errs))

    all_stats, all_total = _concept_stats(errors)
    rec_stats, rec_total = _concept_stats(recent_errors) if recent_errors else ({}, 1)
    trends = [
        {
            "key": k,
            "label": cx.label(k),
            "n": v,
            "overall_share": round(100.0 * all_stats.get(k, 0) / all_total, 1),
            "recent_share": round(100.0 * v / rec_total, 1),
            "delta": round(100.0 * v / rec_total - 100.0 * all_stats.get(k, 0) / all_total, 1),
        }
        for k, v in rec_stats.items()
    ]
    trends.sort(key=lambda t: -t["recent_share"])
    improving = [t for t in trends if t["delta"] <= -3][:3]
    worsening = [t for t in trends if t["delta"] >= 3][:3]

    # ------- prescription (niveau 8-10) : règles déterministes → programme
    recommendations = _prescribe(
        concepts_missing=concepts_missing,
        root_causes=root_causes,
        style=style,
        conversion=conversion,
        rating=rating,
        objective={"target_elo": target, "gap": remaining, "months_estimated": months_est},
        mental=mental,
        acc_trend=acc_trend,
    )

    return {
        "username": username,
        "time_class": time_class or "global",
        "computed_at": datetime.now(timezone.utc).strftime("%Y-%m-%dT%H:%M:%SZ"),
        "games": {
            "n": len(games),
            "by_time_class": {
                tc: sum(1 for g in games if g["time_class"] == tc)
                for tc in sorted({g["time_class"] for g in games})
            },
            "first_game": _french_date(games[0]["end_time"]) if games else None,
            "last_game": _french_date(games[-1]["end_time"]) if games else None,
        },
        "rating": rating,
        "progress": {
            "elo_curve": [{"date": d, "elo": e} for d, e in elo_pts],
            "elo_trend": elo_trend,
            "accuracy_trend": acc_trend,
        },
        "objective": {
            "target_elo": target,
            "gap": remaining,
            "months_estimated": months_est,
            "progression_pct": progression_pct,
            "targets": ELO_TARGETS,
        },
        "strengths": strengths,
        "weaknesses": [
            {
                "family": w["family"],
                "n": w["n"],
                "avg_loss": w["avg_loss"],
                "blunders": w["blunders"],
                "share": round(100.0 * w["n"] / n_err, 1),
            }
            for w in weaknesses
        ],
        "concepts_missing": [
            {k: c[k] for k in ("key", "family", "label", "n", "avg_loss", "blunders")}
            for c in concepts_missing[:12]
        ],
        "root_causes": root_causes,
        "style": style,
        "mental": mental,
        "conversion": conversion,
        "cognitive": cognitive,
        "trends": {"improving": improving, "worsening": worsening, "recent_games_30d": len(recent_errors)},
        "recommendations": recommendations,
        "etudes": etudes or {
            "n": 0, "correct": 0, "correct_rate": 0.0,
            "by_concept": [], "last_7d": 0, "first_at": None, "last_at": None,
        },
    }


def _prescribe(**ctx) -> list[dict]:
    """Programme d'entraînement déterministe, construit à partir des agrégats du profil."""
    concepts = ctx["concepts_missing"]
    causes = {c["cause"]: c["n"] for c in ctx["root_causes"]}
    style = ctx["style"]
    conv = ctx["conversion"]
    n_err = max(1, sum(causes.values()))

    recs: list[dict] = []

    top = concepts[0] if concepts else None
    if top:
        recs.append({
            "priority": "1",
            "titre": f"Drill : « {top['label']} »",
            "action": (f"Ce concept représente {top['n']} de tes erreurs "
                       f"(perte moyenne {top['avg_loss']}%). Fais 15 min/j de positions "
                       f"de {top['label']} sur la page Entraînement."),
            "cible": top["key"],
        })
    if len(concepts) > 1:
        recs.append({
            "priority": "2",
            "titre": f"Drill : « {concepts[1]['label']} »",
            "action": (f"{concepts[1]['n']} erreurs de {concepts[1]['label']} : entraîne-toi "
                       f"en secondes, 10 min/j."),
            "cible": concepts[1]["key"],
        })

    if causes.get("temps", 0) / n_err > 0.25:
        recs.append({
            "priority": "3",
            "titre": "Ralentir le geste",
            "action": ("En blitz, impose-toi ≥ 5 s par coup. Avant chaque coup : "
                       "1) pièces en prise, 2) menaces du camp adverse, 3) candidats violents."),
            "cible": "temps",
        })
    if causes.get("apres_erreur", 0) / n_err > 0.15:
        recs.append({
            "priority": "4",
            "titre": "Briser le tilt",
            "action": ("Après une bévue, ne joue pas la réplique tant que tu n'as pas compté "
                       "jusqu'à 5 et vérifié si une pièce est en prise."),
            "cible": "tilt",
        })
    if causes.get("position_gagnante", 0) / n_err > 0.15:
        recs.append({
            "priority": "5",
            "titre": "Gérer les positions gagnantes",
            "action": ("En position gagnante : simplifie, ne complique pas, et garde ton rythme "
                       "de réflexion (ne relâche pas le focus)."),
            "cible": "position_gagnante",
        })
    if conv.get("conversion_rate") is not None and conv["conversion_rate"] < 95:
        recs.append({
            "priority": "6",
            "titre": "Convertir les positions gagnantes",
            "action": (f"Tu convertis {conv['conversion_rate']}% des positions gagnantes "
                       f"({conv['won_blown']} bévues) : travaille les techniques de finale et "
                       "le mat du roi et de la tour."),
            "cible": "conversion",
        })

    if style.get("fast_move_pct") is not None and style["fast_move_pct"] > 50:
        recs.append({
            "priority": "7",
            "titre": "Temps de réflexion",
            "action": f"{style['fast_move_pct']}% de tes coups sont joués en moins de 5 s.",
            "cible": "vitesse",
        })

    return recs[:6]


# ------------------------------------------------------------------ API profil
async def _compute(db: aiosqlite.Connection, username: str,
                   time_class: str | None = None) -> dict:
    """Recharge les données (filtrées par format) et agrège le profil."""
    games = await _game_rows(db, username, time_class)
    errors = await _errors(db, username, time_class)
    moves = await _player_moves(db, username, time_class)
    etudes = await etude_stats(db, username, time_class)
    return _aggregate(games, errors, moves, username, time_class, etudes)


async def get_profile(db: aiosqlite.Connection, username: str, recompute: bool = False,
                      time_class: str = "global") -> dict:
    """Profil du joueur pour un format (rapid/blitz/global), en cache ou recalculé."""
    if not recompute:
        cur = await db.execute(
            "SELECT profile FROM player_profiles WHERE username=? AND time_class=?",
            (username, time_class),
        )
        row = await cur.fetchone()
        if row:
            return json.loads(row["profile"])
    profile = await _compute(db, username, time_class)
    await db.execute(
        """INSERT INTO player_profiles (username, time_class, profile, computed_at)
           VALUES (?,?,?,datetime('now'))
           ON CONFLICT(username, time_class) DO UPDATE SET profile=excluded.profile,
                                                           computed_at=excluded.computed_at""",
        (username, time_class, json.dumps(profile, ensure_ascii=False)),
    )
    # historique (courbe Elo / tendances dans le temps) — un snapshot par recompute
    await db.execute(
        "INSERT INTO profile_history (username, computed_at, elo, games, profile, time_class) "
        "VALUES (?,datetime('now'),?,?,?,?)",
        (username, profile["rating"]["latest"], profile["games"]["n"],
         json.dumps(profile, ensure_ascii=False), time_class),
    )
    await db.commit()
    return profile


async def get_all(db: aiosqlite.Connection, username: str, recompute: bool = False) -> dict:
    """Profil global + par format (rapid, blitz), toujours cohérents entre eux.

    Les trois profils sont calculés depuis le même instantané de données et écrits
    ensemble en base : on évite d'avoir un « global » dont le nombre de parties ne
    correspond pas à la somme des formats (caches écrits à des moments différents).
    Recalculés dès que le nombre de parties analysées a changé.
    """
    cur = await db.execute(
        "SELECT time_class, COUNT(*) AS n FROM games "
        "WHERE username=? AND status='analyzed' GROUP BY time_class", (username,)
    )
    counts = {r["time_class"]: r["n"] for r in await cur.fetchall()}
    total = sum(counts.values())
    expected = {
        "global": total,
        "rapid": counts.get("rapid", 0),
        "blitz": counts.get("blitz", 0),
    }

    cached: dict[str, dict] = {}
    for tc in ("global", "rapid", "blitz"):
        row = await (await db.execute(
            "SELECT profile FROM player_profiles WHERE username=? AND time_class=?",
            (username, tc),
        )).fetchone()
        if row:
            cached[tc] = json.loads(row["profile"])

    if not recompute and all(
        tc in cached and cached[tc]["games"]["n"] == expected[tc] for tc in expected
    ):
        return {"username": username, "profiles": cached}

    rows = await _game_rows(db, username)
    errs = await _errors(db, username)
    mv = await _player_moves(db, username)
    etudes_global = await etude_stats(db, username)
    profiles = {
        "global": _aggregate(rows, errs, mv, username, None, etudes_global),
        "rapid": _aggregate([g for g in rows if g["time_class"] == "rapid"],
                            [e for e in errs if e["time_class"] == "rapid"],
                            [m for m in mv if m["time_class"] == "rapid"],
                            username, "rapid",
                            await etude_stats(db, username, "rapid")),
        "blitz": _aggregate([g for g in rows if g["time_class"] == "blitz"],
                            [e for e in errs if e["time_class"] == "blitz"],
                            [m for m in mv if m["time_class"] == "blitz"],
                            username, "blitz",
                            await etude_stats(db, username, "blitz")),
    }
    for tc, prof in profiles.items():
        await db.execute(
            """INSERT INTO player_profiles (username, time_class, profile, computed_at)
               VALUES (?,?,?,datetime('now'))
               ON CONFLICT(username, time_class) DO UPDATE
                   SET profile=excluded.profile, computed_at=excluded.computed_at""",
            (username, tc, json.dumps(prof, ensure_ascii=False)),
        )
        # snapshot d'historique uniquement à la demande explicite (sinon on
        # créerait un point à chaque rechargement de la page)
        if recompute:
            await db.execute(
                "INSERT INTO profile_history (username, computed_at, elo, games, profile, time_class) "
                "VALUES (?,datetime('now'),?,?,?,?)",
                (username, prof["rating"]["latest"], prof["games"]["n"],
                 json.dumps(prof, ensure_ascii=False), tc),
            )
    await db.commit()
    return {"username": username, "profiles": profiles}


async def profile_history(db: aiosqlite.Connection, username: str, limit: int = 120,
                          time_class: str | None = None) -> dict:
    """Séries temporelles du profil : Elo, précision, volume par snapshot."""
    params: list = [username]
    sql = """SELECT computed_at, elo, games, time_class, profile FROM profile_history
             WHERE username=?"""
    if time_class:
        sql += " AND time_class=?"
        params.append(time_class)
    sql += " ORDER BY id DESC LIMIT ?"
    params.append(limit)
    cur = await db.execute(sql, params)
    rows = [dict(r) for r in await cur.fetchall()][::-1]
    series: dict[str, list] = {"dates": [], "elo": [], "games": [], "accuracy": []}
    for r in rows:
        try:
            prof = json.loads(r["profile"])
        except (ValueError, TypeError):
            prof = {}
        acc = prof.get("progress", {}).get("accuracy_trend")
        series["dates"].append((r["computed_at"] or "")[:10])
        series["elo"].append(r["elo"])
        series["games"].append(r["games"])
        series["accuracy"].append(acc)
    return {"username": username, "snapshots": len(rows), **series}


async def summarize_profile(db: aiosqlite.Connection, username: str, max_chars: int = 4000) -> str:
    """Version courte et lisible du profil, pour le prompt de l'agent."""
    try:
        profile = await get_profile(db, username)
    except Exception as exc:  # noqa: BLE001
        logger.warning("Profil indisponible: %s", exc)
        return "Profil non disponible pour l'instant."
    lines = [f"Profil de {username} (calculé à partir de {profile['games']['n']} parties analysées) :"]

    if profile["rating"]["latest"]:
        lines.append(f"- Elo actuel ≈ {profile['rating']['latest']}"
                     f" (tendance {profile['progress'].get('elo_trend') or '—'})")
    if profile["weaknesses"]:
        top = profile["weaknesses"][0]
        lines.append(f"- Faiblesse dominante : « {top['family']} » ({top['n']} erreurs, "
                     f"{top['share']}% des erreurs)")
    missing = ", ".join(c["label"] for c in profile["concepts_missing"][:5])
    lines.append(f"- Concepts à travailler : {missing}")
    if profile["cognitive"]:
        lines.append("- Hypothèses cognitives : " + " ".join(profile["cognitive"][:3]))
    if profile["root_causes"]:
        causes = "; ".join(f"{c['label']} ({c['n']})" for c in profile["root_causes"][:4])
        lines.append(f"- Causes racines : {causes}")
    conv = profile["conversion"]
    if conv["won_positions"]:
        lines.append(f"- Conversion : {conv['conversion_rate']}% des positions gagnantes converties "
                     f"({conv['won_blown']} bévues en position gagnante)")
    return "\n".join(lines)[:max_chars]
