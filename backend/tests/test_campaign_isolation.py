import pytest
from fastapi.testclient import TestClient
from sqlalchemy import create_engine
from sqlalchemy.orm import sessionmaker
from sqlalchemy.pool import StaticPool

from app.db.base import Base
import app.models  # noqa: F401
from app.api.deps import get_db
from app.auth.deps import get_current_user
from main import app


@pytest.fixture
def client():
    # This file exercises REAL auth -- disable the suite-wide dummy override.
    app.dependency_overrides.pop(get_current_user, None)
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


def _signup(client, email):
    body = client.post("/api/auth/signup", json={"email": email, "password": "pw123456"}).json()
    return {"Authorization": f"Bearer {body['access_token']}"}


def _create_campaign(client, headers):
    r = client.post("/api/campaigns", headers=headers, json={
        "name": "C", "difficulty": "realistic",
        "objectives": ["amca_operational_by_2035", "maintain_42_squadrons"],
    })
    assert r.status_code == 201
    return r.json()["id"]


def test_unauthenticated_create_401(client):
    r = client.post("/api/campaigns", json={"name": "X", "difficulty": "realistic", "objectives": []})
    assert r.status_code == 401


def test_list_is_scoped_to_owner(client):
    ha = _signup(client, "a@b.com")
    hb = _signup(client, "b@b.com")
    _create_campaign(client, ha)
    a_list = client.get("/api/campaigns", headers=ha).json()["campaigns"]
    b_list = client.get("/api/campaigns", headers=hb).json()["campaigns"]
    assert len(a_list) == 1
    assert len(b_list) == 0


def test_cannot_read_or_advance_or_delete_others_campaign(client):
    ha = _signup(client, "a@b.com")
    hb = _signup(client, "b@b.com")
    cid = _create_campaign(client, ha)
    assert client.get(f"/api/campaigns/{cid}", headers=hb).status_code == 404
    assert client.post(f"/api/campaigns/{cid}/advance", headers=hb).status_code == 404
    assert client.delete(f"/api/campaigns/{cid}", headers=hb).status_code == 404
    assert client.get(f"/api/campaigns/{cid}", headers=ha).status_code == 200
