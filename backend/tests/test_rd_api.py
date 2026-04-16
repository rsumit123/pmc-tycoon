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


def test_start_program_creates_active_state(client):
    c = _create_campaign(client)
    # ghatak_ucav is in MVP YAML and not pre-seeded
    r = client.post(f"/api/campaigns/{c['id']}/rd", json={
        "program_id": "ghatak_ucav", "funding_level": "standard",
    })
    assert r.status_code == 201
    body = r.json()
    assert body["program_id"] == "ghatak_ucav"
    assert body["progress_pct"] == 0
    assert body["status"] == "active"


def test_start_unknown_program_404(client):
    c = _create_campaign(client)
    r = client.post(f"/api/campaigns/{c['id']}/rd", json={
        "program_id": "starfleet_phaser", "funding_level": "standard",
    })
    assert r.status_code == 404


def test_start_already_active_program_409(client):
    c = _create_campaign(client)
    # AMCA Mk1 is pre-seeded as active
    r = client.post(f"/api/campaigns/{c['id']}/rd", json={
        "program_id": "amca_mk1", "funding_level": "standard",
    })
    assert r.status_code == 409


def test_start_with_invalid_funding_level_422(client):
    c = _create_campaign(client)
    r = client.post(f"/api/campaigns/{c['id']}/rd", json={
        "program_id": "ghatak_ucav", "funding_level": "ludicrous",
    })
    assert r.status_code == 422


def test_update_funding_level(client):
    c = _create_campaign(client)
    r = client.post(f"/api/campaigns/{c['id']}/rd/amca_mk1", json={
        "funding_level": "accelerated",
    })
    assert r.status_code == 200
    assert r.json()["funding_level"] == "accelerated"


def test_cancel_program(client):
    c = _create_campaign(client)
    r = client.post(f"/api/campaigns/{c['id']}/rd/amca_mk1", json={"status": "cancelled"})
    assert r.status_code == 200
    assert r.json()["status"] == "cancelled"


def test_update_unknown_program_404(client):
    c = _create_campaign(client)
    r = client.post(f"/api/campaigns/{c['id']}/rd/no_such_program", json={
        "funding_level": "slow",
    })
    assert r.status_code == 404
