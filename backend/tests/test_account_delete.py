import pytest
from fastapi.testclient import TestClient
from sqlalchemy import create_engine, text
from sqlalchemy.orm import sessionmaker
from sqlalchemy.pool import StaticPool

from app.db.base import Base
import app.models  # noqa: F401
from app.api.deps import get_db
from app.auth.deps import get_current_user
from main import app


@pytest.fixture
def client():
    app.dependency_overrides.pop(get_current_user, None)  # real auth
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
    yield TestClient(app), engine
    app.dependency_overrides.clear()
    Base.metadata.drop_all(bind=engine)


def _signup(c, email):
    body = c.post("/api/auth/signup", json={"email": email, "password": "pw123456"}).json()
    return {"Authorization": f"Bearer {body['access_token']}"}


def _make_campaign(c, headers):
    r = c.post("/api/campaigns", headers=headers, json={
        "name": "C", "difficulty": "realistic",
        "objectives": ["amca_operational_by_2035", "maintain_42_squadrons"]})
    assert r.status_code == 201
    return r.json()["id"]


def test_delete_me_requires_auth(client):
    c, _ = client
    assert c.delete("/api/auth/me").status_code == 401


def test_delete_me_removes_user_and_their_campaigns_only(client):
    c, engine = client
    ha = _signup(c, "a@b.com")
    hb = _signup(c, "b@b.com")
    a_cid = _make_campaign(c, ha)
    b_cid = _make_campaign(c, hb)

    assert c.delete("/api/auth/me", headers=ha).status_code == 204

    # user A gone, their campaign + dependent rows gone; user B + campaign intact
    with engine.connect() as conn:
        assert conn.execute(text("SELECT COUNT(*) FROM users WHERE email='a@b.com'")).scalar() == 0
        assert conn.execute(text("SELECT COUNT(*) FROM users WHERE email='b@b.com'")).scalar() == 1
        assert conn.execute(text("SELECT COUNT(*) FROM campaigns WHERE id=:i"), {"i": a_cid}).scalar() == 0
        assert conn.execute(text("SELECT COUNT(*) FROM campaigns WHERE id=:i"), {"i": b_cid}).scalar() == 1
        # no orphaned campaign-scoped rows left for A's campaign
        assert conn.execute(text("SELECT COUNT(*) FROM missile_stocks WHERE campaign_id=:i"), {"i": a_cid}).scalar() == 0

    # A's token no longer works (user deleted)
    assert c.get("/api/auth/me", headers=ha).status_code == 401
