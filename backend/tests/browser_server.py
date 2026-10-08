"""Disposable database and private media for full-stack browser tests."""

import asyncio
import json
import tempfile
from contextlib import asynccontextmanager
from pathlib import Path

import uvicorn

from app.config import ROOT, settings
from app.database import connect, now, uid
from app.imports import import_folder, new_job, seed_labels
from app.security import passwords

settings.database_name = "my_music_vault_browser_test_" + uid()
settings.allowed_origins.append("http://127.0.0.1:5175")
settings.frontend_url = "http://127.0.0.1:5175"
test_directory = tempfile.TemporaryDirectory(prefix="vault-browser-")
settings.storage_dir = Path(test_directory.name) / "storage"
settings.storage_dir.mkdir()
settings.source_dir = Path(test_directory.name) / "Songs_data"
settings.source_dir.mkdir()


async def seed():
    client, db = await connect()
    try:
        await seed_labels(db)
        for user_id, role in (("owner", "owner"), ("listener", "user")):
            await db.users.insert_one(
                {
                    "_id": user_id,
                    "name": "QA " + user_id.title(),
                    "email": user_id + "@example.com",
                    "role": role,
                    "active": True,
                    "password_hash": passwords.hash("Browser test password"),
                    "created_at": now(),
                }
            )
        for folder, audio in (
            ("Love Songs", "golden.wav"),
            ("Sad_breckup songs", "tides.wav"),
            ("Silent songs", "blue.wav"),
        ):
            target = settings.source_dir / folder
            target.mkdir()
            (target / audio).write_bytes(
                (ROOT.parent / "frontend" / "public" / "audio" / audio).read_bytes()
            )
        actor = {"_id": "owner", "name": "QA Owner"}
        job = await new_job(db, actor)
        await import_folder(db, actor, job["_id"])
        songs = await db.songs.find({}).sort("filename", 1).to_list(3)
        for song, title in zip(songs, ("Quiet Water", "Golden Light", "Evening Letter")):
            await db.songs.update_one(
                {"_id": song["_id"]},
                {
                    "$set": {
                        "title": title,
                        "artist": "Vault Sessions",
                        "album": title,
                        "metadata_review": False,
                    }
                },
            )
        output = ROOT.parent / "frontend" / "output"
        output.mkdir(exist_ok=True)
        (output / "browser-runtime.json").write_text(
            json.dumps({"database": settings.database_name, "source": str(settings.source_dir)}),
            encoding="utf-8",
        )
    finally:
        await client.close()


if __name__ == "__main__":
    asyncio.run(seed())
    from app.main import create_app, lifespan

    app = create_app()

    @asynccontextmanager
    async def test_lifespan(application):
        try:
            async with lifespan(application):
                yield
        finally:
            client, _ = await connect()
            assert settings.database_name.startswith("my_music_vault_browser_test_")
            await client.drop_database(settings.database_name)
            await client.close()

    app.router.lifespan_context = test_lifespan
    uvicorn.run(app, host="127.0.0.1", port=8001, log_level="warning")
    test_directory.cleanup()
