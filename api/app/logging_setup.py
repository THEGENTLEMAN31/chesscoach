"""Logging structuré (JSON) + request_id, sans dépendance externe.

Toute sortie de log passe par un formateur JSON (timestamp, niveau, logger,
message, champs extra) au lieu du texte brut. Un middleware injecte un
request_id par requête dans le contexte (extra) pour corréler les logs.
"""
from __future__ import annotations

import json
import logging
import sys
import time
import uuid
from typing import Any

from starlette.middleware.base import BaseHTTPMiddleware
from starlette.requests import Request


class JsonFormatter(logging.Formatter):
    def format(self, record: logging.LogRecord) -> str:
        entry: dict[str, Any] = {
            "ts": time.strftime("%Y-%m-%dT%H:%M:%S", time.gmtime(record.created)),
            "level": record.levelname,
            "logger": record.name,
            "message": record.getMessage(),
        }
        # request_id et autres attributs custom injectés via extra={}
        for k in ("request_id", "username", "action"):
            v = getattr(record, k, None)
            if v is not None:
                entry[k] = v
        exc = record.exc_info and logging.Formatter.formatException(self, record.exc_info)
        if exc:
            entry["exc"] = exc
        return json.dumps(entry, ensure_ascii=False)


def setup_logging(level: int = logging.INFO) -> None:
    handler = logging.StreamHandler(sys.stdout)
    handler.setFormatter(JsonFormatter())
    root = logging.getLogger()
    root.handlers[:] = [handler]
    root.setLevel(level)


class RequestIdMiddleware(BaseHTTPMiddleware):
    """Injecte un request_id par requête pour corréler les logs."""

    async def dispatch(self, request: Request, call_next):
        request_id = uuid.uuid4().hex[:12]
        logger = logging.getLogger("http")
        start = time.monotonic()
        logger.info("→ %s %s", request.method, request.url.path, extra={"request_id": request_id})
        try:
            response = await call_next(request)
        except Exception as exc:  # noqa: BLE001
            logger.exception(
                "✗ %s %s", request.method, request.url.path,
                extra={"request_id": request_id},
            )
            raise exc
        duration_ms = int((time.monotonic() - start) * 1000)
        logger.info(
            "← %s %s (%d) %dms",
            request.method, request.url.path, response.status_code, duration_ms,
            extra={"request_id": request_id},
        )
        response.headers["X-Request-Id"] = request_id
        return response