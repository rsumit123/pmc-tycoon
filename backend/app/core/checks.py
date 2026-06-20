"""Startup safety checks for production-like deployments.

Kept as pure, testable functions; `main.py` calls them at import time.
"""
import logging

from sqlalchemy import inspect
from sqlalchemy.engine import Engine

logger = logging.getLogger(__name__)

INSECURE_JWT_DEFAULT = "dev-insecure-change-me"
# The Docker/prod container mounts the DB at /app/data (see deploy.sh). Local
# dev + tests use ./sovereign_shield.db or :memory:, which are NOT prod-like.
_PROD_DB_MARKER = "/app/data"


def is_production_like(database_url: str) -> bool:
    return _PROD_DB_MARKER in database_url


def assert_production_secrets(settings) -> None:
    """Refuse to boot a prod-like deployment that still uses the insecure default
    JWT secret — with open self-service signup, a known signing key lets anyone
    forge a token for any user. No-op for local dev / tests."""
    if is_production_like(settings.database_url) and settings.jwt_secret_key == INSECURE_JWT_DEFAULT:
        raise RuntimeError(
            "JWT_SECRET_KEY is unset (using the insecure default) in a production "
            "deployment. Set a strong JWT_SECRET_KEY in the backend .env before starting "
            "(e.g. `openssl rand -hex 32`)."
        )
    if settings.jwt_secret_key == INSECURE_JWT_DEFAULT:
        logger.warning("JWT_SECRET_KEY is the insecure default — fine for local dev, NOT for any shared deployment.")


def verify_user_id_migration(engine: Engine) -> None:
    """Log a loud ERROR if campaigns.user_id is absent after the startup migration.
    Without the column every campaign query 500s, so this must not fail silently."""
    inspector = inspect(engine)
    if "campaigns" not in inspector.get_table_names():
        return
    columns = {col["name"] for col in inspector.get_columns("campaigns")}
    if "user_id" not in columns:
        logger.error(
            "CRITICAL: campaigns.user_id column is missing after startup migration — "
            "all campaign endpoints will fail. Check the ALTER TABLE migration."
        )
