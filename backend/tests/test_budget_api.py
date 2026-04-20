import pytest
from fastapi.testclient import TestClient
from sqlalchemy import create_engine
from sqlalchemy.orm import sessionmaker
from sqlalchemy.pool import StaticPool

from app.db.base import Base
import app.models  # noqa: F401
from app.api.deps import get_db
from main import app


@pytest.fixture
def client():
    engine = create_engine(
        "sqlite:///:memory:", connect_args={"check_same_thread": False}, poolclass=StaticPool,
    )
    TestingSessionLocal = sessionmaker(autocommit=False, autoflush=False, bind=engine)
    Base.metadata.create_all(bind=engine)

    def override_get_db():
        db = TestingSessionLocal()
        try:
            yield db
        finally:
            db.close()

    app.dependency_overrides[get_db] = override_get_db
    yield TestClient(app)
    app.dependency_overrides.clear()
    Base.metadata.drop_all(bind=engine)


def _create_campaign(client):
    return client.post("/api/campaigns", json={
        "name": "T", "difficulty": "realistic", "objectives": [],
    }).json()


def test_set_budget_persists_allocation(client):
    c = _create_campaign(client)
    # Realistic difficulty 2026: treasury 45000 + grant 45000 = 90000 available
    payload = {"rd": 30000, "acquisition": 25000, "om": 15000, "spares": 10000, "infrastructure": 5000}
    r = client.post(f"/api/campaigns/{c['id']}/budget", json={"allocation": payload})
    assert r.status_code == 200
    body = r.json()
    assert body["current_allocation_json"] == payload


def test_set_budget_rejects_overspend(client):
    c = _create_campaign(client)
    # Realistic: treasury 45000 + grant 45000 = 90000; this overshoots by a lot
    payload = {"rd": 9_000_000, "acquisition": 0, "om": 0, "spares": 0, "infrastructure": 0}
    r = client.post(f"/api/campaigns/{c['id']}/budget", json={"allocation": payload})
    assert r.status_code == 400


def test_set_budget_rejects_missing_bucket(client):
    c = _create_campaign(client)
    payload = {"rd": 10000, "acquisition": 10000, "om": 10000, "spares": 10000}  # no infrastructure
    r = client.post(f"/api/campaigns/{c['id']}/budget", json={"allocation": payload})
    assert r.status_code == 400


def test_set_budget_rejects_negative(client):
    c = _create_campaign(client)
    payload = {"rd": -1, "acquisition": 0, "om": 0, "spares": 0, "infrastructure": 0}
    r = client.post(f"/api/campaigns/{c['id']}/budget", json={"allocation": payload})
    assert r.status_code == 400


def test_set_budget_404_for_unknown_campaign(client):
    r = client.post("/api/campaigns/99999/budget", json={"allocation": {
        "rd": 0, "acquisition": 0, "om": 0, "spares": 0, "infrastructure": 0,
    }})
    assert r.status_code == 404


def test_advance_after_set_budget_uses_new_allocation(client):
    c = _create_campaign(client)
    # Realistic 2026: treasury 45000 + grant 45000 = 90000. Allocate all to R&D.
    payload = {"rd": 90000, "acquisition": 0, "om": 0, "spares": 0, "infrastructure": 0}
    client.post(f"/api/campaigns/{c['id']}/budget", json={"allocation": payload})
    advanced = client.post(f"/api/campaigns/{c['id']}/advance").json()
    # Treasury after = 45000 + 45000 - 90000 = 0
    assert advanced["budget_cr"] == 0
