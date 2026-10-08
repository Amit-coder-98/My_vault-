import io
import json
from datetime import datetime, timezone

import boto3
import pytest
from botocore.exceptions import ClientError
from botocore.response import StreamingBody
from botocore.stub import ANY, Stubber
from PIL import Image

from app import storage
from app.config import Settings, settings
from app.imports import import_folder, new_job

from .conftest import sign_in, upload, wav_bytes


class FakeB2:
    """B2-shaped responses; no live bucket is touched by persistence/API tests."""

    def __init__(self):
        self.objects, self.latest, self.deletes = {}, {}, []
        self.public, self.fail_put, self.fail_delete = False, False, False
        self.gets, self.closed_bodies = [], []

    def close(self):
        pass

    def head_bucket(self, **params):
        return {}

    def get_bucket_acl(self, **params):
        return (
            {"Grants": [{"Grantee": {"URI": "http://acs.amazonaws.com/groups/global/AllUsers"}}]}
            if self.public
            else {"Grants": []}
        )

    def head_object(self, Bucket, Key, VersionId=None):
        version = VersionId or self.latest.get((Bucket, Key))
        item = self.objects.get((Bucket, Key, version))
        if item is None:
            raise ClientError(
                {"Error": {"Code": "NoSuchKey"}, "ResponseMetadata": {"HTTPStatusCode": 404}},
                "HeadObject",
            )
        return {
            "ContentLength": len(item["data"]),
            "VersionId": version,
            "Metadata": item["metadata"],
            "ETag": '"test-etag"',
            "LastModified": datetime(2026, 10, 8, tzinfo=timezone.utc),
        }

    def put_object(self, Bucket, Key, Body, Metadata, **params):
        if self.fail_put:
            raise ClientError({"Error": {"Code": "AccessDenied"}}, "PutObject")
        version = str(len(self.objects) + 1)
        self.objects[Bucket, Key, version] = {"data": Body.read(), "metadata": Metadata}
        self.latest[Bucket, Key] = version
        return {"VersionId": version}

    def get_object(self, Bucket, Key, VersionId, Range=None):
        self.gets.append((Key, Range))
        data = self.objects[Bucket, Key, VersionId]["data"]
        if Range:
            first, last = map(int, Range.removeprefix("bytes=").split("-"))
            data = data[first : last + 1]
        stream = io.BytesIO(data)
        self.closed_bodies.append(stream)
        return {"Body": StreamingBody(stream, len(data)), "ContentLength": len(data)}

    def delete_object(self, Bucket, Key, VersionId):
        if self.fail_delete:
            raise ClientError({"Error": {"Code": "AccessDenied"}}, "DeleteObject")
        self.deletes.append((Bucket, Key, VersionId))
        self.objects.pop((Bucket, Key, VersionId), None)
        return {}


@pytest.fixture
def cloud(monkeypatch):
    for name, value in {
        "storage_backend": "b2",
        "b2_bucket_name": "test-vault",
        "b2_prefix": "Songs_data",
    }.items():
        monkeypatch.setattr(settings, name, value)
    fake = FakeB2()
    monkeypatch.setattr(storage, "b2_client", lambda: fake)
    return fake


def image_bytes(color="navy"):
    result = io.BytesIO()
    Image.new("RGB", (40, 40), color).save(result, "PNG")
    return result.getvalue()


def test_b2_folder_upload_private_ranges_and_immediate_revocation(vault, cloud):
    client, db = vault
    sign_in(client)
    song = upload(client, storage_folder="Love Songs/Evening")
    record = db.songs.find_one({"_id": song["id"]})
    assert record["audio_path"].startswith("Songs_data/Love Songs/Evening/audio/")
    assert record["audio_path"].endswith("-test.wav")
    assert "storage_bucket" not in song and "audio_version_id" not in song
    assert not list((settings.storage_dir / "audio").glob("*"))
    response = client.get(song["audio_url"], headers={"Range": "bytes=0-99"})
    assert response.status_code == 206 and response.content == wav_bytes()[:100]
    assert response.headers["content-range"] == f"bytes 0-99/{len(wav_bytes())}"
    assert cloud.closed_bodies[-1].closed
    assert (
        client.get(song["audio_url"], headers={"Range": "bytes=-40"}).content == wav_bytes()[-40:]
    )
    assert client.get(song["audio_url"], headers={"Range": "bytes=9999999-"}).status_code == 416
    assert client.get(song["audio_url"], headers={"Range": "bytes=0-9,20-30"}).status_code == 416
    gets = len(cloud.gets)
    assert client.head(song["audio_url"]).status_code == 200 and len(cloud.gets) == gets
    full = client.get(song["audio_url"], headers={"Range": "bytes=0-9", "If-Range": '"old-etag"'})
    assert full.status_code == 200 and len(full.content) == len(wav_bytes())
    db.sessions.delete_many({})
    assert client.get(song["audio_url"]).status_code == 401
    assert len(cloud.gets) == gets + 1


def test_optional_cover_added_later_metadata_edited_and_old_version_removed(vault, cloud):
    client, db = vault
    sign_in(client)
    song = upload(client, storage_folder="Rap")
    assert not song["artwork_url"]
    audio = db.songs.find_one({"_id": song["id"]})["audio_path"]
    assert (
        client.patch(
            f"/api/v1/admin/songs/{song['id']}",
            json={"title": "Updated title", "artist": "A friend", "storage_folder": "Other"},
        ).status_code
        == 200
    )
    artwork_urls = []
    for color in ("navy", "gold"):
        assert (
            client.post(
                f"/api/v1/admin/songs/{song['id']}/artwork",
                files={"cover": ("cover.png", image_bytes(color), "image/png")},
            ).status_code
            == 200
        )
        songs = client.get("/api/v1/songs").json()["items"]
        artwork_urls.append(next(item["artwork_url"] for item in songs if item["id"] == song["id"]))
    assert artwork_urls[0] != artwork_urls[1]
    record = db.songs.find_one({"_id": song["id"]})
    assert record["audio_path"] == audio and record["storage_folder"] == "Rap"
    assert record["title"] == "Updated title"
    assert record["cover_path"].startswith("Songs_data/Rap/artwork/")
    assert len(cloud.deletes) == 1 and len(cloud.objects) == 2
    cover = client.get(f"/api/v1/songs/{song['id']}/artwork")
    assert cover.status_code == 200 and cover.headers["content-type"] == "image/webp"
    assert (
        client.post(
            f"/api/v1/admin/songs/{song['id']}/artwork",
            files={"cover": ("bad.png", b"bad image", "image/png")},
        ).status_code
        == 400
    )
    assert db.songs.find_one({"_id": song["id"]})["cover_path"] == record["cover_path"]


def test_b2_initial_cover_and_invalid_cover_validation(vault, cloud):
    client, db = vault
    sign_in(client)
    data = {"metadata": json.dumps({"title": "First upload", "storage_folder": "English"})}
    files = {
        "audio": ("test.wav", wav_bytes(), "audio/wav"),
        "cover": ("cover.png", b"invalid", "image/png"),
    }
    assert client.post("/api/v1/admin/songs/upload", data=data, files=files).status_code == 400
    assert not cloud.objects and db.songs.count_documents({}) == 0
    files["cover"] = ("cover.png", image_bytes(), "image/png")
    response = client.post("/api/v1/admin/songs/upload", data=data, files=files)
    assert response.status_code == 201
    song = response.json()
    assert song["title"] == "First upload" and song["storage_folder"] == "English"
    assert len(cloud.objects) == 2
    assert client.get(song["artwork_url"]).status_code == 200
    assert client.get(song["audio_url"], headers={"Range": "bytes=0-99"}).status_code == 206


def test_b2_permanent_deletion_keeps_record_until_cloud_deletion_succeeds(vault, cloud):
    client, db = vault
    sign_in(client)
    song = upload(client)
    assert client.delete(f"/api/v1/admin/songs/{song['id']}").status_code == 204
    cloud.fail_delete = True
    assert client.delete(f"/api/v1/admin/songs/{song['id']}?permanent=true").status_code == 503
    assert db.songs.find_one({"_id": song["id"]})["status"] == "archived"
    cloud.fail_delete = False
    assert client.delete(f"/api/v1/admin/songs/{song['id']}?permanent=true").status_code == 204
    assert not cloud.objects


def test_deletion_removes_only_the_owned_version_when_another_record_uses_the_same_key(vault, cloud):
    client, db = vault
    sign_in(client)
    song = upload(client)
    record = db.songs.find_one({"_id": song["id"]})
    owned = (record["storage_bucket"], record["audio_path"], record["audio_version_id"])
    other = (record["storage_bucket"], record["audio_path"], "other-version")
    cloud.objects[other] = dict(cloud.objects[owned])
    db.songs.insert_one({
        **record, "_id": "another-song", "sha256": "another-fixture-hash",
        "audio_version_id": "other-version",
    })
    assert client.delete(f"/api/v1/admin/songs/{song['id']}").status_code == 204
    assert client.delete(f"/api/v1/admin/songs/{song['id']}?permanent=true").status_code == 204
    assert owned not in cloud.objects and other in cloud.objects


def test_public_bucket_and_failed_upload_never_publish_a_song(vault, cloud):
    client, db = vault
    sign_in(client)
    for public in (True, False):
        cloud.public, cloud.fail_put = public, not public
        result = client.post(
            "/api/v1/admin/songs/upload",
            data={"metadata": json.dumps({"title": "Private only"})},
            files={"audio": ("test.wav", wav_bytes(), "audio/wav")},
        )
        assert result.status_code == 503
        assert not db.songs.find_one({}) and not cloud.objects


def test_local_import_migrates_to_b2_once_without_losing_ids_or_personal_data(
    vault, cloud, monkeypatch
):
    client, db = vault
    sign_in(client)
    folder = settings.source_dir / "Sad_breckup songs"
    folder.mkdir()
    source = folder / "Original.wav"
    source.write_bytes(wav_bytes())

    async def run():
        actor = {"_id": "owner", "name": "Owner"}
        job = await new_job(client.app.state.db, actor)
        await import_folder(client.app.state.db, actor, job["_id"])
        return await client.app.state.db.upload_jobs.find_one({"_id": job["_id"]})

    monkeypatch.setattr(settings, "storage_backend", "local")
    assert client.portal.call(run)["results"][0]["status"] == "imported"
    before = db.songs.find_one({})
    client.put(f"/api/v1/me/favorites/{before['_id']}")
    monkeypatch.setattr(settings, "storage_backend", "b2")
    assert client.get("/api/v1/admin/import/preview").json()[0]["migration_needed"]
    cloud.fail_put = True
    assert client.portal.call(run)["results"][0]["status"] == "failed"
    assert db.songs.find_one({})["audio_path"] == before["audio_path"]
    cloud.fail_put = False
    assert client.portal.call(run)["results"][0]["status"] == "migrated"
    after = db.songs.find_one({})
    assert before["_id"] == after["_id"] and before["mood_ids"] == after["mood_ids"]
    assert after["audio_path"].startswith("Songs_data/Sad_breckup songs/audio/")
    assert (
        source.read_bytes() == wav_bytes()
        and (settings.storage_dir / before["audio_path"]).is_file()
    )
    assert client.get("/api/v1/me/favorites").json() == [before["_id"]]
    assert client.portal.call(run)["results"][0]["status"] == "skipped"
    assert len(cloud.objects) == 1


def test_artwork_cleanup_failure_is_retryable_after_the_new_cover_is_saved(vault, cloud):
    client, db = vault
    sign_in(client)
    song = upload(client)
    endpoint = f"/api/v1/admin/songs/{song['id']}/artwork"
    assert (
        client.post(endpoint, files={"cover": ("a.png", image_bytes(), "image/png")}).status_code
        == 200
    )
    cloud.fail_delete = True
    assert (
        client.post(
            endpoint, files={"cover": ("b.png", image_bytes("gold"), "image/png")}
        ).status_code
        == 200
    )
    assert db.asset_cleanup.count_documents({}) == 1
    cloud.fail_delete = False
    assert client.portal.call(storage.cleanup_pending, client.app.state.db) == 0
    assert len(cloud.objects) == 2


def test_reused_cover_clears_cleanup_job_without_deleting_current_artwork(vault, cloud):
    client, db = vault
    sign_in(client)
    song = upload(client)
    endpoint = f"/api/v1/admin/songs/{song['id']}/artwork"
    assert client.post(
        endpoint, files={"cover": ("a.png", image_bytes(), "image/png")}
    ).status_code == 200
    cloud.fail_delete = True
    assert client.post(
        endpoint, files={"cover": ("b.png", image_bytes("gold"), "image/png")}
    ).status_code == 200
    assert client.post(
        endpoint, files={"cover": ("a.png", image_bytes(), "image/png")}
    ).status_code == 200
    cloud.fail_delete = False
    assert client.portal.call(storage.cleanup_pending, client.app.state.db) == 0
    assert client.get(endpoint.replace("/admin", "")).status_code == 200
    assert len(cloud.objects) == 2


def test_boto_s3_upload_contract_and_version_reuse(monkeypatch, tmp_path):
    client = boto3.client(
        "s3",
        endpoint_url="https://s3.us-west-004.backblazeb2.com",
        region_name="us-west-004",
        aws_access_key_id="test-id",
        aws_secret_access_key="test-secret",
    )
    monkeypatch.setattr(storage, "b2_client", lambda: client)
    monkeypatch.setattr(settings, "b2_bucket_name", "test-vault")
    file = tmp_path / "song.wav"
    file.write_bytes(b"recording")
    with Stubber(client) as stub:
        stub.add_client_error(
            "head_object",
            service_error_code="404",
            http_status_code=404,
            expected_params={"Bucket": "test-vault", "Key": "Songs_data/Love/audio/test.wav"},
        )
        stub.add_response(
            "put_object",
            {"VersionId": "b2-exact-version"},
            {
                "Bucket": "test-vault",
                "Key": "Songs_data/Love/audio/test.wav",
                "Body": ANY,
                "ContentLength": 9,
                "ContentType": "audio/wav",
                "CacheControl": "private, no-store",
                "Metadata": {"sha256": "hash"},
            },
        )
        assert (
            storage.put_asset(file, "Songs_data/Love/audio/test.wav", "audio/wav", "hash")
            == "b2-exact-version"
        )
        stub.add_response(
            "head_object",
            {"ContentLength": 9, "Metadata": {"sha256": "hash"}, "VersionId": "b2-exact-version"},
            {"Bucket": "test-vault", "Key": "Songs_data/Love/audio/test.wav"},
        )
        assert (
            storage.put_asset(file, "Songs_data/Love/audio/test.wav", "audio/wav", "hash")
            == "b2-exact-version"
        )
        stub.assert_no_pending_responses()


def test_b2_settings_and_path_validation():
    config = Settings(
        _env_file=None,
        storage_backend="b2",
        b2_endpoint_url="https://s3.us-west-004.backblazeb2.com",
        b2_region="us-west-004",
        b2_bucket_name="test-vault",
        b2_key_id="test-id",
        b2_application_key="test-secret",
    )
    config.validate_b2()
    config.b2_endpoint_url = "https://example.com"
    with pytest.raises(ValueError, match="S3 endpoint"):
        config.validate_b2()
    for folder in ("../secret", "/absolute", "C:\\secret", "Love//Songs"):
        with pytest.raises(ValueError):
            storage.folder_name(folder)
