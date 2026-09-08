"""Auth V2 — fastapi-users sur SQLite (même fichier que le reste).

L'identifiant métier de l'utilisateur est son pseudo chess.com (unique,
vérifié à l'inscription via la PubAPI) : les requêtes multiples ne passent
toujours que par `chesscom_username`, dérivé de la session — jamais du client.

Coexistence SQLAlchemy (table `users`) + aiosqlite brut (tables du POC) sur le
même fichier : SQLite en WAL le permet sans friction.
"""
from __future__ import annotations

import logging
from typing import AsyncIterator

import aiosqlite
from fastapi import Depends, Request
from fastapi_users import BaseUserManager, FastAPIUsers, IntegerIDMixin
from fastapi_users.authentication import (
    AuthenticationBackend,
    CookieTransport,
    JWTStrategy,
)
from fastapi_users.db import SQLAlchemyUserDatabase
from sqlalchemy import Boolean, Integer, select, String
from sqlalchemy.ext.asyncio import (
    AsyncSession,
    async_sessionmaker,
    create_async_engine,
)
from sqlalchemy.orm import DeclarativeBase, Mapped, mapped_column

from .config import settings

logger = logging.getLogger(__name__)


# ---------------------------------------------------------------- SQLAlchemy
class Base(DeclarativeBase):
    pass


class User(Base):
    __tablename__ = "users"

    id: Mapped[int] = mapped_column(Integer, primary_key=True)
    email: Mapped[str] = mapped_column(String(length=320), unique=True, index=True)
    hashed_password: Mapped[str] = mapped_column(String(length=1024))
    is_active: Mapped[bool] = mapped_column(Boolean, default=True)
    is_superuser: Mapped[bool] = mapped_column(Boolean, default=False)
    is_verified: Mapped[bool] = mapped_column(Boolean, default=False)
    # Identifiant métier : pseudo chess.com, unique (1 pseudo vérifié/compte).
    chesscom_username: Mapped[str] = mapped_column(String(length=64), unique=True, index=True)


async def init_user_engine() -> None:
    """Crée l'engine SQLAlchemy (lazy) et les tables `users`."""
    global _engine, _sessionmaker
    url = f"sqlite+aiosqlite:///{settings.db_path}"
    _engine = create_async_engine(url, connect_args={"timeout": 15})
    _sessionmaker = async_sessionmaker(_engine, class_=AsyncSession, expire_on_commit=False)
    async with _engine.begin() as conn:
        await conn.run_sync(Base.metadata.create_all)


_engine = None
_sessionmaker: async_sessionmaker | None = None


async def get_session() -> AsyncIterator[AsyncSession]:
    assert _sessionmaker is not None, "init_user_engine() doit être appelé au démarrage"
    async with _sessionmaker() as session:
        yield session


# ------------------------------------------------------------------- manager
class UserManager(IntegerIDMixin, BaseUserManager[User, int]):
    reset_password_token_secret = settings.jwt_secret
    verification_token_secret = settings.jwt_secret

    async def on_after_register(self, user: User, request: Request | None) -> None:
        logger.info("Nouvel utilisateur #%s (%s, chess.com %s)",
                    user.id, user.email, user.chesscom_username)

    async def on_after_request_verify(self, user: User, token: str,
                                      request: Request | None) -> None:
        logger.info("Vérification email pour %s : %s", user.email, token)

    async def on_after_forgot_password(self, user: User, token: str,
                                       request: Request | None) -> None:
        logger.info("Réinitialisation mot de passe pour %s : %s", user.email, token)


async def get_user_manager(session: AsyncSession = Depends(get_session)) -> AsyncIterator[UserManager]:
    yield UserManager(SQLAlchemyUserDatabase(session, User))


# ------------------------------------------------------------------- backend
def get_jwt_strategy() -> JWTStrategy:
    return JWTStrategy(secret=settings.jwt_secret, lifetime_seconds=settings.session_lifetime_s)


_transport = CookieTransport(
    cookie_name=settings.cookie_name,
    cookie_max_age=settings.session_lifetime_s,
    cookie_secure=settings.cookie_secure,
    cookie_samesite="lax",
)

auth_backend = AuthenticationBackend(
    name="cookie", transport=_transport, get_strategy=get_jwt_strategy
)

fastapi_users = FastAPIUsers[User, int](get_user_manager, [auth_backend])

current_active_user = fastapi_users.current_user(active=True)


def current_username(user: User = Depends(current_active_user)) -> str:
    """Pseudo chess.com de l'utilisateur connecté — unique scope des données."""
    return user.chesscom_username


# ---------------------------------------------------------------------- seed
async def ensure_seed_user(db: aiosqlite.Connection) -> None:
    """Crée le compte admin d'accès à la data historique (thegentleman31).

    S'exécute seulement si 1) le mot de passe seed est fourni en env, 2) la
    data historique du pseudo existe en base, 3) aucun compte n'a encore ce
    pseudo. Idempotent.
    """
    if not settings.seed_admin_password:
        return
    async with _sessionmaker() as session:  # type: ignore[union-attr]
        exists = await session.scalar(
            select(User.id).where(User.chesscom_username == settings.seed_admin_chesscom)
        )
        if exists is not None:
            return
    row = await (await db.execute(
        "SELECT COUNT(*) AS n FROM games WHERE username=?", (settings.seed_admin_chesscom,)
    )).fetchone()
    if not row or not row["n"]:
        logger.info("Seed admin ignoré : pas de parties pour %s", settings.seed_admin_chesscom)
        return
    from fastapi_users.schemas import BaseUserCreate

    class _AdminCreate(BaseUserCreate):
        chesscom_username: str
        is_superuser: bool = True
        is_active: bool = True
        is_verified: bool = True

    assert _sessionmaker is not None, "init_user_engine() doit être appelé au démarrage"
    # Note : flags passés au CONSTRUCTEUR (pas juste en defaults de la classe) :
    # create_update_dict_superuser() est `model_dump(exclude_unset=True)` et un
    # default n'est pas "set" → il serait exclu du dict envoyé à la DB.
    create = _AdminCreate(
        email=settings.seed_admin_email,
        password=settings.seed_admin_password,
        chesscom_username=settings.seed_admin_chesscom,
        is_superuser=True,
        is_active=True,
        is_verified=True,
    )
    async with _sessionmaker() as session:
        manager = UserManager(SQLAlchemyUserDatabase(session, User))
        user = await manager.create(create, safe=False, request=None)
    logger.info("Seed admin créé : %s (chess.com %s)", user.email, user.chesscom_username)