import io
import math
import struct
import wave
from uuid import uuid4

import pytest
from fastapi.testclient import TestClient
from pymongo import MongoClient

from app.config import settings
from app.database import now
from app.main import create_app
from app.security import passwords


def wav_bytes(frequency=220):
    stream = io.BytesIO()
    with wave.open(stream, "wb") as recording:
        recording.setnchannels(1)
        recording.setsampwidth(2)
        recording.setframerate(8000)
        recording.writeframes(
            b"".join(
                struct.pack("<h", int(3000 * math.sin(i * frequency * 2 * math.pi / 8000)))
                for i in range(16000)
            )
        )
    return stream.getvalue()


@pytest.fixture
def vault(tmp_path):
    original = (settings.database_name, settings.source_dir, settings.storage_dir)
    database_name = "my_music_vault_test_" + uuid4().hex
    settings.database_name = database_name
    settings.source_dir = tmp_path / "sources"
    settings.storage_dir = tmp_path / "storage"
    settings.source_dir.mkdir()
    settings.storage_dir.mkdir()
    mongo = MongoClient(settings.mongodb_url, tz_aware=True)
    db = mongo[database_name]
    with TestClient(create_app(), headers={"Origin": settings.frontend_url}) as client:
        for user_id, role in (
            ("owner", "owner"),
            ("listener", "user"),
            ("friend", "user"),
            ("admin", "admin"),
        ):
            db.users.insert_one(
                {
                    "_id": user_id,
                    "name": user_id.title(),
                    "email": user_id + "@example.com",
                    "role": role,
                    "active": True,
                    "created_at": now(),
                    "password_hash": passwords.hash("Test password 123"),
                }
            )
        yield client, db
    assert database_name.startswith("my_music_vault_test_")
    mongo.drop_database(database_name)
    mongo.close()
    settings.database_name, settings.source_dir, settings.storage_dir = original


def sign_in(client, role="owner"):
    result = client.post(
        "/api/v1/auth/login", json={"email": role + "@example.com", "password": "Test password 123"}
    )
    assert result.status_code == 200, result.text
    client.headers["Authorization"] = "Bearer " + result.json()["access_token"]
    return result.json()


def upload(client, **values):
    import json

    metadata = {
        "title": "A real test recording",
        "artist": "Test artist",
        "album": "Test album",
        **values,
    }
    result = client.post(
        "/api/v1/admin/songs/upload",
        data={"metadata": json.dumps(metadata)},
        files={"audio": ("test.wav", wav_bytes(), "audio/wav")},
    )
    assert result.status_code == 201, result.text
    return result.json()
