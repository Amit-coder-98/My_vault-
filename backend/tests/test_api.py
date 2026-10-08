import json
from datetime import timedelta

from app.config import settings
from app.database import now
from app.imports import import_folder, new_job
from app.media import inspect
from app.schemas import Register
from app.security import COOKIE, passwords

from .conftest import sign_in, upload, wav_bytes


def test_invitation_required_and_role_not_accepted(vault):
    client, db = vault
    payload = {
        "name": "New friend",
        "email": "new@example.com",
        "password": "A long password",
        "invitation": "x" * 32,
    }
    assert client.post("/api/v1/auth/register", json=payload).status_code == 400
    assert (
        client.post("/api/v1/auth/register", json={**payload, "role": "owner"}).status_code == 422
    )
    assert not db.users.find_one({"email": "new@example.com"})


def test_invitation_single_use_and_email_bound(vault):
    client, db = vault
    sign_in(client)
    invite = client.post("/api/v1/admin/invitations", json={"email": "new@example.com"}).json()
    token = invite["url"].split("invite=")[1]
    assert (
        client.get("/api/v1/auth/invitation", params={"token": token}).json()["email"]
        == "new@example.com"
    )
    payload = {
        "name": "New friend",
        "email": "wrong@example.com",
        "password": "A long password",
        "invitation": token,
    }
    assert client.post("/api/v1/auth/register", json=payload).status_code == 400
    payload["email"] = "new@example.com"
    result = client.post("/api/v1/auth/register", json=payload)
    assert result.status_code == 201
    assert result.json()["user"]["role"] == "user"
    assert "password" not in result.text
    assert client.post("/api/v1/auth/register", json=payload).status_code == 400
    assert passwords.verify(
        payload["password"], db.users.find_one({"email": payload["email"]})["password_hash"]
    )


def test_password_spaces_are_preserved():
    data = Register(
        name=" Friend ",
        email="friend@example.com",
        password="  password with spaces  ",
        invitation="x" * 32,
    )
    assert data.password == "  password with spaces  "
    assert data.name == "Friend"


def test_origin_refresh_rotation_and_logout(vault):
    client, db = vault
    assert (
        client.post(
            "/api/v1/auth/login",
            json={"email": "owner@example.com", "password": "Test password 123"},
            headers={"Origin": "https://evil.example"},
        ).status_code
        == 403
    )
    sign_in(client)
    old_cookie = client.cookies.get(COOKIE)
    result = client.post("/api/v1/auth/refresh")
    assert result.status_code == 200
    assert client.cookies.get(COOKIE) != old_cookie
    assert "HttpOnly" in result.headers["set-cookie"]
    assert (
        client.post(
            "/api/v1/auth/refresh", headers={"Cookie": f"{COOKIE}={old_cookie}"}
        ).status_code
        == 401
    )
    assert client.get("/api/v1/me").status_code == 200
    assert client.post("/api/v1/auth/logout").status_code == 204
    assert client.get("/api/v1/me").status_code == 401


def test_permissions_disabled_users_and_owner_protection(vault):
    client, db = vault
    sign_in(client, "listener")
    assert client.get("/api/v1/admin/users").status_code == 403
    sign_in(client, "owner")
    assert client.delete("/api/v1/admin/users/owner").status_code == 403
    assert client.patch("/api/v1/admin/users/owner", json={"active": False}).status_code == 403
    client.patch("/api/v1/admin/users/listener", json={"active": False})
    assert db.sessions.count_documents({"user_id": "listener"}) == 0
    assert (
        client.post(
            "/api/v1/auth/login",
            json={"email": "listener@example.com", "password": "Test password 123"},
        ).status_code
        == 401
    )
    sign_in(client, "admin")
    assert client.patch("/api/v1/admin/users/friend", json={"role": "admin"}).status_code == 403


def test_authenticated_ranges_and_revocation(vault):
    client, db = vault
    sign_in(client)
    song = upload(client)
    result = client.get(song["audio_url"], headers={"Range": "bytes=0-99"})
    assert result.status_code == 206
    assert len(result.content) == 100
    assert result.headers["content-range"].startswith("bytes 0-99/")
    assert client.get(song["audio_url"], headers={"Range": "bytes=9999999-"}).status_code == 416
    assert client.head(song["audio_url"]).status_code == 200
    db.sessions.delete_many({})
    assert client.get(song["audio_url"]).status_code == 401


def test_upload_validation_duplicates_and_archive(vault):
    client, db = vault
    sign_in(client)
    result = client.post(
        "/api/v1/admin/songs/upload",
        data={"metadata": json.dumps({"title": "Fake"})},
        files={"audio": ("fake.mp3", b"not real audio", "audio/mpeg")},
    )
    assert result.status_code == 400
    song = upload(client)
    duplicate = client.post(
        "/api/v1/admin/songs/upload",
        data={"metadata": json.dumps({"title": "Different title"})},
        files={"audio": ("duplicate.wav", wav_bytes(), "audio/wav")},
    )
    assert duplicate.status_code == 409
    assert client.delete(f"/api/v1/admin/songs/{song['id']}?permanent=true").status_code == 409
    assert client.delete(f"/api/v1/admin/songs/{song['id']}").status_code == 204
    assert client.get("/api/v1/songs").json()["total"] == 0
    sign_in(client, "listener")
    assert client.get(song["audio_url"]).status_code == 404
    sign_in(client)
    assert client.delete(f"/api/v1/admin/songs/{song['id']}?permanent=true").status_code == 204
    assert not list((settings.storage_dir / "audio").glob("*.wav"))


def test_labels_favorites_and_personal_playlist_isolation(vault):
    client, db = vault
    sign_in(client)
    mood = client.post("/api/v1/admin/labels", json={"kind": "mood", "name": "Road trip"}).json()
    assert (
        client.post("/api/v1/admin/labels", json={"kind": "mood", "name": "ROAD TRIP"}).status_code
        == 409
    )
    song = upload(client, mood_ids=[mood["id"]])
    assert client.get("/api/v1/songs", params={"mood": mood["id"]}).json()["total"] == 1
    assert client.delete(f"/api/v1/admin/labels/{mood['id']}").status_code == 409
    sign_in(client, "listener")
    client.put(f"/api/v1/me/favorites/{song['id']}")
    playlist = client.post(
        "/api/v1/me/playlists",
        json={"title": "My favorites", "smart": True, "favorites_only": True},
    ).json()
    assert playlist["track_ids"] == [song["id"]]
    sign_in(client, "friend")
    assert client.get("/api/v1/me/favorites").json() == []
    assert client.get("/api/v1/me/playlists").json() == []
    assert client.delete(f"/api/v1/me/playlists/{playlist['id']}").status_code == 404
    assert (
        client.patch(f"/api/v1/me/playlists/{playlist['id']}", json={"title": "Stolen"}).status_code
        == 404
    )


def test_recovery_expired_token_and_sessions(vault):
    client, db = vault
    sign_in(client)
    recovery = client.post("/api/v1/admin/users/listener/recovery").json()["url"].split("token=")[1]
    assert (
        client.post(
            "/api/v1/auth/reset-password",
            json={"token": recovery, "password": "New secure password"},
        ).status_code
        == 200
    )
    assert (
        client.post(
            "/api/v1/auth/reset-password",
            json={"token": recovery, "password": "New secure password"},
        ).status_code
        == 400
    )
    assert (
        client.post(
            "/api/v1/auth/login",
            json={"email": "listener@example.com", "password": "New secure password"},
        ).status_code
        == 200
    )
    expired = client.post("/api/v1/admin/users/friend/recovery").json()["url"].split("token=")[1]
    db.reset_tokens.update_many({}, {"$set": {"expires_at": now() - timedelta(seconds=1)}})
    assert (
        client.post(
            "/api/v1/auth/reset-password",
            json={"token": expired, "password": "New secure password"},
        ).status_code
        == 400
    )


def test_import_preserves_sources_and_is_idempotent(vault):
    client, db = vault
    sign_in(client)
    folder = settings.source_dir / "Love Songs"
    folder.mkdir()
    source = folder / "Original.wav"
    source.write_bytes(wav_bytes())
    assert inspect(source)["metadata_review"]
    initial = client.get("/api/v1/admin/import/preview").json()
    assert len(initial) == 1 and not initial[0]["duplicate"]

    # Run on the application's event loop to exercise the actual async driver.
    async def run():
        actor = {"_id": "owner", "name": "Owner"}
        job = await new_job(client.app.state.db, actor)
        await import_folder(client.app.state.db, actor, job["_id"])

    client.portal.call(run)
    client.portal.call(run)
    assert db.songs.count_documents({}) == 1
    assert source.read_bytes() == wav_bytes()
    assert client.get("/api/v1/admin/import/preview").json()[0]["duplicate"]
    assert db.songs.find_one({})["mood_ids"]


def test_overview_history_preferences_and_user_removal(vault):
    client, db = vault
    sign_in(client)
    song = upload(client)
    assert client.get("/api/v1/admin/overview").json()["songs"]["published"] == 1
    sign_in(client, "listener")
    client.post("/api/v1/me/history", json={"song_id": song["id"], "elapsed": 1.2})
    client.put("/api/v1/me/preferences", json={"volume": 0.4, "atmosphere": True})
    assert client.get("/api/v1/me/history").json()[0]["elapsed"] == 1.2
    assert client.get("/api/v1/me/preferences").json()["volume"] == 0.4
    sign_in(client)
    assert client.delete("/api/v1/admin/users/listener").status_code == 204
    assert db.history.count_documents({"user_id": "listener"}) == 0
    assert db.songs.count_documents({}) == 1
