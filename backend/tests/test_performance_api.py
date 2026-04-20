import pytest
from fastapi.testclient import TestClient
from sqlalchemy import create_engine
from sqlalchemy.orm import sessionmaker
from sqlalchemy.pool import StaticPool

from app.api.deps import get_db
from app.db.base import Base
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


def test_performance_404_when_campaign_missing(client_with_session):
    client, _ = client_with_session
    r = client.get("/api/campaigns/999/performance")
    assert r.status_code == 404


def test_performance_returns_empty_bundle_for_new_campaign(client_with_session):
    client, SessionLocal = client_with_session
    # Create a minimal campaign via the existing campaigns endpoint
    resp = client.post("/api/campaigns", json={
        "name": "T",
        "difficulty": "realistic",
        "selected_objective_ids": ["modernize_fleet"],
    })
    assert resp.status_code == 201, resp.text
    cid = resp.json()["id"]

    r = client.get(f"/api/campaigns/{cid}/performance")
    assert r.status_code == 200
    body = r.json()
    assert body["totals"]["total_sorties"] == 0
    assert [f["faction"] for f in body["factions"]] == ["PLAAF", "PAF", "PLAN"]
    assert [s["asset"] for s in body["support"]] == ["awacs", "tanker", "sead"]
    assert body["platforms"] == []
    assert body["weapons"] == []
