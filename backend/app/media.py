import array
import hashlib
import io
import math
import re
import shutil
import subprocess
import tempfile
from pathlib import Path
from uuid import uuid4

from fastapi import HTTPException
from mutagen import File, MutagenError
from PIL import Image, UnidentifiedImageError

from .config import settings

SUPPORTED = {
    ".mp3": "audio/mpeg",
    ".flac": "audio/flac",
    ".m4a": "audio/mp4",
    ".ogg": "audio/ogg",
    ".wav": "audio/wav",
}
Image.MAX_IMAGE_PIXELS = 20_000_000


def managed_path(relative):
    path = (settings.storage_dir / relative).resolve()
    if not path.is_relative_to(settings.storage_dir) or not path.is_file():
        raise HTTPException(404, "This media file is unavailable")
    return path


def file_hash(path):
    digest = hashlib.sha256()
    with path.open("rb") as stream:
        for chunk in iter(lambda: stream.read(1024 * 1024), b""):
            digest.update(chunk)
    return digest.hexdigest()


def clean_title(name):
    title = re.sub(
        r"\s*\((?:official|lyrical|full song|audio|video)[^)]*\)", "", Path(name).stem, flags=re.I
    )
    return re.sub(r"\s+", " ", title).strip()[:200] or "Untitled"


def inspect(path, source_name=None):
    if path.suffix.lower() not in SUPPORTED:
        raise ValueError("Supported formats: MP3, FLAC, M4A, OGG and WAV")
    if path.stat().st_size > settings.max_upload_mb * 1024 * 1024:
        raise ValueError(f"The file exceeds the {settings.max_upload_mb} MB limit")
    try:
        audio = File(path, easy=True)
    except MutagenError as exc:
        raise ValueError("This file is not a readable audio recording") from exc
    if audio is None or not getattr(audio, "info", None):
        raise ValueError("This file is not a readable audio recording")
    duration = float(audio.info.length)
    if not math.isfinite(duration) or not 0 < duration <= 21600:
        raise ValueError("Audio duration must be between 0 and 6 hours")
    detected = set(getattr(audio, "mime", []))
    expected = SUPPORTED[path.suffix.lower()]
    if expected not in detected and not (expected == "audio/wav" and "audio/x-wav" in detected):
        raise ValueError("Audio contents do not match the file format")
    tags = audio.tags or {}

    def tag(key, fallback):
        value = tags.get(key, [fallback])
        return str(value[0]).strip()[:200] or fallback

    date = re.search(r"\d{4}", tag("date", ""))
    return {
        "title": tag("title", clean_title(source_name or path.name)),
        "artist": tag("artist", "Unknown artist"),
        "album": tag("album", "Singles"),
        "year": int(date[0]) if date else 0,
        "duration": round(duration, 3),
        "file_size": path.stat().st_size,
        "mime_type": expected,
        "sha256": file_hash(path),
        "filename": path.name,
        "metadata_review": not bool(tags.get("title") and tags.get("artist")),
    }


def image_bytes(raw, destination):
    try:
        with Image.open(io.BytesIO(raw)) as image:
            if image.format not in {"JPEG", "PNG", "WEBP"}:
                raise ValueError("Choose a valid JPEG, PNG or WebP cover image")
            if image.width * image.height > Image.MAX_IMAGE_PIXELS:
                raise ValueError("Cover images must be smaller than 20 megapixels")
            image.load()
            image = image.convert("RGB")
            image.thumbnail((1000, 1000))
            image.save(destination, "WEBP", quality=85)
    except (UnidentifiedImageError, OSError, Image.DecompressionBombError) as exc:
        raise ValueError("Choose a valid JPEG, PNG or WebP cover image") from exc


def embedded_cover(path, destination):
    audio = File(path)
    tags = getattr(audio, "tags", None)
    raw = None
    if hasattr(audio, "pictures") and audio.pictures:
        raw = audio.pictures[0].data
    elif tags and hasattr(tags, "getall") and tags.getall("APIC"):
        raw = tags.getall("APIC")[0].data
    elif tags and "covr" in tags:
        raw = bytes(tags["covr"][0])
    if raw:
        try:
            image_bytes(raw, destination)
            return True
        except ValueError:
            pass
    return False


def waveform(path):
    # Decode a bounded low-rate mono signal, then aggregate real amplitudes.
    # An unavailable decoder yields a working seek-bar fallback, never fake peaks.
    try:
        result = subprocess.run(
            [
                settings.ffmpeg_path,
                "-v",
                "error",
                "-i",
                str(path),
                "-ac",
                "1",
                "-ar",
                "1000",
                "-f",
                "f32le",
                "pipe:1",
            ],
            capture_output=True,
            timeout=90,
            check=True,
            creationflags=getattr(subprocess, "CREATE_NO_WINDOW", 0),
        )
        samples = array.array("f")
        samples.frombytes(result.stdout)
        if not samples:
            return None
        size = max(1, math.ceil(len(samples) / 240))
        peaks = [
            max(abs(float(v)) for v in samples[i : i + size]) for i in range(0, len(samples), size)
        ]
        maximum = max(peaks) or 1
        return [round(min(1, v / maximum), 4) for v in peaks]
    except (OSError, subprocess.SubprocessError):
        return None


def store_source(path, metadata, folder="Uploads", cover_raw=None):
    from .storage import folder_name, upload_audio, upload_cover

    folder = folder_name(folder)
    if settings.storage_backend == "b2":
        with tempfile.TemporaryDirectory(
            prefix="vault-process-", dir=settings.storage_dir
        ) as directory:
            cover_path = Path(directory) / "cover.webp"
            if cover_raw is not None:
                image_bytes(cover_raw, cover_path)
                has_cover = True
            else:
                has_cover = embedded_cover(path, cover_path)
            peaks = metadata.get("peaks") or waveform(path)
            assets = {
                "storage_backend": "b2",
                "storage_bucket": settings.b2_bucket_name,
                "storage_folder": folder,
                "cover_path": None,
                "cover_version_id": None,
                "peaks": peaks,
                **upload_audio(path, metadata, folder),
            }
            if has_cover:
                assets.update(upload_cover(cover_path, {**metadata, **assets}))
            return assets
    audio_rel = f"audio/{metadata['sha256']}{path.suffix.lower()}"
    audio_path = settings.storage_dir / audio_rel
    audio_path.parent.mkdir(parents=True, exist_ok=True)
    if not audio_path.exists():
        temporary = audio_path.with_suffix(audio_path.suffix + f".{uuid4().hex}.tmp")
        shutil.copyfile(path, temporary)
        temporary.replace(audio_path)
    cover_rel = f"covers/{metadata['sha256']}.webp"
    cover_path = settings.storage_dir / cover_rel
    cover_path.parent.mkdir(parents=True, exist_ok=True)
    if cover_raw is not None:
        image_bytes(cover_raw, cover_path)
        has_cover = True
    else:
        has_cover = embedded_cover(audio_path, cover_path)
    return {
        "storage_backend": "local",
        "storage_folder": folder,
        "audio_path": audio_rel,
        "cover_path": cover_rel if has_cover else None,
        "peaks": waveform(audio_path),
    }
