from datetime import datetime, timezone
from uuid import uuid4

import certifi
from pymongo import ASCENDING, AsyncMongoClient

from .config import settings


def now():
    return datetime.now(timezone.utc)


def uid():
    return uuid4().hex


def public(document):
    if not document:
        return None
    return {"id": document["_id"], **{k: v for k, v in document.items() if k != "_id"}}


async def connect():
    atlas = settings.mongodb_url.startswith("mongodb+srv://")
    client = AsyncMongoClient(
        settings.mongodb_url,
        serverSelectionTimeoutMS=15000 if atlas else 5000,
        tz_aware=True,
        **({"tlsCAFile": certifi.where()} if atlas else {}),
    )
    await client.admin.command("ping")
    db = client[settings.database_name]
    await db.users.create_index("email", unique=True)
    await db.users.create_index("role", unique=True, partialFilterExpression={"role": "owner"})
    await db.sessions.create_index("expires_at", expireAfterSeconds=0)
    await db.sessions.create_index("refresh_hash", unique=True)
    await db.sessions.create_index("user_id")
    await db.invitations.create_index("token_hash", unique=True)
    await db.invitations.create_index("expires_at", expireAfterSeconds=0)
    await db.reset_tokens.create_index("token_hash", unique=True)
    await db.reset_tokens.create_index("expires_at", expireAfterSeconds=0)
    await db.songs.create_index("sha256", unique=True)
    await db.songs.create_index([("status", ASCENDING), ("created_at", ASCENDING)])
    await db.songs.create_index("mood_ids")
    await db.labels.create_index([("kind", ASCENDING), ("normalized", ASCENDING)], unique=True)
    await db.favorites.create_index([("user_id", ASCENDING), ("song_id", ASCENDING)], unique=True)
    await db.playlists.create_index("user_id")
    await db.history.create_index([("user_id", ASCENDING), ("updated_at", ASCENDING)])
    await db.history.create_index([("user_id", ASCENDING), ("song_id", ASCENDING)], unique=True)
    await db.audit.create_index("created_at")
    await db.rate_limits.create_index("expires_at", expireAfterSeconds=0)
    return client, db


async def audit(db, actor, action, target, detail=""):
    await db.audit.insert_one(
        {
            "_id": uid(),
            "actor_id": actor["_id"],
            "actor_name": actor["name"],
            "action": action,
            "target": target,
            "detail": detail,
            "created_at": now(),
        }
    )
