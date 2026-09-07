import asyncio
from pathlib import Path

from app.agent.profile import get_profile, summarize_profile
from app.db import connect


async def main():
    db = await connect(Path("/app/data/chesscoach.db"))
    p = await get_profile(db, "thegentleman31", recompute=True)
    print("=== CLEFS ===")
    print(list(p.keys()))
    print("=== GAMES ===", p["games"])
    print("=== RATING ===", p["rating"], "trend", p["progress"]["elo_trend"])
    print("=== OBJECTIF ===", p["objective"])
    print("=== FORCES ===", p["strengths"])
    print("=== FAIBLESSES ===")
    for w in p["weaknesses"]:
        print("   ", w)
    print("=== CONCEPTS MANQUANTS ===")
    for c in p["concepts_missing"]:
        print("   ", c["label"], c["n"], "loss", c["avg_loss"])
    print("=== CAUSES RACINES ===")
    for c in p["root_causes"]:
        print("   ", c["label"], c["n"], c["share"], "%")
    print("=== STYLE ===")
    s = p["style"]
    print("   avg_time", s["avg_time_per_move"], "fast%", s["fast_move_pct"], "capture%", s["capture_pct"], "sacrifices", s["sacrifices"])
    print("   openings:", [(o["name"], o["n"], o["winrate"]) for o in s["openings"][:5]])
    print("=== MENTAL ===")
    for m in p["mental"]:
        print("   ", m["label"], "=", m["value"], "|", m["detail"])
    print("=== CONVERSION ===", p["conversion"])
    print("=== COGNITIF ===")
    for c in p["cognitive"]:
        print("   -", c)
    print()
    print("=== RESUME AGENT ===")
    print(await summarize_profile(db, "thegentleman31"))
    await db.close()


asyncio.run(main())
