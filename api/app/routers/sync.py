"""Sync chess.com (batch serveur, moteur natif) pour l'utilisateur connecté.

Attention : l'import instantané côté client (local-first) viendra en P1 ;
ce batch sert surtout à reconstruire l'historique lors de l'inscription.
"""
from __future__ import annotations

from fastapi import APIRouter, Depends, HTTPException

from ..dependencies import get_manager
from ..schemas import SyncRequest, SyncResult
from ..services.manager import SyncManager
from ..users import current_username

router = APIRouter(prefix="/api/sync", tags=["sync"])


@router.post("", response_model=SyncResult, status_code=202)
async def sync(
    req: SyncRequest,
    manager: SyncManager = Depends(get_manager),
    username: str = Depends(current_username),
) -> SyncResult:
    result = await manager.start(username, req.months)
    if result.get("status") == "already_running":
        raise HTTPException(409, "un pipeline est déjà en cours")
    return SyncResult(**result)


@router.get("/status")
async def sync_status(
    manager: SyncManager = Depends(get_manager),
    username: str = Depends(current_username),
) -> dict:
    return await manager.status(username)