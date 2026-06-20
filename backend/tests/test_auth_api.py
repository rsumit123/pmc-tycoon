import pytest
from fastapi.testclient import TestClient
from sqlalchemy import create_engine
from sqlalchemy.orm import sessionmaker
from sqlalchemy.pool import StaticPool

from app.db.base import Base
import app.models  # noqa: F401
from app.api.deps import get_db
from app.auth import security
from main import app


@pytest.fixture(autouse=True)
def _no_auth_override():
    # This file tests real auth; ensure no suite-wide get_current_user override leaks in.
    from app.auth.deps import get_current_user as _gcu
    app.dependency_overrides.pop(_gcu, None)
    yield


@pytest.fixture
def client():
    engine = create_engine("sqlite:///:memory:", connect_args={"check_same_thread": False}, poolclass=StaticPool)
    SessionLocal = sessionmaker(bind=engine)
    Base.metadata.create_all(bind=engine)

    def override_db():
        s = SessionLocal()
        try:
            yield s
        finally:
            s.close()

    app.dependency_overrides[get_db] = override_db
    yield TestClient(app)
    app.dependency_overrides.clear()
    Base.metadata.drop_all(bind=engine)


def test_signup_then_me(client):
    r = client.post("/api/auth/signup", json={"email": "a@b.com", "password": "pw123456", "display_name": "A"})
    assert r.status_code == 201
    body = r.json()
    assert body["token_type"] == "bearer"
    assert body["user"]["email"] == "a@b.com"
    h = {"Authorization": f"Bearer {body['access_token']}"}
    me = client.get("/api/auth/me", headers=h)
    assert me.status_code == 200
    assert me.json()["email"] == "a@b.com"


def test_signup_duplicate_409(client):
    client.post("/api/auth/signup", json={"email": "a@b.com", "password": "pw123456"})
    r = client.post("/api/auth/signup", json={"email": "a@b.com", "password": "pw999999"})
    assert r.status_code == 409


def test_login_ok_and_bad(client):
    client.post("/api/auth/signup", json={"email": "a@b.com", "password": "pw123456"})
    assert client.post("/api/auth/login", json={"email": "a@b.com", "password": "pw123456"}).status_code == 200
    assert client.post("/api/auth/login", json={"email": "a@b.com", "password": "wrong"}).status_code == 401


def test_refresh_flow(client):
    s = client.post("/api/auth/signup", json={"email": "a@b.com", "password": "pw123456"}).json()
    r = client.post("/api/auth/refresh", json={"refresh_token": s["refresh_token"]})
    assert r.status_code == 200
    assert r.json()["access_token"]
    assert client.post("/api/auth/refresh", json={"refresh_token": s["access_token"]}).status_code == 401


def test_google_login(client, monkeypatch):
    monkeypatch.setattr(
        security, "_google_verify",
        lambda token, request, audience: {"sub": "g1", "email": "g@b.com", "name": "G", "picture": None},
    )
    r = client.post("/api/auth/google", json={"id_token": "dummy"})
    assert r.status_code == 200
    assert r.json()["user"]["email"] == "g@b.com"
