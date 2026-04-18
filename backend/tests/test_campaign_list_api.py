"""Test GET /api/campaigns list endpoint."""
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


def test_list_campaigns_empty(client):
    """GET /api/campaigns returns empty list when no campaigns exist."""
    resp = client.get("/api/campaigns")
    assert resp.status_code == 200
    data = resp.json()
    assert data["campaigns"] == []


def test_list_campaigns_returns_created(client):
    """GET /api/campaigns returns all created campaigns."""
    client.post("/api/campaigns", json={"name": "Test Alpha"})
    client.post("/api/campaigns", json={"name": "Test Bravo"})
    resp = client.get("/api/campaigns")
    assert resp.status_code == 200
    campaigns = resp.json()["campaigns"]
    assert len(campaigns) == 2
    names = {c["name"] for c in campaigns}
    assert "Test Alpha" in names
    assert "Test Bravo" in names


def test_list_campaigns_ordered_by_updated_at(client):
    """GET /api/campaigns returns campaigns ordered by updated_at descending."""
    client.post("/api/campaigns", json={"name": "Older"})
    client.post("/api/campaigns", json={"name": "Newer"})
    resp = client.get("/api/campaigns")
    campaigns = resp.json()["campaigns"]
    assert campaigns[0]["name"] == "Newer"
    assert campaigns[1]["name"] == "Older"


def test_list_campaigns_has_required_fields(client):
    """GET /api/campaigns returns campaigns with all required fields."""
    client.post("/api/campaigns", json={"name": "Full Test"})
    resp = client.get("/api/campaigns")
    campaigns = resp.json()["campaigns"]
    campaign = campaigns[0]
    assert "id" in campaign
    assert "name" in campaign
    assert "current_year" in campaign
    assert "current_quarter" in campaign
    assert "difficulty" in campaign
    assert "budget_cr" in campaign
    assert "reputation" in campaign
    assert "created_at" in campaign
    assert "updated_at" in campaign
