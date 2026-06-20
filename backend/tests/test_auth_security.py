import pytest

from app.auth import security


def test_password_hash_and_verify():
    h = security.hash_password("hunter2")
    assert h != "hunter2"
    assert security.verify_password("hunter2", h) is True
    assert security.verify_password("wrong", h) is False


def test_access_token_roundtrip():
    tok = security.create_access_token(subject="42")
    payload = security.decode_token(tok)
    assert payload["sub"] == "42"
    assert payload["type"] == "access"


def test_refresh_token_has_type():
    tok = security.create_refresh_token(subject="7")
    payload = security.decode_token(tok)
    assert payload["type"] == "refresh"


def test_decode_rejects_garbage():
    assert security.decode_token("not-a-jwt") is None


def test_verify_google_id_token_mocked(monkeypatch):
    def fake_verify(token, request, audience):
        assert audience == security.settings.google_client_id
        return {"sub": "google-sub-1", "email": "x@y.com", "name": "X", "picture": "http://p"}

    monkeypatch.setattr(security, "_google_verify", fake_verify)
    info = security.verify_google_id_token("dummy")
    assert info["sub"] == "google-sub-1"
    assert info["email"] == "x@y.com"
