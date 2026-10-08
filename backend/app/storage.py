"""Private local/B2 assets. Keys and credentials never become public catalog URLs."""

import hashlib
import logging
import re
import tempfile
from pathlib import Path, PurePosixPath

import boto3
from botocore.config import Config
from botocore.exceptions import BotoCoreError, ClientError
from fastapi import HTTPException
from fastapi.responses import FileResponse, Response, StreamingResponse
from starlette.concurrency import run_in_threadpool

from .config import settings
from .database import now

log = logging.getLogger(__name__)


class StorageError(Exception):
    pass


def folder_name(value):
    value = value.strip().replace("\\", "/")
    if not value:
        return "Uploads"
    if value.startswith("/") or any(part in ("", ".", "..") for part in value.split("/")):
        raise ValueError("Storage folder must be relative, for example Love Songs or Rap")
    if len(value) > 240 or re.search(r"[\x00-\x1f\x7f:]", value):
        raise ValueError("Use a storage folder without control characters or drive letters")
    return value


def source_folder(song):
    if song.get("storage_folder"):
        return folder_name(song["storage_folder"])
    parent = PurePosixPath(song.get("source", "").replace("\\", "/")).parent.as_posix()
    return folder_name(parent) if parent != "." else "Uploads"


def b2_client():
    try:
        settings.validate_b2()
    except ValueError as exc:
        raise StorageError(str(exc)) from exc
    return boto3.client(
        "s3",
        endpoint_url=settings.b2_endpoint_url.rstrip("/"),
        region_name=settings.b2_region,
        aws_access_key_id=settings.b2_key_id,
        aws_secret_access_key=settings.b2_application_key,
        config=Config(
            signature_version="s3v4",
            s3={"addressing_style": "path"},
            connect_timeout=5,
            read_timeout=30,
            retries={"max_attempts": 2, "mode": "standard"},
            request_checksum_calculation="when_required",
            response_checksum_validation="when_required",
        ),
    )


def remote_error(operation, exc):
    log.warning("B2 %s failed: %s", operation, type(exc).__name__)
    return StorageError(
        f"B2 {operation} failed. Check the bucket, region and application-key permissions, then retry"
    )


def validate_key(key):
    # References are internal database fields, never user-supplied media paths.
    if (
        not key
        or len(key.encode("utf-8")) > 1024
        or key.startswith("/")
        or "\\" in key
        or any(part in ("", ".", "..") for part in key.split("/"))
        or re.search(r"[\x00-\x1f\x7f]", key)
    ):
        raise StorageError("This media reference is invalid")
    return key


def object_key(folder, kind, filename):
    filename = re.sub(r"[\x00-\x1f\x7f/\\]", "_", filename)
    # Leave headroom under B2's 1,024-byte object-name limit, including unicode filenames.
    while len(filename.encode("utf-8")) > 400:
        stem, suffix = Path(filename).stem, Path(filename).suffix
        filename = stem[:-1] + suffix
    return validate_key(f"{settings.b2_prefix}/{folder_name(folder)}/{kind}/{filename}")


def put_asset(path, key, mime, digest):
    """Reuse an identical object, preserving its exact version instead of billing a duplicate."""
    client = b2_client()
    try:
        try:
            existing = client.head_object(Bucket=settings.b2_bucket_name, Key=key)
        except ClientError as exc:
            if exc.response.get("ResponseMetadata", {}).get("HTTPStatusCode") != 404:
                raise
        else:
            if (
                existing.get("Metadata", {}).get("sha256") != digest
                or existing["ContentLength"] != path.stat().st_size
            ):
                raise StorageError(
                    "A different B2 object already uses this key; it was not overwritten"
                )
            if not existing.get("VersionId"):
                raise StorageError("B2 did not return an object version; check the S3 endpoint")
            return existing["VersionId"]
        with path.open("rb") as body:
            result = client.put_object(
                Bucket=settings.b2_bucket_name,
                Key=key,
                Body=body,
                ContentLength=path.stat().st_size,
                ContentType=mime,
                CacheControl="private, no-store",
                Metadata={"sha256": digest},
            )
        if not result.get("VersionId"):
            raise StorageError(
                "B2 uploaded an object but did not return its version; retry the import"
            )
        return result["VersionId"]
    except (BotoCoreError, ClientError) as exc:
        raise remote_error("upload", exc) from exc
    finally:
        client.close()


def upload_audio(path, metadata, folder):
    name = Path(metadata.get("filename") or path.name).name
    key = object_key(folder, "audio", f"{metadata['sha256']}-{name}")
    version = put_asset(path, key, metadata["mime_type"], metadata["sha256"])
    return {"audio_path": key, "audio_version_id": version}


def upload_cover(path, song):
    digest = hashlib.sha256(path.read_bytes()).hexdigest()
    key = object_key(source_folder(song), "artwork", f"{song['sha256']}-{digest}.webp")
    version = put_asset(path, key, "image/webp", digest)
    return {"cover_path": key, "cover_version_id": version}


def cloud_params(song, field):
    key = validate_key(song[field])
    version = song.get(field.replace("_path", "_version_id"))
    if not version:
        raise StorageError("This B2 media reference has no object version")
    return {
        "Bucket": song.get("storage_bucket") or settings.b2_bucket_name,
        "Key": key,
        "VersionId": version,
    }


def byte_range(value, size):
    match = re.fullmatch(r"bytes=(\d*)-(\d*)", value)
    if (
        not match
        or not any(match.groups())
        or size <= 0
        or any(len(v) > 20 for v in match.groups())
    ):
        raise HTTPException(
            416, "Choose one valid byte range", headers={"Content-Range": f"bytes */{size}"}
        )
    first, last = match.groups()
    if not first:
        count = int(last)
        start, end = max(0, size - count), size - 1
    else:
        start, end = int(first), min(int(last) if last else size - 1, size - 1)
    if start > end or start >= size:
        raise HTTPException(
            416, "This byte range is unavailable", headers={"Content-Range": f"bytes */{size}"}
        )
    return start, end


class Download:
    def __init__(self, body, client):
        self.body, self.client, self.closed = body, client, False

    def __iter__(self):
        return self

    def __next__(self):
        if self.closed:
            raise StopIteration
        chunk = self.body.read(64 * 1024)
        if not chunk:
            self.close()
            raise StopIteration
        return chunk

    def close(self):
        if not self.closed:
            self.closed = True
            self.body.close()
            self.client.close()


class PrivateStreamingResponse(StreamingResponse):
    def __init__(self, download, **kwargs):
        super().__init__(download, **kwargs)
        self.download = download

    async def __call__(self, scope, receive, send):
        try:
            await super().__call__(scope, receive, send)
        finally:
            # Also releases B2 sockets if a browser stops playback or disconnects.
            self.download.close()


def prepare_download(song, field, method, range_header, if_range):
    client = b2_client()
    body = None
    try:
        params = cloud_params(song, field)
        head = client.head_object(**params)
        size = head["ContentLength"]
        modified = head.get("LastModified")
        etag = head.get("ETag", "")
        modified_header = modified.strftime("%a, %d %b %Y %H:%M:%S GMT") if modified else ""
        if if_range and if_range not in (etag, modified_header):
            range_header = None
        headers = {
            "Cache-Control": "private, no-store",
            "X-Content-Type-Options": "nosniff",
            "Accept-Ranges": "bytes",
            "Content-Length": str(size),
        }
        if etag:
            headers["ETag"] = etag
        if modified_header:
            headers["Last-Modified"] = modified_header
        status = 200
        if range_header:
            start, end = byte_range(range_header, size)
            params["Range"] = f"bytes={start}-{end}"
            headers["Content-Range"] = f"bytes {start}-{end}/{size}"
            headers["Content-Length"] = str(end - start + 1)
            status = 206
        if method == "HEAD":
            client.close()
            return None, headers, status
        result = client.get_object(**params)
        body = result["Body"]
        if result["ContentLength"] != int(headers["Content-Length"]):
            body.close()
            raise StorageError("B2 returned an unexpected media length")

        return Download(body, client), headers, status
    except ClientError as exc:
        client.close()
        if exc.response.get("ResponseMetadata", {}).get("HTTPStatusCode") == 404:
            raise HTTPException(404, "This media file is unavailable") from exc
        raise remote_error("download", exc) from exc
    except BotoCoreError as exc:
        client.close()
        raise remote_error("download", exc) from exc
    except Exception:
        if body:
            body.close()
        client.close()
        raise


async def media_response(song, field, request, mime):
    if song.get("storage_backend", "local") == "local":
        from .media import managed_path

        return FileResponse(
            managed_path(song[field]),
            media_type=mime,
            headers={"Cache-Control": "private, no-store"},
            content_disposition_type="inline",
        )
    chunks, headers, status = await run_in_threadpool(
        prepare_download,
        song,
        field,
        request.method,
        request.headers.get("range"),
        request.headers.get("if-range"),
    )
    if chunks is None:
        return Response(headers=headers, status_code=status, media_type=mime)
    return PrivateStreamingResponse(chunks, headers=headers, status_code=status, media_type=mime)


def remove_asset(song, field):
    if not song.get(field):
        return
    if song.get("storage_backend", "local") == "local":
        from .media import managed_path

        try:
            managed_path(song[field]).unlink()
        except HTTPException as exc:
            if exc.status_code != 404:
                raise
        return
    client = b2_client()
    try:
        # B2 is versioned: deleting only the key would hide the file and keep billed bytes.
        client.delete_object(**cloud_params(song, field))
    except (BotoCoreError, ClientError) as exc:
        raise remote_error("deletion", exc) from exc
    finally:
        client.close()


def check_storage():
    if settings.storage_backend == "local":
        return "local private files"
    client = b2_client()
    try:
        client.head_bucket(Bucket=settings.b2_bucket_name)
        acl = client.get_bucket_acl(Bucket=settings.b2_bucket_name)
        if any(
            grant.get("Grantee", {}).get("URI", "").endswith(("AllUsers", "AuthenticatedUsers"))
            for grant in acl.get("Grants", [])
        ):
            raise StorageError("Make this B2 bucket private before storing vault music")
        return "Backblaze B2 (private bucket)"
    except (BotoCoreError, ClientError) as exc:
        raise remote_error("connection check", exc) from exc
    finally:
        client.close()


def migrate_local_song(song):
    if settings.storage_backend != "b2" or song.get("storage_backend", "local") != "local":
        return None
    from .media import file_hash, managed_path, store_source

    audio = managed_path(song["audio_path"])
    if file_hash(audio) != song["sha256"]:
        raise StorageError("The local audio changed. Restore its original file before migrating")
    raw = managed_path(song["cover_path"]).read_bytes() if song.get("cover_path") else None
    return store_source(audio, song, source_folder(song), raw)


def save_cover(raw, song):
    from .media import image_bytes

    with tempfile.TemporaryDirectory(prefix="vault-cover-", dir=settings.storage_dir) as directory:
        path = Path(directory) / "cover.webp"
        image_bytes(raw, path)
        if song.get("storage_backend", "local") == "b2":
            # The asset belongs to the song's original bucket, including after config changes.
            if song.get("storage_bucket") != settings.b2_bucket_name:
                raise StorageError("Configure this song's B2 bucket before replacing its artwork")
            return upload_cover(path, song)
        digest = hashlib.sha256(path.read_bytes()).hexdigest()
        relative = f"covers/{song['sha256']}-{digest}.webp"
        destination = settings.storage_dir / relative
        destination.parent.mkdir(parents=True, exist_ok=True)
        destination.write_bytes(path.read_bytes())
        return {"cover_path": relative}


async def cleanup_asset(db, song, field):
    if not song.get(field):
        return
    query = {field: song[field]}
    version_field = field.replace("_path", "_version_id")
    if song.get("storage_backend", "local") == "b2":
        query.update(
            {
                "storage_backend": "b2",
                "storage_bucket": song.get("storage_bucket"),
                version_field: song.get(version_field),
            }
        )
    else:
        query["storage_backend"] = {"$in": ["local", None]}
    identity = hashlib.sha256(repr(sorted(query.items())).encode()).hexdigest()
    if await db.songs.find_one(query, {"_id": 1}):
        await db.asset_cleanup.delete_one({"_id": identity})
        return
    try:
        await run_in_threadpool(remove_asset, song, field)
        await db.asset_cleanup.delete_one({"_id": identity})
    except (StorageError, OSError):
        await db.asset_cleanup.update_one(
            {"_id": identity},
            {
                "$set": {
                    "asset": {
                        key: song.get(key, "local") if key == "storage_backend" else song.get(key)
                        for key in ("storage_backend", "storage_bucket", field, version_field)
                    },
                    "field": field,
                    "updated_at": now(),
                }
            },
            upsert=True,
        )
        log.warning("Old artwork cleanup queued for retry")


async def cleanup_pending(db):
    async for job in db.asset_cleanup.find({}):
        await cleanup_asset(db, job["asset"], job["field"])
    return await db.asset_cleanup.count_documents({})
