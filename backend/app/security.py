import hashlib
import secrets
from datetime import timedelta

import jwt
from fastapi import Depends, HTTPException, Request
from fastapi.security import HTTPAuthorizationCredentials, HTTPBearer
from pwdlib import PasswordHash

from .config import settings
from .database import now

passwords = PasswordHash.recommended()
dummy_hash = passwords.hash(secrets.token_hex(16))
bearer = HTTPBearer(auto_error=False)
COOKIE = "vault_refresh"


def digest(value):
    return hashlib.sha256(value.encode()).hexdigest()


async def create_recovery_token(db, user_id):
    token = secrets.token_urlsafe(32)
    identity = f"recovery:{user_id}"
    # A fixed per-user document makes the newest link replace the previous link.
    await db.reset_tokens.update_one(
        {"_id": identity},
        {"$set": {
            "user_id": user_id,
            "token_hash": digest(token),
            "expires_at": now() + timedelta(hours=1),
        }},
        upsert=True,
    )
    await db.reset_tokens.delete_many({"user_id": user_id, "_id": {"$ne": identity}})
    return token


def safe_user(user):
    return {
        "id": user["_id"],
        "name": user["name"],
        "email": user["email"],
        "role": user["role"],
        "active": user["active"],
        "created_at": user["created_at"],
    }


def issue_access(user, session_id):
    return jwt.encode(
        {
            "sub": user["_id"],
            "sid": session_id,
            "aud": "vault-access",
            "iat": now(),
            "exp": now() + timedelta(minutes=15),
        },
        settings.auth_secret,
        algorithm="HS256",
    )


def require_origin(request: Request):
    if request.headers.get("origin") not in settings.allowed_origins:
        raise HTTPException(403, "This request origin is not allowed")


def set_cookie(response, token):
    response.set_cookie(
        COOKIE,
        token,
        max_age=7 * 86400,
        httponly=True,
        secure=settings.cookie_secure,
        samesite="lax",
        path="/api/v1",
    )


def clear_cookie(response):
    response.delete_cookie(
        COOKIE, path="/api/v1", secure=settings.cookie_secure, httponly=True, samesite="lax"
    )


async def current_user(
    request: Request, credentials: HTTPAuthorizationCredentials | None = Depends(bearer)
):
    if not credentials:
        raise HTTPException(401, "Please sign in", headers={"WWW-Authenticate": "Bearer"})
    try:
        claims = jwt.decode(
            credentials.credentials,
            settings.auth_secret,
            algorithms=["HS256"],
            audience="vault-access",
            options={"require": ["sub", "sid", "exp", "iat", "aud"]},
        )
    except jwt.InvalidTokenError as exc:
        raise HTTPException(401, "Your session expired. Please sign in again") from exc
    session = await request.app.state.db.sessions.find_one(
        {"_id": claims["sid"], "user_id": claims["sub"], "expires_at": {"$gt": now()}}
    )
    user = await request.app.state.db.users.find_one({"_id": claims["sub"], "active": True})
    if not session or not user:
        raise HTTPException(401, "This session is no longer active")
    request.state.session_id = session["_id"]
    return user


async def admin_user(user=Depends(current_user)):
    if user["role"] not in ("owner", "admin"):
        raise HTTPException(403, "Administrator access is required")
    return user


async def media_user(request: Request):
    # Native media elements cannot attach an Authorization header. The same-origin
    # HttpOnly session cookie authorizes read-only media endpoints only.
    token = request.cookies.get(COOKIE, "")
    session = (
        await request.app.state.db.sessions.find_one(
            {"refresh_hash": digest(token), "expires_at": {"$gt": now()}}
        )
        if token
        else None
    )
    user = (
        await request.app.state.db.users.find_one({"_id": session["user_id"], "active": True})
        if session
        else None
    )
    if not user:
        raise HTTPException(401, "Please sign in to listen")
    return user


async def limit(request: Request, bucket: str, key: str, maximum: int):
    from pymongo import ReturnDocument

    minute = int(now().timestamp()) // 60
    record = await request.app.state.db.rate_limits.find_one_and_update(
        {"_id": digest(f"{bucket}:{key}:{minute}")},
        {"$inc": {"count": 1}, "$setOnInsert": {"expires_at": now() + timedelta(minutes=2)}},
        upsert=True,
        return_document=ReturnDocument.AFTER,
    )
    if record["count"] > maximum:
        raise HTTPException(
            429, "Too many attempts. Try again in a minute", headers={"Retry-After": "60"}
        )
