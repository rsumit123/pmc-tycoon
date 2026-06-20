import pytest
from sqlalchemy import create_engine
from sqlalchemy.orm import sessionmaker
from sqlalchemy.pool import StaticPool

from app.db.base import Base
import app.models  # noqa: F401
from app.auth import service


def _session():
    engine = create_engine("sqlite:///:memory:", connect_args={"check_same_thread": False}, poolclass=StaticPool)
    Base.metadata.create_all(bind=engine)
    return sessionmaker(bind=engine)()


def test_signup_creates_user():
    db = _session()
    u = service.signup_user(db, email="a@b.com", password="pw123456", display_name="A")
    assert u.id is not None
    assert u.auth_provider == "password"
    assert u.password_hash is not None


def test_signup_duplicate_raises():
    db = _session()
    service.signup_user(db, email="a@b.com", password="pw123456", display_name="A")
    with pytest.raises(service.EmailTakenError):
        service.signup_user(db, email="a@b.com", password="other123", display_name="B")


def test_authenticate_ok_and_bad():
    db = _session()
    service.signup_user(db, email="a@b.com", password="pw123456", display_name="A")
    assert service.authenticate_user(db, "a@b.com", "pw123456") is not None
    assert service.authenticate_user(db, "a@b.com", "wrong") is None
    assert service.authenticate_user(db, "missing@b.com", "x") is None


def test_authenticate_google_only_user_returns_none():
    db = _session()
    service.get_or_create_google_user(db, {"sub": "g1", "email": "g@b.com", "name": "G", "picture": None})
    assert service.authenticate_user(db, "g@b.com", "anything") is None


def test_get_or_create_google_links_by_sub_then_email():
    db = _session()
    u1 = service.get_or_create_google_user(db, {"sub": "g1", "email": "g@b.com", "name": "G", "picture": None})
    u2 = service.get_or_create_google_user(db, {"sub": "g1", "email": "g@b.com", "name": "G2", "picture": None})
    assert u1.id == u2.id

    pw = service.signup_user(db, email="p@b.com", password="pw123456", display_name="P")
    linked = service.get_or_create_google_user(db, {"sub": "g2", "email": "p@b.com", "name": "P", "picture": None})
    assert linked.id == pw.id
    assert linked.google_id == "g2"
