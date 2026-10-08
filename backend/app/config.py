import secrets
from pathlib import Path
from typing import Literal
from urllib.parse import urlsplit

from pydantic import Field
from pydantic_settings import BaseSettings, SettingsConfigDict

ROOT = Path(__file__).resolve().parents[1]


class Settings(BaseSettings):
    model_config = SettingsConfigDict(env_file=ROOT / ".env", extra="ignore")
    vault_env: Literal["development", "production"] = "development"
    mongodb_url: str = "mongodb://127.0.0.1:27017"
    database_name: str = "my_music_vault"
    auth_secret: str = ""
    frontend_url: str = "http://127.0.0.1:5173"
    allowed_origins: list[str] = ["http://127.0.0.1:5173", "http://localhost:5173"]
    cookie_secure: bool = False
    source_dir: Path = ROOT.parent / "Songs_data"
    storage_dir: Path = ROOT / "storage"
    storage_backend: Literal["local", "b2"] = "local"
    b2_endpoint_url: str = ""
    b2_region: str = ""
    b2_bucket_name: str = ""
    b2_key_id: str = ""
    b2_application_key: str = ""
    b2_prefix: str = "Songs_data"
    max_upload_mb: int = Field(default=100, ge=1, le=1024)
    ffmpeg_path: str = "ffmpeg"

    def configure(self):
        if self.storage_backend == "b2":
            self.validate_b2()
        for name in ("source_dir", "storage_dir"):
            path = getattr(self, name)
            setattr(
                self, name, (ROOT / path).resolve() if not path.is_absolute() else path.resolve()
            )
        if self.vault_env != "development" and (
            len(self.auth_secret) < 32 or not self.cookie_secure
        ):
            raise ValueError(
                "Production requires AUTH_SECRET (32+ characters) and COOKIE_SECURE=true"
            )
        if self.vault_env == "production":
            origins = [self.frontend_url, *self.allowed_origins]
            for origin in origins:
                url = urlsplit(origin)
                if (
                    url.scheme != "https"
                    or not url.hostname
                    or url.username
                    or url.password
                    or url.path
                    or url.query
                    or url.fragment
                    or "*" in origin
                    or any(character.isspace() for character in origin)
                    or url.port == 0
                ):
                    raise ValueError(
                        "Production FRONTEND_URL and ALLOWED_ORIGINS must be exact HTTPS origins without a trailing slash"
                    )
            if self.frontend_url not in self.allowed_origins:
                raise ValueError("ALLOWED_ORIGINS must include FRONTEND_URL")
        if not self.auth_secret:
            secret_path = ROOT / ".runtime-secret"
            try:
                with secret_path.open("x", encoding="utf-8") as output:
                    output.write(secrets.token_hex(32))
            except FileExistsError:
                pass
            self.auth_secret = secret_path.read_text(encoding="utf-8").strip()
        if len(self.auth_secret) < 32:
            raise ValueError("AUTH_SECRET must contain at least 32 characters")
        self.storage_dir.mkdir(parents=True, exist_ok=True)
        return self

    def validate_b2(self):
        required = (
            "b2_endpoint_url",
            "b2_region",
            "b2_bucket_name",
            "b2_key_id",
            "b2_application_key",
        )
        missing = [name.upper() for name in required if not getattr(self, name).strip()]
        if missing:
            raise ValueError("B2 storage needs these backend/.env settings: " + ", ".join(missing))
        url = urlsplit(self.b2_endpoint_url)
        if (
            url.scheme != "https"
            or url.hostname != f"s3.{self.b2_region}.backblazeb2.com"
            or url.username
            or url.password
            or url.path not in ("", "/")
            or url.query
            or url.fragment
            or url.port
        ):
            raise ValueError(
                "B2_ENDPOINT_URL must be your HTTPS B2 S3 endpoint; B2_REGION must match it"
            )
        prefix = self.b2_prefix.strip("/")
        if (
            not prefix
            or "\\" in prefix
            or any(part in (".", "..", "") for part in prefix.split("/"))
        ):
            raise ValueError("B2_PREFIX must be a relative object prefix, for example Songs_data")
        self.b2_prefix = prefix


settings = Settings().configure()
