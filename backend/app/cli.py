"""Explicit owner provisioning and local import commands; no default credentials."""

import argparse
import asyncio
import getpass

from fastapi import HTTPException
from pydantic import EmailStr, TypeAdapter
from pymongo.errors import DuplicateKeyError, PyMongoError
from starlette.concurrency import run_in_threadpool

from .config import settings
from .database import audit, connect, now, uid
from .imports import import_folder, new_job, seed_labels
from .security import create_recovery_token, passwords
from .storage import StorageError, check_storage, cleanup_pending, migrate_local_song


async def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument(
        "command",
        choices=[
            "setup-owner",
            "import-songs",
            "owner-recovery",
            "check-services",
            "migrate-storage",
            "cleanup-storage",
        ],
    )
    args = parser.parse_args()
    client, db = await connect()
    try:
        await seed_labels(db)
        if args.command == "check-services":
            print(
                "MongoDB Atlas: connected"
                if settings.mongodb_url.startswith("mongodb+srv://")
                else "MongoDB: connected"
            )
            print("Storage: " + await run_in_threadpool(check_storage))
            print(f"Catalog: {await db.songs.count_documents({})} songs")
        elif args.command == "cleanup-storage":
            remaining = await cleanup_pending(db)
            print(f"Pending old artwork cleanup: {remaining}")
            if remaining:
                raise SystemExit(1)
        elif args.command == "migrate-storage":
            if settings.storage_backend != "b2":
                raise SystemExit("Set STORAGE_BACKEND=b2 and configure B2 credentials first.")
            await run_in_threadpool(check_storage)
            migrated, failed = 0, 0
            async for song in db.songs.find({"storage_backend": {"$in": [None, "local"]}}):
                try:
                    assets = await run_in_threadpool(migrate_local_song, song)
                    await db.songs.update_one(
                        {"_id": song["_id"]}, {"$set": {**assets, "updated_at": now()}}
                    )
                    migrated += 1
                except (StorageError, ValueError, HTTPException, OSError) as exc:
                    failed += 1
                    print(f"Could not migrate {song['title']}: {getattr(exc, 'detail', str(exc))}")
            await audit(
                db,
                {"_id": "local-setup", "name": "Local setup"},
                "storage.migrated",
                "catalog",
                f"{migrated} migrated; {failed} failed",
            )
            print(
                f"migrated: {migrated}; failed: {failed}. Local originals and copies are preserved."
            )
            if failed:
                raise SystemExit(1)
        elif args.command == "setup-owner":
            if await db.users.find_one({"role": "owner"}):
                raise SystemExit("An owner already exists. Use owner-recovery if needed.")
            name = input("Your display name: ").strip()
            email = str(
                TypeAdapter(EmailStr).validate_python(input("Your email: ").strip())
            ).lower()
            password = getpass.getpass("Choose a password (10+ characters): ")
            if not 2 <= len(name) <= 80 or not 10 <= len(password) <= 128:
                raise SystemExit(
                    "Use a name with 2-80 characters and a password with 10-128 characters."
                )
            if password != getpass.getpass("Confirm password: "):
                raise SystemExit("Passwords do not match.")
            try:
                await db.users.insert_one(
                    {
                        "_id": uid(),
                        "name": name,
                        "email": email,
                        "password_hash": passwords.hash(password),
                        "role": "owner",
                        "active": True,
                        "created_at": now(),
                    }
                )
            except DuplicateKeyError:
                raise SystemExit("An owner or an account with that email already exists.")
            print(f"Owner created. Sign in at {settings.frontend_url}/login")
        elif args.command == "import-songs":
            actor = {"_id": "local-setup", "name": "Local setup"}
            job = await new_job(db, actor)
            await import_folder(db, actor, job["_id"])
            finished = await db.upload_jobs.find_one({"_id": job["_id"]})
            for status in ("imported", "migrated", "skipped", "failed"):
                print(f"{status}: {sum(r['status'] == status for r in finished['results'])}")
            for result in finished["results"]:
                if result["status"] == "failed":
                    print(f"{result['source']}: {result['message']}")
            if finished["status"] != "complete" or any(
                row["status"] == "failed" for row in finished["results"]
            ):
                raise SystemExit(
                    finished.get("message") or "Some files failed. Correct the problem and retry."
                )
        else:
            owner = await db.users.find_one({"role": "owner"})
            if not owner:
                raise SystemExit("Create the owner first with setup-owner.")
            token = await create_recovery_token(db, owner["_id"])
            print(
                f"Private recovery link (expires in 1 hour): {settings.frontend_url}/reset-password?token={token}"
            )
    finally:
        await client.close()


if __name__ == "__main__":
    try:
        asyncio.run(main())
    except PyMongoError:
        raise SystemExit(
            "MongoDB connection failed. Check MONGODB_URL, the Atlas database user and IP access list."
        )
    except StorageError as exc:
        raise SystemExit(str(exc))
