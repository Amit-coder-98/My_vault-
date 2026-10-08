import asyncio
import re
import secrets
from datetime import timedelta

from fastapi import APIRouter, Depends, File, Form, HTTPException, Query, Request, UploadFile
from pymongo.errors import DuplicateKeyError
from starlette.concurrency import run_in_threadpool

from .catalog import song_public
from .config import settings
from .database import audit, now, public, uid
from .imports import import_folder, new_job, preview
from .media import SUPPORTED, inspect, store_source
from .schemas import BulkTags, Invite, LabelInput, MetadataGroup, SongInput, UserUpdate
from .security import admin_user, create_recovery_token, digest, limit, safe_user
from .storage import (
    check_storage,
    cleanup_asset,
    folder_name,
    migrate_local_song,
    remove_asset,
    save_cover,
)

router = APIRouter(prefix="/api/v1/admin", tags=["Administration"])


async def validate_tags(db, data):
    for kind, ids in (
        ("mood", data.mood_ids),
        ("genre", getattr(data, "genre_ids", [])),
        ("language", [data.language_id] if getattr(data, "language_id", None) else []),
    ):
        if len(set(ids)) != len(ids) or await db.labels.count_documents(
            {"_id": {"$in": ids}, "kind": kind}
        ) != len(ids):
            raise HTTPException(400, f"Choose existing {kind} labels")


@router.get("/overview")
async def overview(request: Request, actor=Depends(admin_user)):
    db = request.app.state.db
    statuses = {
        s: await db.songs.count_documents({"status": s}) for s in ("published", "draft", "archived")
    }
    storage = await (
        await db.songs.aggregate([{"$group": {"_id": None, "bytes": {"$sum": "$file_size"}}}])
    ).to_list(1)
    return {
        "songs": statuses,
        "users": await db.users.count_documents({}),
        "active_users": await db.users.count_documents({"active": True}),
        "storage_bytes": storage[0]["bytes"] if storage else 0,
        "listening_records": await db.history.count_documents({}),
        "recent_songs": [
            song_public(s)
            for s in await db.songs.find({}).sort("created_at", -1).limit(5).to_list(5)
        ],
        "api": "healthy",
        "database": "MongoDB Atlas connected"
        if settings.mongodb_url.startswith("mongodb+srv://")
        else "MongoDB connected",
        "storage": await run_in_threadpool(check_storage),
        "max_upload_mb": settings.max_upload_mb,
        "pending_asset_cleanup": await db.asset_cleanup.count_documents({}),
    }


@router.get("/songs")
async def songs(
    request: Request,
    q: str = Query(default="", max_length=200),
    status: str = "",
    offset: int = Query(default=0, ge=0),
    limit: int = Query(default=100, ge=1, le=200),
    actor=Depends(admin_user),
):
    query = {}
    if status:
        query["status"] = status
    if q:
        query["$or"] = [
            {key: {"$regex": re.escape(q), "$options": "i"}} for key in ("title", "artist", "album")
        ]
    db = request.app.state.db
    return {
        "items": [
            song_public(s)
            for s in await db.songs.find(query)
            .sort("created_at", -1)
            .skip(offset)
            .limit(limit)
            .to_list(limit)
        ],
        "total": await db.songs.count_documents(query),
    }


@router.patch("/songs/{song_id}")
async def edit_song(song_id: str, data: SongInput, request: Request, actor=Depends(admin_user)):
    await validate_tags(request.app.state.db, data)
    values = {**data.model_dump(), "updated_at": now(), "metadata_review": False}
    # Editing metadata must not change the existing physical asset location.
    values.pop("storage_folder", None)
    result = await request.app.state.db.songs.update_one({"_id": song_id}, {"$set": values})
    if not result.matched_count:
        raise HTTPException(404, "Song not found")
    await audit(request.app.state.db, actor, "song.updated", song_id, data.title)
    return song_public(await request.app.state.db.songs.find_one({"_id": song_id}))


@router.post("/songs/bulk-moods")
async def bulk_moods(data: BulkTags, request: Request, actor=Depends(admin_user)):
    await validate_tags(request.app.state.db, data)
    result = await request.app.state.db.songs.update_many(
        {"_id": {"$in": data.song_ids}}, {"$set": {"mood_ids": data.mood_ids, "updated_at": now()}}
    )
    await audit(
        request.app.state.db, actor, "songs.moods_updated", "bulk", f"{result.matched_count} songs"
    )
    return {"updated": result.matched_count}


@router.delete("/songs/{song_id}", status_code=204)
async def delete_song(
    song_id: str, request: Request, permanent: bool = False, actor=Depends(admin_user)
):
    db = request.app.state.db
    song = await db.songs.find_one({"_id": song_id})
    if not song:
        raise HTTPException(404, "Song not found")
    if not permanent:
        await db.songs.update_one(
            {"_id": song_id}, {"$set": {"status": "archived", "updated_at": now()}}
        )
        await audit(db, actor, "song.archived", song_id, song["title"])
        return
    if song["status"] != "archived":
        raise HTTPException(409, "Archive this song before permanently deleting it")
    for field in ("audio_path", "cover_path"):
        relative = song.get(field)
        shared = {field: relative, "_id": {"$ne": song_id}}
        if song.get("storage_backend", "local") == "b2":
            shared.update({
                "storage_backend": "b2",
                "storage_bucket": song.get("storage_bucket"),
                field.replace("_path", "_version_id"): song.get(field.replace("_path", "_version_id")),
            })
        else:
            shared["storage_backend"] = {"$in": ["local", None]}
        if relative and not await db.songs.find_one(shared, {"_id": 1}):
            await run_in_threadpool(remove_asset, song, field)
    await db.favorites.delete_many({"song_id": song_id})
    await db.history.delete_many({"song_id": song_id})
    await db.playlists.update_many({"track_ids": song_id}, {"$pull": {"track_ids": song_id}})
    await db.songs.delete_one({"_id": song_id})
    await audit(db, actor, "song.deleted", song_id, song["title"])


async def save_upload(upload, path, maximum):
    size = 0
    try:
        with path.open("wb") as target:
            while chunk := await upload.read(1024 * 1024):
                size += len(chunk)
                if size > maximum:
                    raise HTTPException(413, "This file exceeds the upload limit")
                await run_in_threadpool(target.write, chunk)
    finally:
        await upload.close()


@router.post("/songs/upload", status_code=201)
async def upload_song(
    request: Request,
    audio: UploadFile = File(),
    metadata: str = Form(),
    cover: UploadFile | None = File(default=None),
    actor=Depends(admin_user),
):
    from pathlib import Path

    from pydantic import ValidationError

    try:
        data = SongInput.model_validate_json(metadata)
    except ValidationError as exc:
        raise HTTPException(422, "Check the song metadata fields") from exc
    await validate_tags(request.app.state.db, data)
    extension = Path(audio.filename or "").suffix.lower()
    if extension not in SUPPORTED:
        raise HTTPException(400, "Supported formats: MP3, FLAC, M4A, OGG and WAV")
    temporary_dir = settings.storage_dir / "temporary"
    temporary_dir.mkdir(exist_ok=True)
    temporary = temporary_dir / (uid() + extension)
    try:
        await save_upload(audio, temporary, settings.max_upload_mb * 1024 * 1024)
        extracted = await run_in_threadpool(inspect, temporary, audio.filename)
        if await request.app.state.db.songs.find_one({"sha256": extracted["sha256"]}):
            raise HTTPException(409, "This exact audio file is already in your vault")
        raw = None
        if cover:
            raw = await cover.read(8 * 1024 * 1024 + 1)
            await cover.close()
            if len(raw) > 8 * 1024 * 1024:
                raise HTTPException(413, "Cover images must be smaller than 8 MB")
        folder = data.storage_folder
        if not folder and data.mood_ids:
            mood = await request.app.state.db.labels.find_one({"_id": data.mood_ids[0]})
            folder = mood["name"] if mood else "Uploads"
        folder = folder_name(folder)
        if settings.storage_backend == "b2":
            await run_in_threadpool(check_storage)
        extracted["filename"] = Path(audio.filename or "Audio").name
        assets = await run_in_threadpool(store_source, temporary, extracted, folder, raw)
        values = data.model_dump()
        for key, default in (("artist", "Unknown artist"), ("album", "Singles"), ("year", 0)):
            if values[key] == default:
                values[key] = extracted[key]
        if values["title"] == Path(audio.filename or "").stem[:200]:
            values["title"] = extracted["title"]
        song = {
            "_id": uid(),
            **extracted,
            **assets,
            **values,
            "storage_folder": folder,
            "metadata_review": values["artist"] == "Unknown artist",
            "created_at": now(),
            "updated_at": now(),
            "filename": audio.filename or "Audio",
        }
        await request.app.state.db.songs.insert_one(song)
        await audit(request.app.state.db, actor, "song.uploaded", song["_id"], song["title"])
        return song_public(song)
    except ValueError as exc:
        raise HTTPException(400, str(exc)) from exc
    except DuplicateKeyError as exc:
        raise HTTPException(409, "This exact audio file is already in your vault") from exc
    finally:
        temporary.unlink(missing_ok=True)


@router.post("/songs/{song_id}/artwork")
async def update_artwork(
    song_id: str, request: Request, cover: UploadFile = File(), actor=Depends(admin_user)
):
    song = await request.app.state.db.songs.find_one({"_id": song_id})
    if not song:
        raise HTTPException(404, "Song not found")
    raw = await cover.read(8 * 1024 * 1024 + 1)
    await cover.close()
    if len(raw) > 8 * 1024 * 1024:
        raise HTTPException(413, "Cover images must be smaller than 8 MB")
    try:
        if settings.storage_backend == "b2" or song.get("storage_backend") == "b2":
            await run_in_threadpool(check_storage)
        migrated = await run_in_threadpool(migrate_local_song, song)
        target = {**song, **(migrated or {})}
        assets = await run_in_threadpool(save_cover, raw, target)
    except ValueError as exc:
        raise HTTPException(400, str(exc)) from exc
    await request.app.state.db.songs.update_one(
        {"_id": song_id}, {"$set": {**(migrated or {}), **assets, "updated_at": now()}}
    )
    if song.get("cover_path") != assets["cover_path"]:
        await cleanup_asset(request.app.state.db, song, "cover_path")
    await audit(request.app.state.db, actor, "song.artwork_updated", song_id)
    return {"message": "Artwork updated"}


@router.get("/import/preview")
async def import_preview(request: Request, actor=Depends(admin_user)):
    return await preview(request.app.state.db)


@router.post("/import", status_code=202)
async def start_import(request: Request, actor=Depends(admin_user)):
    # One durable lock document prevents parallel imports across API processes.
    from pymongo import ReturnDocument

    db = request.app.state.db
    lock = await db.locks.find_one_and_update(
        {"_id": "folder-import", "expires_at": {"$lt": now()}},
        {"$set": {"expires_at": now() + timedelta(hours=1)}},
        return_document=ReturnDocument.AFTER,
    )
    if not lock:
        try:
            await db.locks.insert_one(
                {"_id": "folder-import", "expires_at": now() + timedelta(hours=1)}
            )
        except DuplicateKeyError as exc:
            raise HTTPException(409, "A folder import is already running") from exc
    job = await new_job(db, actor)

    async def process():
        try:
            await import_folder(db, actor, job["_id"])
        finally:
            await db.locks.update_one({"_id": "folder-import"}, {"$set": {"expires_at": now()}})

    task = asyncio.create_task(process())
    request.app.state.tasks.add(task)
    task.add_done_callback(request.app.state.tasks.discard)
    return public(job)


@router.get("/import/jobs")
async def import_jobs(request: Request, actor=Depends(admin_user)):
    return [
        public(j)
        for j in await request.app.state.db.upload_jobs.find({})
        .sort("created_at", -1)
        .limit(20)
        .to_list(20)
    ]


@router.post("/labels", status_code=201)
async def add_label(data: LabelInput, request: Request, actor=Depends(admin_user)):
    label = {
        "_id": uid(),
        "name": data.name.strip(),
        "kind": data.kind,
        "normalized": data.name.strip().casefold(),
        "created_at": now(),
    }
    try:
        await request.app.state.db.labels.insert_one(label)
    except DuplicateKeyError as exc:
        raise HTTPException(409, "This label already exists") from exc
    await audit(request.app.state.db, actor, "label.created", label["_id"], data.name)
    return public(label)


@router.patch("/labels/{label_id}")
async def edit_label(label_id: str, data: LabelInput, request: Request, actor=Depends(admin_user)):
    label = await request.app.state.db.labels.find_one({"_id": label_id, "kind": data.kind})
    if not label:
        raise HTTPException(404, "Label not found; label types cannot be changed")
    try:
        await request.app.state.db.labels.update_one(
            {"_id": label_id},
            {"$set": {"name": data.name.strip(), "normalized": data.name.strip().casefold()}},
        )
    except DuplicateKeyError as exc:
        raise HTTPException(409, "This label already exists") from exc
    await audit(request.app.state.db, actor, "label.updated", label_id, data.name)
    return {"message": "Label updated"}


@router.delete("/labels/{label_id}", status_code=204)
async def delete_label(label_id: str, request: Request, actor=Depends(admin_user)):
    db = request.app.state.db
    label = await db.labels.find_one({"_id": label_id})
    if not label:
        raise HTTPException(404, "Label not found")
    field = {"mood": "mood_ids", "genre": "genre_ids", "language": "language_id"}[label["kind"]]
    if await db.songs.count_documents({field: label_id}) or await db.playlists.count_documents(
        {f"{label['kind']}_id": label_id}
    ):
        raise HTTPException(
            409, "This label is in use. Update its songs and smart playlists before removing it"
        )
    await db.labels.delete_one({"_id": label_id})
    await audit(db, actor, "label.deleted", label_id, label["name"])


@router.get("/users")
async def users(request: Request, actor=Depends(admin_user)):
    return [
        safe_user(u)
        for u in await request.app.state.db.users.find({}).sort("created_at", -1).to_list(1000)
    ]


@router.post("/invitations", status_code=201)
async def invite(data: Invite, request: Request, actor=Depends(admin_user)):
    db, email, token = request.app.state.db, data.email.lower(), secrets.token_urlsafe(32)
    if await db.users.find_one({"email": email}):
        raise HTTPException(409, "This email already has an account")
    record = {
        "_id": uid(),
        "email": email,
        "token_hash": digest(token),
        "used": False,
        "created_at": now(),
        "expires_at": now() + timedelta(days=3),
        "created_by": actor["_id"],
    }
    await db.invitations.insert_one(record)
    await audit(db, actor, "user.invited", record["_id"], email)
    return {
        "id": record["_id"],
        "url": f"{settings.frontend_url}/register?invite={token}",
        "expires_at": record["expires_at"],
    }


@router.get("/invitations")
async def invitations(request: Request, actor=Depends(admin_user)):
    return [
        public(i)
        for i in await request.app.state.db.invitations.find({}, {"token_hash": 0})
        .sort("created_at", -1)
        .limit(100)
        .to_list(100)
    ]


@router.delete("/invitations/{invite_id}", status_code=204)
async def revoke_invite(invite_id: str, request: Request, actor=Depends(admin_user)):
    await request.app.state.db.invitations.delete_one({"_id": invite_id})
    await audit(request.app.state.db, actor, "invitation.revoked", invite_id)


async def managed_user(db, user_id, actor):
    target = await db.users.find_one({"_id": user_id})
    if not target:
        raise HTTPException(404, "User not found")
    if target["role"] == "owner" or actor["_id"] == user_id:
        raise HTTPException(403, "The owner and your own account cannot be managed here")
    if target["role"] == "admin" and actor["role"] != "owner":
        raise HTTPException(403, "Only the owner can manage administrators")
    return target


@router.patch("/users/{user_id}")
async def update_user(user_id: str, data: UserUpdate, request: Request, actor=Depends(admin_user)):
    db = request.app.state.db
    await managed_user(db, user_id, actor)
    if data.role and actor["role"] != "owner":
        raise HTTPException(403, "Only the owner can change roles")
    values = data.model_dump(exclude_none=True)
    await db.users.update_one({"_id": user_id}, {"$set": values})
    if "active" in values or "role" in values:
        await db.sessions.delete_many({"user_id": user_id})
    await audit(db, actor, "user.updated", user_id)
    return safe_user(await db.users.find_one({"_id": user_id}))


@router.delete("/users/{user_id}", status_code=204)
async def delete_user(user_id: str, request: Request, actor=Depends(admin_user)):
    db = request.app.state.db
    target = await managed_user(db, user_id, actor)
    await db.sessions.delete_many({"user_id": user_id})
    for collection in (db.favorites, db.history, db.playlists, db.preferences):
        await collection.delete_many({"user_id": user_id})
    await db.reset_tokens.delete_many({"user_id": user_id})
    await db.users.delete_one({"_id": user_id})
    await db.invitations.delete_many({"email": target["email"]})
    await audit(db, actor, "user.deleted", user_id, target["email"])


@router.post("/users/{user_id}/revoke-sessions")
async def revoke_sessions(user_id: str, request: Request, actor=Depends(admin_user)):
    await managed_user(request.app.state.db, user_id, actor)
    await request.app.state.db.sessions.delete_many({"user_id": user_id})
    await audit(request.app.state.db, actor, "user.sessions_revoked", user_id)
    return {"message": "Sessions revoked"}


@router.post("/users/{user_id}/recovery")
async def recovery(user_id: str, request: Request, actor=Depends(admin_user)):
    target = await managed_user(request.app.state.db, user_id, actor)
    await limit(request, "recovery-create", user_id, 5)
    token = await create_recovery_token(request.app.state.db, user_id)
    await audit(request.app.state.db, actor, "user.recovery_created", user_id, target["email"])
    return {"url": f"{settings.frontend_url}/reset-password?token={token}"}


@router.get("/activity")
async def activity(request: Request, actor=Depends(admin_user)):
    return [
        public(event)
        for event in await request.app.state.db.audit.find({})
        .sort("created_at", -1)
        .limit(100)
        .to_list(100)
    ]


@router.get("/metadata-groups")
async def metadata_groups(request: Request, kind: str = "artist", actor=Depends(admin_user)):
    if kind not in ("artist", "album"):
        raise HTTPException(400, "Choose artist or album")
    cursor = await request.app.state.db.songs.aggregate(
        [
            {
                "$group": {
                    "_id": f"${kind}",
                    "count": {"$sum": 1},
                    "published": {"$sum": {"$cond": [{"$eq": ["$status", "published"]}, 1, 0]}},
                }
            },
            {"$sort": {"_id": 1}},
            {"$limit": 10000},
        ]
    )
    return [
        {"name": group["_id"], "count": group["count"], "published": group["published"]}
        for group in await cursor.to_list(10000)
    ]


@router.patch("/metadata-groups")
async def update_metadata_group(data: MetadataGroup, request: Request, actor=Depends(admin_user)):
    db = request.app.state.db
    if (
        data.new_name != data.name
        and not data.merge
        and await db.songs.find_one({data.kind: data.new_name})
    ):
        raise HTTPException(409, "That name already exists. Select merge to combine these groups")
    result = await db.songs.update_many(
        {data.kind: data.name}, {"$set": {data.kind: data.new_name, "updated_at": now()}}
    )
    if not result.matched_count:
        raise HTTPException(404, "This group is no longer available")
    await audit(
        db,
        actor,
        f"{data.kind}.renamed",
        data.name,
        f"{data.new_name}; {result.matched_count} songs",
    )
    return {"updated": result.matched_count}
