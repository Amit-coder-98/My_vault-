import asyncio
import logging

from fastapi import HTTPException
from pymongo.errors import DuplicateKeyError
from starlette.concurrency import run_in_threadpool

from .config import settings
from .database import audit, now, uid
from .media import SUPPORTED, inspect, store_source
from .storage import check_storage, migrate_local_song

log = logging.getLogger(__name__)
INITIAL_LABELS = {
    "mood": ["Love", "Sad", "Breakup", "Silent", "Calm", "Focus", "Party"],
    "genre": ["Pop", "Rap", "Classical", "DJ Mix"],
    "language": ["Hindi", "Punjabi", "English", "Instrumental", "Unknown"],
}


async def seed_labels(db):
    for kind, names in INITIAL_LABELS.items():
        for name in names:
            await db.labels.update_one(
                {"kind": kind, "normalized": name.casefold()},
                {"$setOnInsert": {"_id": uid(), "name": name, "created_at": now()}},
                upsert=True,
            )


def source_files():
    root = settings.source_dir
    if not root.is_dir():
        raise HTTPException(400, "The configured music source folder is unavailable")
    result = []
    for path in sorted(root.rglob("*")):
        if not path.is_file() or path.suffix.lower() not in SUPPORTED:
            continue
        resolved = path.resolve()
        if not resolved.is_relative_to(root):
            continue
        result.append(resolved)
    return result


async def folder_moods(db, folder):
    text = folder.casefold()
    names = (
        ["Love"]
        if "love" in text
        else ["Sad", "Breakup"]
        if "sad" in text or "break" in text or "breck" in text
        else ["Silent"]
        if "silent" in text
        else []
    )
    if not names and folder:
        names = [folder[:60]]
    ids = []
    for name in names:
        try:
            await db.labels.update_one(
                {"kind": "mood", "normalized": name.casefold()},
                {"$setOnInsert": {"_id": uid(), "name": name, "created_at": now()}},
                upsert=True,
            )
        except DuplicateKeyError:
            pass
        label = await db.labels.find_one({"kind": "mood", "normalized": name.casefold()})
        ids.append(label["_id"])
    return ids


async def preview(db):
    result = []
    for path in await run_in_threadpool(source_files):
        relative = path.relative_to(settings.source_dir)
        try:
            metadata = await run_in_threadpool(inspect, path)
            duplicate = await db.songs.find_one(
                {"sha256": metadata["sha256"]}, {"_id": 1, "storage_backend": 1}
            )
            result.append(
                {
                    "source": str(relative),
                    "folder": relative.parts[0] if len(relative.parts) > 1 else "",
                    **{k: v for k, v in metadata.items() if k != "sha256"},
                    "duplicate": bool(duplicate),
                    "migration_needed": bool(
                        duplicate
                        and settings.storage_backend == "b2"
                        and duplicate.get("storage_backend", "local") == "local"
                    ),
                    "error": None,
                }
            )
        except Exception as exc:
            result.append(
                {
                    "source": str(relative),
                    "filename": path.name,
                    "error": str(exc)[:200],
                    "duplicate": False,
                }
            )
    return result


async def import_folder(db, actor, job_id):
    await db.upload_jobs.update_one(
        {"_id": job_id}, {"$set": {"status": "processing", "started_at": now()}}
    )
    results = []
    try:
        if settings.storage_backend == "b2":
            await run_in_threadpool(check_storage)
        paths = await run_in_threadpool(source_files)
        await db.upload_jobs.update_one({"_id": job_id}, {"$set": {"total": len(paths)}})
        for path in paths:
            relative = path.relative_to(settings.source_dir)
            try:
                metadata = await run_in_threadpool(inspect, path)
                existing = await db.songs.find_one({"sha256": metadata["sha256"]})
                if existing:
                    migrated = await run_in_threadpool(migrate_local_song, existing)
                    if migrated:
                        await db.songs.update_one(
                            {"_id": existing["_id"]}, {"$set": {**migrated, "updated_at": now()}}
                        )
                    result = {
                        "source": str(relative),
                        "status": "migrated" if migrated else "skipped",
                        "message": "Copied existing song to B2; personal data preserved"
                        if migrated
                        else "Identical audio already exists",
                    }
                else:
                    folder = relative.parent.as_posix() if len(relative.parts) > 1 else "Uploads"
                    assets = await run_in_threadpool(store_source, path, metadata, folder)
                    moods = await folder_moods(
                        db, relative.parts[0] if len(relative.parts) > 1 else ""
                    )
                    record = {
                        "_id": uid(),
                        **metadata,
                        **assets,
                        "mood_ids": moods,
                        "genre_ids": [],
                        "language_id": None,
                        "description": "",
                        "status": "published",
                        "featured": False,
                        "created_at": now(),
                        "updated_at": now(),
                        "source": str(relative),
                    }
                    try:
                        await db.songs.insert_one(record)
                        result = {
                            "source": str(relative),
                            "status": "imported",
                            "song_id": record["_id"],
                            "message": "Review missing metadata"
                            if record["metadata_review"]
                            else "Ready",
                        }
                    except DuplicateKeyError:
                        result = {
                            "source": str(relative),
                            "status": "skipped",
                            "message": "Identical audio already exists",
                        }
            except Exception as exc:
                log.warning("Import failed for %s: %s", relative, type(exc).__name__)
                result = {"source": str(relative), "status": "failed", "message": str(exc)[:200]}
            results.append(result)
            await db.upload_jobs.update_one(
                {"_id": job_id}, {"$set": {"completed": len(results), "results": results}}
            )
        await db.upload_jobs.update_one(
            {"_id": job_id},
            {"$set": {"status": "complete", "finished_at": now(), "results": results}},
        )
        await audit(
            db,
            actor,
            "songs.imported",
            job_id,
            f"{sum(r['status'] == 'imported' for r in results)} imported; {sum(r['status'] == 'migrated' for r in results)} migrated; {sum(r['status'] == 'failed' for r in results)} failed",
        )
    except asyncio.CancelledError:
        await db.upload_jobs.update_one({"_id": job_id}, {"$set": {"status": "interrupted"}})
        raise
    except Exception:
        log.exception("Folder import job failed")
        await db.upload_jobs.update_one(
            {"_id": job_id},
            {
                "$set": {
                    "status": "failed",
                    "message": "Import interrupted. Retry from the import panel",
                }
            },
        )


async def new_job(db, actor):
    job = {
        "_id": uid(),
        "status": "queued",
        "created_at": now(),
        "actor_id": actor["_id"],
        "total": 0,
        "completed": 0,
        "results": [],
    }
    await db.upload_jobs.insert_one(job)
    return job
