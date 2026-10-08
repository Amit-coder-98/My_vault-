"""Remove only the disposable database and directory from a browser test run."""

import json
import re
import shutil
import tempfile
from pathlib import Path

from pymongo import MongoClient

from app.config import ROOT, settings


def cleanup():
    manifest = ROOT.parent / "frontend" / "output" / "browser-runtime.json"
    if not manifest.is_file():
        return
    values = json.loads(manifest.read_text(encoding="utf-8"))
    name = values["database"]
    directory = Path(values["source"]).resolve().parent
    # Validate both absolute targets before any destructive operation.
    if not re.fullmatch(r"my_music_vault_browser_test_[0-9a-f]{32}", name):
        raise ValueError("Refusing to remove a database outside the browser test namespace")
    if directory.parent != Path(tempfile.gettempdir()).resolve() or not directory.name.startswith(
        "vault-browser-"
    ):
        raise ValueError("Refusing to remove storage outside the browser test temporary directory")
    with MongoClient(settings.mongodb_url, serverSelectionTimeoutMS=5000) as client:
        client.drop_database(name)
    if directory.exists():
        shutil.rmtree(directory)
    manifest.unlink(missing_ok=True)
    print("Browser test database and private media removed.")


if __name__ == "__main__":
    cleanup()
