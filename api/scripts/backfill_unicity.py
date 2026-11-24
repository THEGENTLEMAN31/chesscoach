"""Backfill de l'unicité des exercices (gap best vs 2e meilleur, en cp).

Pour un utilisateur, calcule la qualité des N meilleures positions candidates
(jamais calculées) via l'analyseur MultiPV=2, et stocke dans `exercise_quality`.
Idempotent, borné, fail-open (les erreurs n'empêchent pas le reste).

Usage (dans le conteneur api) :
  python -m scripts.backfill_unicity --username thegentleman31 --limit 250
"""
from __future__ import annotations

import argparse
import asyncio
import sqlite3
import time

import httpx

from app.config import settings


async def _reco_rows(db_path: str, username: str, n: int) -> list[dict]:
    import aiosqlite

    from app.agent import data_service as ds

    db = await aiosqlite.connect(db_path)
    db.row_factory = aiosqlite.Row
    try:
        return await ds.exercices(db, username, n)
    finally:
        await db.close()


def line_cp(line: dict) -> int | None:
    """Valeur comparable en cp depuis la perspective du trait (mate -> grand)."""
    score = line.get("score") or {}
    mate = score.get("mate")
    if mate is not None:
        return 100000 - abs(int(mate)) * 1000
    cp = score.get("cp")
    return int(cp) if cp is not None else None


def compute_gap(result: dict) -> tuple[float | None, str | None]:
    lines = result.get("lines") or []
    if len(lines) < 2:
        return 9999.0, None  # coup forcé / unique
    a, b = line_cp(lines[0]), line_cp(lines[1])
    if a is None or b is None:
        return None, None
    return float(abs(a - b)), (lines[1].get("pv") or [None])[0]


def main() -> None:
    ap = argparse.ArgumentParser()
    ap.add_argument("--username", required=True)
    ap.add_argument("--limit", type=int, default=250)
    ap.add_argument("--depth", type=int, default=12)
    ap.add_argument("--movetime", type=int, default=300)
    ap.add_argument("--analyzer-url", default="http://analyzer:8002")
    ap.add_argument("--db", default=settings.db_path)
    ap.add_argument("--from-recommender", action="store_true",
                    help="cible les positions réellement proposées par le recommandeur")
    args = ap.parse_args()

    conn = sqlite3.connect(args.db, timeout=15)
    conn.row_factory = sqlite3.Row
    cur = conn.cursor()
    if args.from_recommender:
        rows = asyncio.run(_reco_rows(args.db, args.username, args.limit))
    else:
        cur.execute(
            """SELECT p.game_id, p.ply, p.fen_before, p.winprob_loss
               FROM plies p JOIN games g ON g.id=p.game_id
               LEFT JOIN exercise_quality q ON q.game_id=p.game_id AND q.ply=p.ply
               WHERE g.username=? AND p.is_player=1
                 AND p.classification IN ('blunder','mistake')
                 AND p.best_move_uci IS NOT NULL AND p.is_book=0
                 AND COALESCE(p.winprob_loss,0) >= 12
                 AND q.game_id IS NULL
               ORDER BY p.winprob_loss DESC
               LIMIT ?""",
            (args.username, args.limit),
        )
        rows = cur.fetchall()
    print(f"positions à évaluer : {len(rows)}")

    ok = ambiguous = errors = skipped = 0
    client = httpx.Client(base_url=args.analyzer_url, timeout=60.0)
    for i, r in enumerate(rows, 1):
        cur.execute("SELECT 1 FROM exercise_quality WHERE game_id=? AND ply=?",
                    (r["game_id"], r["ply"]))
        if cur.fetchone():
            skipped += 1
            continue
        try:
            resp = client.post(
                "/positions/analyze",
                json={"fen": r["fen_before"],
                      "config": {"depth": args.depth, "movetime": args.movetime, "multipv": 2}},
            )
            resp.raise_for_status()
            gap, best2 = compute_gap(resp.json())
            cur.execute(
                "INSERT OR REPLACE INTO exercise_quality (game_id, ply, gap_cp, best2_uci) VALUES (?,?,?,?)",
                (r["game_id"], r["ply"], gap, best2),
            )
            conn.commit()
            ok += 1
            if gap is not None and gap < 40:
                ambiguous += 1
        except Exception as exc:  # noqa: BLE001
            errors += 1
            print(f"  ! {r['game_id']}/{r['ply']} : {exc}")
        if i % 25 == 0:
            print(f"  {i}/{len(rows)} (ambiguës={ambiguous}, erreurs={errors})")
            time.sleep(0.05)

    client.close()
    conn.close()
    print(f"terminé : ok={ok}, ambiguës={ambiguous}, erreurs={errors}, déjà={skipped}")


if __name__ == "__main__":
    main()
