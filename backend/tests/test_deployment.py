from datetime import timedelta

import pytest
from fastapi.testclient import TestClient

from app.config import Settings, settings
from app.database import now
from app.main import create_app
from app.security import digest, passwords

from .conftest import sign_in


@pytest.mark.parametrize("headers", [{}, {"Content-Length": "1"}])
def test_body_limit_counts_bytes_without_trusting_length(vault, headers):
    client, db = vault
    result = client.post(
        "/api/v1/auth/register",
        content=iter([b" " * 65536, b" " * 65537]),
        headers={"Content-Type": "application/json", **headers},
    )
    assert result.status_code == 413
    assert result.headers["x-content-type-options"] == "nosniff"
    assert db.users.count_documents({}) == 4


def test_chunked_multipart_limit_prevents_oversized_upload(vault, monkeypatch):
    client, db = vault
    sign_in(client)
    monkeypatch.setattr(settings, "max_upload_mb", 1)
    body = [
        b'--vault\r\nContent-Disposition: form-data; name="audio"; filename="huge.wav"\r\n'
        b"Content-Type: audio/wav\r\n\r\n",
        b"x" * (10 * 1024 * 1024),
        b"\r\n--vault--\r\n",
    ]
    result = client.post(
        "/api/v1/admin/songs/upload",
        content=iter(body),
        headers={"Content-Type": "multipart/form-data; boundary=vault"},
    )
    assert result.status_code == 413
    assert not db.songs.find_one({})
    assert not list(settings.storage_dir.rglob("*.wav"))


def test_upload_authorization_runs_before_multipart_parser_reads_body(vault):
    client, db = vault

    def unread_body():
        raise AssertionError("Unauthorized upload body must not be read or spooled")
        yield b"unreachable"

    headers = {"Content-Type": "multipart/form-data; boundary=vault"}
    assert client.post(
        "/api/v1/admin/songs/upload", content=unread_body(), headers=headers
    ).status_code == 401
    sign_in(client, "listener")
    assert client.post(
        "/api/v1/admin/songs/upload", content=unread_body(), headers=headers
    ).status_code == 403
    assert not db.songs.find_one({})


def test_validation_errors_do_not_echo_credentials(vault):
    client, db = vault
    private_password = "private-password-" * 10
    private_token = "private-token-" * 20
    result = client.post(
        "/api/v1/auth/reset-password",
        json={"token": private_token, "password": private_password},
    )
    assert result.status_code == 422
    assert private_password not in result.text and private_token not in result.text
    assert all("input" not in error for error in result.json()["detail"])


def test_new_recovery_link_replaces_previous_link(vault):
    client, db = vault
    sign_in(client)
    endpoint = "/api/v1/admin/users/listener/recovery"
    previous = client.post(endpoint).json()["url"].split("token=")[1]
    newest = client.post(endpoint).json()["url"].split("token=")[1]
    assert db.reset_tokens.count_documents({"user_id": "listener"}) == 1
    assert client.post(
        "/api/v1/auth/reset-password",
        json={"token": previous, "password": "New test password 123"},
    ).status_code == 400
    # A legacy link must also be revoked when a valid password reset completes.
    legacy = "old-unused-recovery-link-123456"
    db.reset_tokens.insert_one({
        "_id": "legacy",
        "user_id": "listener",
        "token_hash": digest(legacy),
        "expires_at": now() + timedelta(hours=1),
    })
    sign_in(client, "listener")
    assert client.post(
        "/api/v1/auth/reset-password",
        json={"token": newest, "password": "New test password 123"},
    ).status_code == 200
    assert db.reset_tokens.count_documents({"user_id": "listener"}) == 0
    assert client.get("/api/v1/me").status_code == 401
    assert client.post(
        "/api/v1/auth/reset-password",
        json={"token": legacy, "password": "Another test password 123"},
    ).status_code == 400


def test_password_change_revokes_unused_recovery_links(vault):
    client, db = vault
    sign_in(client)
    token = client.post("/api/v1/admin/users/listener/recovery").json()["url"].split("token=")[1]
    sign_in(client, "listener")
    result = client.post("/api/v1/me/password", json={
        "current_password": "Test password 123",
        "password": "Changed test password 123",
    })
    assert result.status_code == 200
    assert db.reset_tokens.count_documents({"user_id": "listener"}) == 0
    assert client.get("/api/v1/me").status_code == 401
    assert client.post("/api/v1/auth/reset-password", json={
        "token": token, "password": "Stale recovery password 123",
    }).status_code == 400
    assert passwords.verify(
        "Changed test password 123", db.users.find_one({"_id": "listener"})["password_hash"]
    )


@pytest.mark.parametrize("overrides", [
    {"auth_secret": ""},
    {"cookie_secure": False},
    {"frontend_url": "http://vault.example.com"},
    {"frontend_url": "https://vault.example.com/"},
    {"frontend_url": "https://vault.example.com/login"},
    {"frontend_url": "https://vault.example.com:invalid"},
    {"allowed_origins": ["*"]},
    {"allowed_origins": ["https://another.example.com"]},
    {"allowed_origins": ["http://vault.example.com"]},
])
def test_production_rejects_unsafe_configuration(tmp_path, overrides):
    values = {
        "vault_env": "production",
        "auth_secret": "production-config-test-secret-at-least-32",
        "cookie_secure": True,
        "frontend_url": "https://vault.example.com",
        "allowed_origins": ["https://vault.example.com"],
        "storage_dir": tmp_path,
        **overrides,
    }
    with pytest.raises(ValueError):
        Settings(_env_file=None, **values).configure()


def test_valid_production_configuration_and_hidden_docs(tmp_path, monkeypatch):
    configuration = Settings(
        _env_file=None,
        vault_env="production",
        auth_secret="production-config-test-secret-at-least-32",
        cookie_secure=True,
        frontend_url="https://vault.example.com",
        allowed_origins=["https://vault.example.com"],
        storage_dir=tmp_path,
    ).configure()
    monkeypatch.setattr(settings, "vault_env", configuration.vault_env)
    client = TestClient(create_app())
    for path in ("/docs", "/redoc", "/openapi.json"):
        assert client.get(path).status_code == 404
    response = client.get("/health")
    assert response.status_code == 200
    assert "frame-ancestors 'none'" in response.headers["content-security-policy"]
    assert response.headers["referrer-policy"] == "no-referrer"


def test_production_session_cookie_has_secure_flag(vault, monkeypatch):
    client, db = vault
    monkeypatch.setattr(settings, "cookie_secure", True)
    response = client.post("/api/v1/auth/login", json={
        "email": "owner@example.com", "password": "Test password 123",
    })
    assert response.status_code == 200
    cookie = response.headers["set-cookie"]
    assert "Secure" in cookie and "HttpOnly" in cookie and "SameSite=lax" in cookie
    assert "Path=/api/v1" in cookie
