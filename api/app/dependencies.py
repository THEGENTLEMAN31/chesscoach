"""Dépendances partagées des routers : accès à l'état applicatif."""
from __future__ import annotations

import aiosqlite
from fastapi import Request

from .services.manager import SyncManager


def get_db(request: Request) -> aiosqlite.Connection:
    return request.app.state.db


def get_chesscom(request: Request):
    return request.app.state.chesscom


def get_book(request: Request):
    return request.app.state.book


def get_manager(request: Request) -> SyncManager:
    return request.app.state.manager