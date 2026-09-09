"""Entraînement — puzzles tirés des MES parties (exercices), coups fautifs
réutilisables (moves) et suivi des tentatives (etudes). Trois endpoints scopés
par la session (pseudo chess.com de l'utilisateur connecté).
"""
from __future__ import annotations

import aiosqlite
from fastapi import APIRouter, Depends, HTTPException, Query

from ..agent import data_service as ds
from ..dependencies import get_db
from ..schemas import EtudeAttempt
from ..users import current_username

router = APIRouter(prefix="/api", tags=["training"])


@router.get("/exercices")
async def exercices(
    db: aiosqlite.Connection = Depends(get_db),
    username: str = Depends(current_username),
    concept: str | None = None,
    time_class: str | None = None,
    classification: str | None = None,
    nombre: int = 6,
) -> list[dict]:
    nombre = max(1, min(int(nombre), 30))
    return await ds.exercices(db, username, nombre, concept, time_class, classification)


@router.get("/moves")
async def moves(
    db: aiosqlite.Connection = Depends(get_db),
    username: str = Depends(current_username),
    classification: str | None = None,
    time_class: str | None = None,
    eco: str | None = None,
    concept: str | None = None,
    phase: str | None = None,
    order: str = Query("recent"),
    limit: int = Query(20, ge=1, le=100),
) -> list[dict]:
    return await ds.recent_moves(db, username, classification, time_class,
                                 eco, concept, phase, order, limit)


@router.get("/etudes")
async def etudes_get(
    db: aiosqlite.Connection = Depends(get_db),
    username: str = Depends(current_username),
    time_class: str | None = None,
) -> dict:
    return await ds.etude_stats(db, username, time_class)


@router.post("/etudes")
async def etudes_post(
    req: EtudeAttempt,
    db: aiosqlite.Connection = Depends(get_db),
    username: str = Depends(current_username),
) -> dict:
    # L'utilisateur est toujours dérivé de la session : on ignore req.username.
    req.username = username
    try:
        row_id = await ds.record_etude(db, req)
    except Exception as exc:  # noqa: BLE001
        raise HTTPException(500, f"Enregistrement impossible : {exc}") from exc
    return {"ok": True, "id": row_id}