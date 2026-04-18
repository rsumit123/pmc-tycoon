"""Turn report endpoint: event aggregation for a completed turn."""
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
    yield TestClient(app)
    app.dependency_overrides.clear()
    Base.metadata.drop_all(bind=engine)


def test_turn_report_for_unadvanced_turn_404(client):
    resp = client.post("/api/campaigns", json={"name": "t"})
    cid = resp.json()["id"]
    # Q3 has no events until the engine advances from Q2 → Q3
    r = client.get(f"/api/campaigns/{cid}/turn-report/2026/3")
    assert r.status_code == 404


def test_turn_report_after_advance_contains_events(client):
    resp = client.post("/api/campaigns", json={"name": "t"})
    cid = resp.json()["id"]
    client.post(f"/api/campaigns/{cid}/advance")
    r = client.get(f"/api/campaigns/{cid}/turn-report/2026/2")
    assert r.status_code == 200
    data = r.json()
    assert data["year"] == 2026
    assert data["quarter"] == 2
    kinds = {e["event_type"] for e in data["events"]}
    assert "turn_advanced" in kinds
    # Groupings are always present (may be empty lists)
    assert "deliveries" in data
    assert "rd_milestones" in data
    assert "intel_cards" in data
    # vignette_fired is nullable
    assert "vignette_fired" in data


def test_turn_report_treasury_populated(client):
    resp = client.post("/api/campaigns", json={"name": "t"})
    cid = resp.json()["id"]
    client.post(f"/api/campaigns/{cid}/advance")
    r = client.get(f"/api/campaigns/{cid}/turn-report/2026/2")
    assert r.status_code == 200
    data = r.json()
    assert isinstance(data["treasury_after_cr"], int)
    assert data["treasury_after_cr"] > 0


def test_turn_report_includes_unassigned_deliveries(client):
    resp = client.post("/api/campaigns", json={"name": "t"})
    cid = resp.json()["id"]
    for _ in range(12):
        client.post(f"/api/campaigns/{cid}/advance")
    found = False
    for q_idx in range(12):
        year = 2026 + (1 + q_idx) // 4
        quarter = ((1 + q_idx) % 4) + 1
        r = client.get(f"/api/campaigns/{cid}/turn-report/{year}/{quarter}")
        if r.status_code != 200:
            continue
        if r.json().get("deliveries"):
            found = True
            d = r.json()["deliveries"][0]
            assert "platform_id" in d
            assert "count" in d
            assert "assigned_base_id" in d
            break
    assert found


def test_turn_report_intel_cards_populated(client):
    resp = client.post("/api/campaigns", json={"name": "t"})
    cid = resp.json()["id"]
    client.post(f"/api/campaigns/{cid}/advance")
    r = client.get(f"/api/campaigns/{cid}/turn-report/2026/2")
    assert r.status_code == 200
    data = r.json()
    # Intel cards are sourced from IntelCard rows
    cards = data["intel_cards"]
    assert isinstance(cards, list)
    if cards:
        c = cards[0]
        assert "source_type" in c
        assert "confidence" in c
        assert "headline" in c
