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


def test_create_campaign_returns_201(client):
    response = client.post("/api/campaigns", json={
        "name": "Singh-era modernization",
        "difficulty": "realistic",
        "objectives": ["amca_operational_by_2035", "maintain_42_squadrons"],
    })
    assert response.status_code == 201
    body = response.json()
    assert body["name"] == "Singh-era modernization"
    assert body["current_year"] == 2026
    assert body["current_quarter"] == 2
    assert body["budget_cr"] > 0
    assert "id" in body


def test_get_campaign_returns_same_state(client):
    created = client.post("/api/campaigns", json={
        "name": "Test",
        "difficulty": "realistic",
        "objectives": [],
    }).json()
    got = client.get(f"/api/campaigns/{created['id']}").json()
    assert got["id"] == created["id"]
    assert got["current_year"] == 2026


def test_get_campaign_not_found(client):
    response = client.get("/api/campaigns/99999")
    assert response.status_code == 404


def test_create_campaign_rejects_invalid_difficulty(client):
    response = client.post("/api/campaigns", json={
        "name": "Bad",
        "difficulty": "ultra_god_mode",
        "objectives": [],
    })
    assert response.status_code == 422
