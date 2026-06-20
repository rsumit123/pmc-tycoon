"""Auth primitives: JWT issue/verify, password hashing, Google ID-token verify."""
from datetime import datetime, timedelta, UTC

import jwt
from passlib.hash import argon2
from google.oauth2 import id_token as _google_id_token
from google.auth.transport import requests as _google_requests

from app.core.config import settings


def hash_password(plain: str) -> str:
    return argon2.hash(plain)


def verify_password(plain: str, hashed: str) -> bool:
    try:
        return argon2.verify(plain, hashed)
    except (ValueError, TypeError):
        return False


def _encode(subject: str, token_type: str, expires_minutes: int) -> str:
    now = datetime.now(UTC)
    payload = {
        "sub": str(subject),
        "type": token_type,
        "iat": now,
        "exp": now + timedelta(minutes=expires_minutes),
    }
    return jwt.encode(payload, settings.jwt_secret_key, algorithm=settings.jwt_algorithm)


def create_access_token(subject: str) -> str:
    return _encode(subject, "access", settings.access_token_expire_minutes)


def create_refresh_token(subject: str) -> str:
    return _encode(subject, "refresh", settings.refresh_token_expire_minutes)


def decode_token(token: str) -> dict | None:
    try:
        return jwt.decode(token, settings.jwt_secret_key, algorithms=[settings.jwt_algorithm])
    except jwt.PyJWTError:
        return None


def _google_verify(token: str, request, audience: str) -> dict:
    """Seam for monkeypatching in tests."""
    return _google_id_token.verify_oauth2_token(token, request, audience)


def verify_google_id_token(token: str) -> dict:
    """Returns the verified Google claims dict, or raises ValueError on failure."""
    info = _google_verify(token, _google_requests.Request(), settings.google_client_id)
    if not info.get("email"):
        raise ValueError("Google token missing email")
    return info
