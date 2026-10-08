from fastapi import HTTPException, Request
from fastapi.responses import JSONResponse
from pymongo.errors import PyMongoError
from starlette.middleware.body_limit import RequestBodyLimitMiddleware
from starlette.types import ASGIApp, Receive, Scope, Send

from .config import settings
from .security import admin_user, bearer, current_user


def upload_path(path):
    path = path.rstrip("/")
    return path == "/api/v1/admin/songs/upload" or (
        path.startswith("/api/v1/admin/songs/") and path.endswith("/artwork")
    )


class UploadAuthorization:
    """Reject unauthorized multipart requests before parsing/spooling any files."""

    def __init__(self, app: ASGIApp):
        self.app = app

    async def __call__(self, scope: Scope, receive: Receive, send: Send):
        if scope["type"] == "http" and scope["method"] == "POST" and upload_path(scope["path"]):
            request = Request(scope)
            try:
                await admin_user(await current_user(request, await bearer(request)))
            except HTTPException as exc:
                response = JSONResponse(
                    {"detail": exc.detail}, status_code=exc.status_code, headers=exc.headers
                )
                return await response(scope, receive, send)
            except PyMongoError:
                response = JSONResponse(
                    {"detail": "The library is temporarily unavailable. Try again shortly"},
                    status_code=503,
                )
                return await response(scope, receive, send)
        await self.app(scope, receive, send)


class RequestLimits:
    """Count actual body bytes, including chunked uploads before multipart parsing."""

    def __init__(self, app: ASGIApp):
        self.app = app

    async def __call__(self, scope: Scope, receive: Receive, send: Send):
        path = scope.get("path", "").rstrip("/")
        if path == "/api/v1/admin/songs/upload":
            maximum = (settings.max_upload_mb + 9) * 1024 * 1024
        elif path.startswith("/api/v1/admin/songs/") and path.endswith("/artwork"):
            maximum = 9 * 1024 * 1024
        else:
            maximum = 128 * 1024
        await RequestBodyLimitMiddleware(self.app, max_body_size=maximum)(scope, receive, send)
