import secrets
from datetime import timedelta

from fastapi import APIRouter, Depends, HTTPException, Request, Response
from pymongo import ReturnDocument
from pymongo.errors import DuplicateKeyError
from starlette.concurrency import run_in_threadpool

from .database import audit, now, public, uid
from .schemas import Login, PasswordInput, ProfileInput, Register, ResetInput
from .security import (
    COOKIE,
    clear_cookie,
    current_user,
    digest,
    dummy_hash,
    issue_access,
    limit,
    passwords,
    require_origin,
    safe_user,
    set_cookie,
)

router = APIRouter(prefix="/api/v1/auth", tags=["Accounts"])
me = APIRouter(prefix="/api/v1/me", tags=["Your account"])


@router.get("/session")
async def session_status(request: Request):
    token = request.cookies.get(COOKIE, "")
    session = (
        await request.app.state.db.sessions.find_one(
            {"refresh_hash": digest(token), "expires_at": {"$gt": now()}}
        )
        if token
        else None
    )
    user = (
        await request.app.state.db.users.find_one(
            {"_id": session["user_id"], "active": True}, {"_id": 1}
        )
        if session
        else None
    )
    return {"authenticated": bool(user)}


async def start_session(request, response, user):
    token, session_id = secrets.token_urlsafe(48), uid()
    await request.app.state.db.sessions.insert_one(
        {
            "_id": session_id,
            "user_id": user["_id"],
            "refresh_hash": digest(token),
            "created_at": now(),
            "expires_at": now() + timedelta(days=7),
            "device": request.headers.get("user-agent", "Unknown device")[:250],
        }
    )
    set_cookie(response, token)
    return {"user": safe_user(user), "access_token": issue_access(user, session_id)}


@router.get("/invitation")
async def invitation(request: Request, token: str):
    await limit(request, "invite-check", request.client.host, 30)
    invite = await request.app.state.db.invitations.find_one(
        {"token_hash": digest(token), "used": False, "expires_at": {"$gt": now()}}
    )
    if not invite:
        raise HTTPException(400, "This invitation has expired or has already been used")
    return {"email": invite["email"], "expires_at": invite["expires_at"]}


@router.post("/register", status_code=201)
async def register(data: Register, request: Request, response: Response):
    require_origin(request)
    await limit(request, "register", request.client.host, 5)
    db, email = request.app.state.db, data.email.lower()
    user_id = uid()
    hashed = await run_in_threadpool(passwords.hash, data.password)
    invite = await db.invitations.find_one_and_update(
        {
            "token_hash": digest(data.invitation),
            "email": email,
            "used": False,
            "expires_at": {"$gt": now()},
        },
        {"$set": {"used": True, "used_by": user_id}},
        return_document=ReturnDocument.AFTER,
    )
    if not invite:
        raise HTTPException(400, "A valid invitation for this email is required")
    user = {
        "_id": user_id,
        "name": data.name,
        "email": email,
        "password_hash": hashed,
        "role": "user",
        "active": True,
        "created_at": now(),
    }
    try:
        await db.users.insert_one(user)
    except DuplicateKeyError as exc:
        await db.invitations.update_one(
            {"_id": invite["_id"], "used_by": user_id},
            {"$set": {"used": False}, "$unset": {"used_by": ""}},
        )
        raise HTTPException(409, "An account with this email already exists") from exc
    await audit(db, user, "account.registered", user_id)
    return await start_session(request, response, user)


@router.post("/login")
async def login(data: Login, request: Request, response: Response):
    require_origin(request)
    await limit(request, "login-ip", request.client.host, 20)
    await limit(request, "login-email", data.email.lower(), 10)
    user = await request.app.state.db.users.find_one({"email": data.email.lower()})
    valid = await run_in_threadpool(
        passwords.verify, data.password, user["password_hash"] if user else dummy_hash
    )
    if not user or not valid or not user["active"]:
        raise HTTPException(401, "Email or password is incorrect, or this account is disabled")
    return await start_session(request, response, user)


@router.post("/refresh")
async def refresh(request: Request, response: Response):
    require_origin(request)
    await limit(request, "refresh", request.client.host, 60)
    current, replacement = request.cookies.get(COOKIE, ""), secrets.token_urlsafe(48)
    if not current:
        raise HTTPException(401, "Please sign in")
    session = await request.app.state.db.sessions.find_one_and_update(
        {"refresh_hash": digest(current), "expires_at": {"$gt": now()}},
        {"$set": {"refresh_hash": digest(replacement)}},
        return_document=ReturnDocument.AFTER,
    )
    user = (
        await request.app.state.db.users.find_one({"_id": session["user_id"], "active": True})
        if session
        else None
    )
    if not user:
        raise HTTPException(401, "Your session is no longer active")
    set_cookie(response, replacement)
    return {"user": safe_user(user), "access_token": issue_access(user, session["_id"])}


@router.post("/logout", status_code=204)
async def logout(request: Request, response: Response):
    require_origin(request)
    await request.app.state.db.sessions.delete_one(
        {"refresh_hash": digest(request.cookies.get(COOKIE, ""))}
    )
    clear_cookie(response)


@router.post("/upload-token")
async def upload_token(request: Request, user=Depends(current_user)):
    return {"token": issue_access(user, request.state.session_id)}


@router.post("/reset-password")
async def reset_password(data: ResetInput, request: Request):
    require_origin(request)
    await limit(request, "reset", request.client.host, 5)
    hashed = await run_in_threadpool(passwords.hash, data.password)
    db = request.app.state.db
    token = await db.reset_tokens.find_one_and_delete(
        {"token_hash": digest(data.token), "expires_at": {"$gt": now()}}
    )
    if not token:
        raise HTTPException(400, "This recovery link is invalid or has expired")
    await db.users.update_one({"_id": token["user_id"]}, {"$set": {"password_hash": hashed}})
    await db.sessions.delete_many({"user_id": token["user_id"]})
    await db.reset_tokens.delete_many({"user_id": token["user_id"]})
    return {"message": "Password updated. Please sign in again"}


@me.get("")
async def profile(user=Depends(current_user)):
    return safe_user(user)


@me.patch("")
async def update_profile(data: ProfileInput, request: Request, user=Depends(current_user)):
    await request.app.state.db.users.update_one({"_id": user["_id"]}, {"$set": {"name": data.name}})
    return safe_user({**user, "name": data.name})


@me.post("/password")
async def change_password(
    data: PasswordInput, request: Request, response: Response, user=Depends(current_user)
):
    await limit(request, "password-change", user["_id"], 5)
    if not await run_in_threadpool(passwords.verify, data.current_password, user["password_hash"]):
        raise HTTPException(400, "Current password is incorrect")
    hashed = await run_in_threadpool(passwords.hash, data.password)
    await request.app.state.db.users.update_one(
        {"_id": user["_id"]}, {"$set": {"password_hash": hashed}}
    )
    await request.app.state.db.sessions.delete_many({"user_id": user["_id"]})
    await request.app.state.db.reset_tokens.delete_many({"user_id": user["_id"]})
    clear_cookie(response)
    await audit(request.app.state.db, user, "account.password_changed", user["_id"])
    return {"message": "Password updated. Please sign in again"}


@me.get("/sessions")
async def sessions(request: Request, user=Depends(current_user)):
    return [
        {**public(s), "current": s["_id"] == request.state.session_id}
        for s in await request.app.state.db.sessions.find(
            {"user_id": user["_id"], "expires_at": {"$gt": now()}}, {"refresh_hash": 0}
        ).to_list(100)
    ]


@me.delete("/sessions/{session_id}", status_code=204)
async def revoke(session_id: str, request: Request, user=Depends(current_user)):
    result = await request.app.state.db.sessions.delete_one(
        {"_id": session_id, "user_id": user["_id"]}
    )
    if not result.deleted_count:
        raise HTTPException(404, "Session not found")
