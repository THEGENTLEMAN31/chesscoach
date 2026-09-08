"""Auth — inscription (pseudo chess.com vérifié) + routes fastapi-users.

Login/refresh/logout : gérés par fastapi-users via cookie httpOnly JWT
(CookieTransport). L'inscription est personnalisée pour vérifier sur la
PubAPI chess.com que le pseudo fourni existe bien.
"""
from __future__ import annotations

import asyncio
import logging

from fastapi import APIRouter, Depends, HTTPException, Request
from fastapi_users import exceptions
from fastapi_users.manager import BaseUserManager
from fastapi_users.schemas import BaseUser, BaseUserCreate, BaseUserUpdate
from sqlalchemy.exc import IntegrityError

from ..chesscom import ChessComClient, ChessComError
from ..config import settings
from ..users import UserManager, auth_backend, fastapi_users, get_user_manager

logger = logging.getLogger(__name__)

router = APIRouter(prefix="/api/auth", tags=["auth"])


class UserRead(BaseUser[int]):
    chesscom_username: str


class UserCreate(BaseUserCreate):
    """Champs acceptés à l'inscription. Pas de is_superuser/is_active/is_verified
    autres que les défauts (False) : create(safe=True) empêche toute élévation
    de privilège via le schéma. `chesscom_username` = pseudo vérifié."""
    chesscom_username: str


class UserUpdate(BaseUserUpdate):
    """Pas de chesscom_username exposé : le pseudo est l'identité (unique, stable)."""


@router.post("/register", response_model=UserRead, status_code=201)
async def register(
    user_create: UserCreate,
    request: Request,
    user_manager: BaseUserManager = Depends(get_user_manager),
) -> UserRead:
    if not settings.allow_registration:
        raise HTTPException(404, "l'inscription est fermée")
    # --- pseudo chess.com doit exister (PubAPI, sans clé) ---
    chesscom: ChessComClient = request.app.state.chesscom
    pseudo = user_create.chesscom_username.strip()
    if not pseudo:
        raise HTTPException(400, "pseudo chess.com requis")
    try:
        await chesscom.get_player(pseudo)
    except ChessComError as exc:
        raise HTTPException(
            400, f"Ce pseudo chess.com n'existe pas. Vérifie l'orthographe ({exc})."
        ) from exc
    except Exception as exc:  # noqa: BLE001 — réseau/API
        logger.warning("Vérification chess.com indisponible : %s", exc)
        raise HTTPException(503, "service chess.com indisponible, réessayez plus tard") from exc

    user_create.chesscom_username = pseudo
    try:
        user = await user_manager.create(user_create, safe=True, request=request)
    except exceptions.UserAlreadyExists as exc:
        raise HTTPException(400, "email déjà enregistré") from exc
    except IntegrityError as exc:
        raise HTTPException(400, "pseudo chess.com déjà utilisé") from exc
    # Vérification email à activer ; tant que désactivée, compte validé direct.
    if not settings.verify_email:
        user.is_verified = True
        await user_manager.user_db.session.commit()
    # Premier chargement de la data chess.com de ce pseudo, en tâche de fond.
    # Le compte n'est jamais « mort » : dès la création, son historique est
    # récupéré + analysé (rapid/blitz), scoped par ce pseudo.
    try:
        manager = request.app.state.manager
        asyncio.create_task(manager.start(pseudo, settings.sync_months))
    except Exception:  # noqa: BLE001 — ne bloque jamais l'inscription
        logger.warning("Premier sync auto échoué pour %s", pseudo, exc_info=True)
    return UserRead.model_validate(user)


router.include_router(fastapi_users.get_auth_router(auth_backend), prefix="/jwt")
router.include_router(
    fastapi_users.get_verify_router(UserRead), prefix="/verify", tags=["auth"]
)
router.include_router(
    fastapi_users.get_reset_password_router(), prefix="/password", tags=["auth"]
)
router.include_router(
    fastapi_users.get_users_router(UserRead, UserUpdate), prefix="/users", tags=["auth"]
)