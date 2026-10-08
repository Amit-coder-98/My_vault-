import hashlib
import re

from fastapi import APIRouter, Depends, HTTPException, Query, Request

from .database import public
from .security import current_user, media_user
from .storage import media_response

router = APIRouter(prefix="/api/v1", tags=["Music library"])


def song_public(song):
    result = public(song)
    for key in (
        "audio_path",
        "cover_path",
        "sha256",
        "storage_backend",
        "storage_bucket",
        "audio_version_id",
        "cover_version_id",
    ):
        result.pop(key, None)
    result["audio_url"] = f"/api/v1/songs/{song['_id']}/audio"
    if song.get("cover_path"):
        revision = hashlib.sha256(
            (song["cover_path"] + str(song.get("cover_version_id", ""))).encode()
        ).hexdigest()[:16]
        result["artwork_url"] = f"/api/v1/songs/{song['_id']}/artwork?v={revision}"
    else:
        result["artwork_url"] = None
    return result


def song_query(q="", mood=None, genre=None, language=None):
    query = {"status": "published"}
    if q:
        query["$or"] = [
            {key: {"$regex": re.escape(q), "$options": "i"}} for key in ("title", "artist", "album")
        ]
    if mood:
        query["mood_ids"] = mood
    if genre:
        query["genre_ids"] = genre
    if language:
        query["language_id"] = language
    return query


@router.get("/songs")
async def songs(
    request: Request,
    q: str = Query(default="", max_length=200),
    mood: str | None = None,
    genre: str | None = None,
    language: str | None = None,
    offset: int = Query(default=0, ge=0),
    limit: int = Query(default=100, ge=1, le=200),
    user=Depends(current_user),
):
    query = song_query(q, mood, genre, language)
    db = request.app.state.db
    items = (
        await db.songs.find(query)
        .sort([("featured", -1), ("created_at", -1), ("_id", 1)])
        .skip(offset)
        .limit(limit)
        .to_list(limit)
    )
    return {
        "items": [song_public(song) for song in items],
        "total": await db.songs.count_documents(query),
    }


@router.get("/labels")
async def labels(request: Request, user=Depends(current_user)):
    items = await request.app.state.db.labels.find({}).sort("name", 1).to_list(1000)
    result = []
    for label in items:
        field = {"mood": "mood_ids", "genre": "genre_ids", "language": "language_id"}[label["kind"]]
        count = await request.app.state.db.songs.count_documents(
            {"status": "published", field: label["_id"]}
        )
        result.append({**public(label), "count": count})
    return result


async def accessible_song(song_id, request, user):
    query = {"_id": song_id}
    if user["role"] == "user":
        query["status"] = "published"
    song = await request.app.state.db.songs.find_one(query)
    if not song:
        raise HTTPException(404, "This song is unavailable")
    return song


@router.api_route("/songs/{song_id}/audio", methods=["GET", "HEAD"])
async def audio(song_id: str, request: Request, user=Depends(media_user)):
    song = await accessible_song(song_id, request, user)
    return await media_response(song, "audio_path", request, song["mime_type"])


@router.get("/songs/{song_id}/artwork")
async def artwork(song_id: str, request: Request, user=Depends(media_user)):
    song = await accessible_song(song_id, request, user)
    if not song.get("cover_path"):
        raise HTTPException(404, "No cover image is available")
    return await media_response(song, "cover_path", request, "image/webp")
