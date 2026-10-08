from typing import Literal

from pydantic import BaseModel, ConfigDict, EmailStr, Field, field_validator


class Input(BaseModel):
    model_config = ConfigDict(extra="forbid")

    @field_validator("*", mode="before")
    @classmethod
    def trim_descriptive_fields(cls, value, info):
        if info.field_name in {
            "name",
            "new_name",
            "title",
            "artist",
            "album",
            "email",
        } and isinstance(value, str):
            return value.strip()
        return value


class Login(Input):
    email: EmailStr
    password: str = Field(min_length=1, max_length=128)


class Register(Login):
    name: str = Field(min_length=2, max_length=80)
    password: str = Field(min_length=10, max_length=128)
    invitation: str = Field(min_length=20, max_length=200)


class Invite(Input):
    email: EmailStr


class UserUpdate(Input):
    name: str | None = Field(default=None, min_length=2, max_length=80)
    active: bool | None = None
    role: Literal["admin", "user"] | None = None


class LabelInput(Input):
    name: str = Field(min_length=1, max_length=60)
    kind: Literal["mood", "genre", "language"]


class SongInput(Input):
    title: str = Field(min_length=1, max_length=200)
    artist: str = Field(default="Unknown artist", min_length=1, max_length=200)
    album: str = Field(default="Singles", min_length=1, max_length=200)
    mood_ids: list[str] = Field(default_factory=list, max_length=12)
    genre_ids: list[str] = Field(default_factory=list, max_length=8)
    language_id: str | None = None
    year: int = Field(default=0, ge=0, le=2200)
    description: str = Field(default="", max_length=2000)
    storage_folder: str = Field(default="", max_length=240)
    status: Literal["draft", "published", "archived"] = "published"
    featured: bool = False


class PlaylistInput(Input):
    title: str = Field(min_length=1, max_length=100)
    description: str = Field(default="", max_length=1000)
    track_ids: list[str] = Field(default_factory=list, max_length=1000)
    mood_id: str | None = None
    genre_id: str | None = None
    language_id: str | None = None
    favorites_only: bool = False
    smart: bool = False


class ProfileInput(Input):
    name: str = Field(min_length=2, max_length=80)


class PasswordInput(Input):
    current_password: str = Field(min_length=1, max_length=128)
    password: str = Field(min_length=10, max_length=128)


class ResetInput(Input):
    token: str = Field(min_length=20, max_length=200)
    password: str = Field(min_length=10, max_length=128)


class HistoryInput(Input):
    song_id: str
    elapsed: float = Field(ge=0, le=86400, allow_inf_nan=False)


class Preferences(Input):
    volume: float = Field(default=0.7, ge=0, le=1, allow_inf_nan=False)
    atmosphere: bool = False


class BulkTags(Input):
    song_ids: list[str] = Field(min_length=1, max_length=200)
    mood_ids: list[str] = Field(max_length=12)


class MetadataGroup(Input):
    kind: Literal["artist", "album"]
    name: str = Field(min_length=1, max_length=200)
    new_name: str = Field(min_length=1, max_length=200)
    merge: bool = False
