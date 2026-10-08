import asyncio
import logging
from contextlib import asynccontextmanager

from fastapi import FastAPI, HTTPException, Request
from fastapi.exceptions import RequestValidationError
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse
from pymongo.errors import PyMongoError
from starlette.concurrency import run_in_threadpool

from . import admin, auth, catalog, personal
from .config import settings
from .database import connect, now
from .imports import seed_labels
from .middleware import RequestLimits, UploadAuthorization
from .storage import StorageError, check_storage

log = logging.getLogger(__name__)


@asynccontextmanager
async def lifespan(app):
    client, db = await connect()
    app.state.client, app.state.db, app.state.tasks = client, db, set()
    await seed_labels(db)
    # Jobs are persisted but processing is local to this API process in V1.
    await db.upload_jobs.update_many(
        {"status": {"$in": ["queued", "processing"]}},
        {"$set": {"status": "interrupted", "message": "API restarted. Retry this import"}},
    )
    # V1 runs one API worker; a restarted process can immediately retry its import.
    await db.locks.update_one({"_id": "folder-import"}, {"$set": {"expires_at": now()}})
    yield
    for task in list(app.state.tasks):
        task.cancel()
    if app.state.tasks:
        await asyncio.gather(*app.state.tasks, return_exceptions=True)
    await client.close()


def create_app():
    app = FastAPI(
        title="My Music Vault API",
        version="1.0.0",
        lifespan=lifespan,
        docs_url="/docs" if settings.vault_env == "development" else None,
        openapi_url="/openapi.json" if settings.vault_env == "development" else None,
        redoc_url=None,
    )
    app.add_middleware(UploadAuthorization)
    app.add_middleware(
        CORSMiddleware,
        allow_origins=settings.allowed_origins,
        allow_credentials=True,
        allow_methods=["GET", "HEAD", "POST", "PUT", "PATCH", "DELETE"],
        allow_headers=["Authorization", "Content-Type", "Range"],
        expose_headers=["Accept-Ranges", "Content-Range", "Content-Length"],
    )
    app.add_middleware(RequestLimits)

    @app.middleware("http")
    async def boundaries(request: Request, call_next):
        response = await call_next(request)
        response.headers["X-Content-Type-Options"] = "nosniff"
        response.headers["Referrer-Policy"] = "no-referrer"
        response.headers["X-Frame-Options"] = "DENY"
        if settings.vault_env == "production":
            response.headers["Content-Security-Policy"] = (
                "default-src 'none'; frame-ancestors 'none'; base-uri 'none'"
            )
        if "/audio" not in request.url.path:
            response.headers["Cache-Control"] = "no-store"
        return response

    @app.exception_handler(RequestValidationError)
    async def invalid_input(request, exc):
        # Pydantic includes rejected inputs by default, which can contain credentials.
        errors = [{key: error[key] for key in ("type", "loc", "msg")} for error in exc.errors()]
        return JSONResponse({"detail": errors}, status_code=422)

    @app.exception_handler(PyMongoError)
    async def database_error(request, exc):
        log.error("Database operation failed: %s", type(exc).__name__)
        return JSONResponse(
            {"detail": "The library is temporarily unavailable. Try again shortly"}, status_code=503
        )

    @app.exception_handler(StorageError)
    async def storage_error(request, exc):
        return JSONResponse({"detail": str(exc)}, status_code=503)

    @app.get("/health", tags=["Health"])
    async def health():
        return {"status": "ok"}

    @app.get("/health/ready", tags=["Health"])
    async def ready(request: Request):
        await request.app.state.db.command("ping")
        if not settings.storage_dir.is_dir():
            raise HTTPException(503, "Storage is unavailable")
        await run_in_threadpool(check_storage)
        return {"status": "ready"}

    for router in (auth.router, auth.me, catalog.router, personal.router, admin.router):
        app.include_router(router)
    return app


app = create_app()
