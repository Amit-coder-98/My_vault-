from app.config import settings

from .conftest import sign_in, upload


def test_artist_groups_require_explicit_merge_and_update_every_song(vault):
    client, db = vault
    sign_in(client)
    song = upload(client)
    second = {**db.songs.find_one({"_id": song["id"]}), "_id": "second", "sha256": "second"}
    db.songs.insert_one(second)
    db.songs.insert_one({**second, "_id": "third", "sha256": "third", "artist": "Other artist"})
    groups = client.get("/api/v1/admin/metadata-groups").json()
    assert next(group for group in groups if group["name"] == "Test artist")["count"] == 2
    change = {"kind": "artist", "name": "Test artist", "new_name": " Other artist "}
    assert client.patch("/api/v1/admin/metadata-groups", json=change).status_code == 409
    result = client.patch("/api/v1/admin/metadata-groups", json={**change, "merge": True})
    assert result.status_code == 200
    assert result.json()["updated"] == 2
    assert db.songs.count_documents({"artist": "Other artist"}) == 3
    sign_in(client, "listener")
    assert client.get("/api/v1/admin/metadata-groups").status_code == 403


def test_media_path_confinement_and_classification_types(vault):
    client, db = vault
    sign_in(client)
    song = upload(client)
    outside = settings.storage_dir.parent / "outside.wav"
    outside.write_bytes(b"private file outside managed storage")
    db.songs.update_one({"_id": song["id"]}, {"$set": {"audio_path": "../outside.wav"}})
    assert client.get(song["audio_url"]).status_code == 404
    mood = db.labels.find_one({"kind": "mood"})
    bad = {"title": "Wrong classification", "language_id": mood["_id"]}
    assert client.patch(f"/api/v1/admin/songs/{song['id']}", json=bad).status_code == 400
