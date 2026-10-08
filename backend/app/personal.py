from fastapi import APIRouter, Depends, HTTPException, Request

from .database import now, public, uid
from .schemas import HistoryInput, PlaylistInput, Preferences
from .security import current_user

router = APIRouter(prefix="/api/v1/me", tags=["Your music"])


@router.get("/favorites")
async def favorites(request: Request, user=Depends(current_user)):
    return [
        record["song_id"]
        for record in await request.app.state.db.favorites.find({"user_id": user["_id"]}).to_list(
            10000
        )
    ]


@router.put("/favorites/{song_id}", status_code=204)
async def favorite(song_id: str, request: Request, user=Depends(current_user)):
    db = request.app.state.db
    if not await db.songs.find_one({"_id": song_id, "status": "published"}):
        raise HTTPException(404, "Song is unavailable")
    await db.favorites.update_one(
        {"user_id": user["_id"], "song_id": song_id},
        {"$setOnInsert": {"_id": uid(), "created_at": now()}},
        upsert=True,
    )


@router.delete("/favorites/{song_id}", status_code=204)
async def unfavorite(song_id: str, request: Request, user=Depends(current_user)):
    await request.app.state.db.favorites.delete_one({"user_id": user["_id"], "song_id": song_id})


async def playlist_public(db, playlist):
    result = public(playlist)
    if result.get("smart"):
        query = {"status": "published"}
        for key, field in (
            ("mood_id", "mood_ids"),
            ("genre_id", "genre_ids"),
            ("language_id", "language_id"),
        ):
            if result.get(key):
                query[field] = result[key]
        if result.get("favorites_only"):
            query["_id"] = {
                "$in": [
                    f["song_id"]
                    for f in await db.favorites.find({"user_id": playlist["user_id"]}).to_list(
                        10000
                    )
                ]
            }
        result["track_ids"] = [
            s["_id"]
            for s in await db.songs.find(query, {"_id": 1})
            .sort("title", 1)
            .limit(1000)
            .to_list(1000)
        ]
    return result


@router.get("/playlists")
async def playlists(request: Request, user=Depends(current_user)):
    db = request.app.state.db
    return [
        await playlist_public(db, p)
        for p in await db.playlists.find({"user_id": user["_id"]})
        .sort("created_at", -1)
        .to_list(500)
    ]


async def validate_playlist(db, data):
    ids = list(dict.fromkeys(data.track_ids))
    if await db.songs.count_documents({"_id": {"$in": ids}, "status": "published"}) != len(ids):
        raise HTTPException(400, "Choose songs from the published library")
    for kind in ("mood", "genre", "language"):
        label_id = getattr(data, f"{kind}_id")
        if label_id and not await db.labels.find_one({"_id": label_id, "kind": kind}):
            raise HTTPException(400, f"Choose an existing {kind}")
    return {**data.model_dump(), "track_ids": ids}


@router.post("/playlists", status_code=201)
async def create_playlist(data: PlaylistInput, request: Request, user=Depends(current_user)):
    db = request.app.state.db
    if await db.playlists.count_documents({"user_id": user["_id"]}) >= 500:
        raise HTTPException(400, "The account playlist limit has been reached")
    playlist = {
        "_id": uid(),
        "user_id": user["_id"],
        **await validate_playlist(db, data),
        "created_at": now(),
        "updated_at": now(),
    }
    await db.playlists.insert_one(playlist)
    return await playlist_public(db, playlist)


@router.patch("/playlists/{playlist_id}")
async def update_playlist(
    playlist_id: str, data: PlaylistInput, request: Request, user=Depends(current_user)
):
    db = request.app.state.db
    result = await db.playlists.update_one(
        {"_id": playlist_id, "user_id": user["_id"]},
        {"$set": {**await validate_playlist(db, data), "updated_at": now()}},
    )
    if not result.matched_count:
        raise HTTPException(404, "Playlist not found")
    return await playlist_public(
        db, await db.playlists.find_one({"_id": playlist_id, "user_id": user["_id"]})
    )


@router.delete("/playlists/{playlist_id}", status_code=204)
async def delete_playlist(playlist_id: str, request: Request, user=Depends(current_user)):
    result = await request.app.state.db.playlists.delete_one(
        {"_id": playlist_id, "user_id": user["_id"]}
    )
    if not result.deleted_count:
        raise HTTPException(404, "Playlist not found")


@router.post("/history", status_code=204)
async def record_history(data: HistoryInput, request: Request, user=Depends(current_user)):
    db = request.app.state.db
    song = await db.songs.find_one({"_id": data.song_id, "status": "published"})
    if not song:
        raise HTTPException(404, "Song is unavailable")
    await db.history.update_one(
        {"user_id": user["_id"], "song_id": data.song_id},
        {
            "$set": {"elapsed": min(song["duration"], data.elapsed), "updated_at": now()},
            "$setOnInsert": {"_id": uid()},
        },
        upsert=True,
    )


@router.get("/history")
async def history(request: Request, user=Depends(current_user)):
    return [
        public(h)
        for h in await request.app.state.db.history.find({"user_id": user["_id"]})
        .sort("updated_at", -1)
        .limit(50)
        .to_list(50)
    ]


@router.get("/preferences")
async def preferences(request: Request, user=Depends(current_user)):
    data = await request.app.state.db.preferences.find_one({"user_id": user["_id"]})
    return (
        {"volume": data.get("volume", 0.7), "atmosphere": data.get("atmosphere", False)}
        if data
        else Preferences().model_dump()
    )


@router.put("/preferences")
async def save_preferences(data: Preferences, request: Request, user=Depends(current_user)):
    await request.app.state.db.preferences.update_one(
        {"user_id": user["_id"]}, {"$set": data.model_dump()}, upsert=True
    )
    return data
