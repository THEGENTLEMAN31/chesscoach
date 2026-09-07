import asyncio
from pathlib import Path

from app.analysis_client import AnalyzerClient
from app.chesscom import ChessComClient
from app.db import connect
from app.openings import OpeningBook
from app.services.sync import SyncPipeline


async def main():
    db = await connect(Path("/app/data/chesscoach.db"))
    analyzer = AnalyzerClient()
    book = OpeningBook()
    await asyncio.to_thread(book.load)
    pipe = SyncPipeline(db, ChessComClient(), analyzer, book)
    n = await pipe.analyze_new("thegentleman31", limit=5)
    print("analyzed in this call:", n, flush=True)
    await db.close()


asyncio.run(main())
