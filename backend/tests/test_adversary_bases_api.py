"""Tests for GET /api/campaigns/{id}/adversary-bases."""
import pytest
from fastapi.testclient import TestClient
from sqlalchemy import create_engine
from sqlalchemy.orm import sessionmaker
from sqlalchemy.pool import StaticPool

from app.api.deps import get_db
from app.db.base import Base
from app.models.campaign_base import CampaignBase
from app.models.squadron import Squadron
from main import app


@pytest.fixture
def client_with_session():
    engine = create_engine(
        "sqlite:///:memory:",
        connect_args={"check_same_thread": False},
        poolclass=StaticPool,
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
    yield TestClient(app), TestingSessionLocal
    app.dependency_overrides.clear()
    Base.metadata.drop_all(bind=engine)


def _make_campaign(client) -> int:
    r = client.post("/api/campaigns", json={
        "name": "adv-base-test",
        "difficulty": "realistic",
        "objectives": ["defend_punjab"],
    })
    assert r.status_code in (200, 201)
    return r.json()["id"]


def test_covered_only_empty_without_drones(client_with_session):
    client, _ = client_with_session
    cid = _make_campaign(client)
    r = client.get(f"/api/campaigns/{cid}/adversary-bases?covered_only=true")
    assert r.status_code == 200
    assert r.json()["bases"] == []


def test_covered_only_false_lists_all_seeded_bases(client_with_session):
    client, _ = client_with_session
    cid = _make_campaign(client)
    r = client.get(f"/api/campaigns/{cid}/adversary-bases?covered_only=false")
    assert r.status_code == 200
    body = r.json()["bases"]
    assert len(body) >= 10
    assert {b["faction"] for b in body} == {"PAF", "PLAAF", "PLAN"}
    # Every row carries lat/lon for the map.
    for b in body:
        assert -90 <= b["lat"] <= 90
        assert -180 <= b["lon"] <= 180
        assert b["is_covered"] is False
        assert b["latest_sighting"] is None


def test_mq9b_drone_covers_at_least_one_base_with_sighting(client_with_session):
    client, SessionLocal = client_with_session
    cid = _make_campaign(client)
    db = SessionLocal()
    base_row = (
        db.query(CampaignBase).filter(CampaignBase.campaign_id == cid).first()
    )
    db.add(Squadron(
        campaign_id=cid,
        base_id=base_row.id,
        platform_id="mq9b_seaguardian",
        name="22 Squadron",
        call_sign="Guardian-1",
        strength=4,
        readiness_pct=80,
        xp=0,
    ))
    db.commit()
    db.close()

    # Advance one turn so drone_recon cards get written.
    r_adv = client.post(f"/api/campaigns/{cid}/advance")
    assert r_adv.status_code == 200

    r = client.get(f"/api/campaigns/{cid}/adversary-bases?covered_only=true")
    assert r.status_code == 200
    body = r.json()["bases"]
    assert len(body) >= 1
    covered = next((b for b in body if b["is_covered"]), None)
    assert covered is not None
    assert covered["latest_sighting"] is not None
    assert covered["latest_sighting"]["tier"] == "high"  # MQ-9B → high fidelity
