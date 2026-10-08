"""Test services always use local MongoDB unless VAULT_TEST_MONGODB_URL is explicit."""

import os

os.environ["MONGODB_URL"] = os.environ.get("VAULT_TEST_MONGODB_URL", "mongodb://127.0.0.1:27017")
os.environ["STORAGE_BACKEND"] = "local"
os.environ["VAULT_ENV"] = "development"
os.environ["COOKIE_SECURE"] = "false"
os.environ["AUTH_SECRET"] = "disposable-vault-tests-only-secret-2026"
os.environ["FRONTEND_URL"] = "http://127.0.0.1:5173"
os.environ["ALLOWED_ORIGINS"] = '["http://127.0.0.1:5173","http://localhost:5173"]'
