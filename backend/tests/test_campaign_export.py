"""Tests for campaign export/import round-trip."""
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


def test_export_campaign_returns_correct_structure(client):
    """Export of a newly seeded campaign has expected bases, squadrons, and seed."""
    created = client.post(
        "/api/campaigns",
        json={"name": "Export Test", "difficulty": "realistic", "objectives": []},
    )
    assert created.status_code == 201
    campaign_id = created.json()["id"]
    seed = created.json()["seed"]

    resp = client.get(f"/api/campaigns/{campaign_id}/export")
    assert resp.status_code == 200
    data = resp.json()

    assert data["name"] == "Export Test"
    assert data["seed"] == seed
    assert data["difficulty"] == "realistic"
    assert len(data["bases"]) == 15
    assert len(data["squadrons"]) == 31


def test_export_missing_campaign_returns_404(client):
    resp = client.get("/api/campaigns/99999/export")
    assert resp.status_code == 404


def test_import_campaign_creates_new_campaign(client):
    """Round-trip: create → export → import → verify new id with same seed."""
    created = client.post(
        "/api/campaigns",
        json={"name": "Round Trip", "difficulty": "realistic", "objectives": []},
    )
    assert created.status_code == 201
    campaign_id = created.json()["id"]
    seed = created.json()["seed"]

    export_resp = client.get(f"/api/campaigns/{campaign_id}/export")
    assert export_resp.status_code == 200
    export_data = export_resp.json()

    import_resp = client.post("/api/campaigns/import", json=export_data)
    assert import_resp.status_code == 201
    new_id = import_resp.json()["id"]

    assert new_id != campaign_id

    # The imported campaign should be fetchable
    get_resp = client.get(f"/api/campaigns/{new_id}")
    assert get_resp.status_code == 200
    imported = get_resp.json()

    assert imported["seed"] == seed
    assert imported["name"] == "Round Trip (imported)"
    assert imported["difficulty"] == "realistic"


def test_import_preserves_bases_and_squadrons(client):
    """Imported campaign has same number of bases and squadrons as the original."""
    created = client.post(
        "/api/campaigns",
        json={"name": "Preserve Test", "difficulty": "realistic", "objectives": []},
    )
    campaign_id = created.json()["id"]

    export_data = client.get(f"/api/campaigns/{campaign_id}/export").json()
    import_resp = client.post("/api/campaigns/import", json=export_data)
    new_id = import_resp.json()["id"]

    bases_resp = client.get(f"/api/campaigns/{new_id}/bases")
    assert bases_resp.status_code == 200
    bases = bases_resp.json()["bases"]
    assert len(bases) == 15

    # Check squadrons via bases (each base has squadrons nested)
    total_squads = sum(len(b.get("squadrons", [])) for b in bases)
    assert total_squads == 31
