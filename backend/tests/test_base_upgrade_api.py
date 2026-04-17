from fastapi.testclient import TestClient
from sqlalchemy import create_engine
from sqlalchemy.orm import sessionmaker
from sqlalchemy.pool import StaticPool

from app.db.base import Base
import app.models  # noqa: F401
from app.api.deps import get_db
from main import app


def _client():
    eng = create_engine(
        "sqlite:///:memory:",
        connect_args={"check_same_thread": False},
        poolclass=StaticPool,
    )
    TestingSessionLocal = sessionmaker(autocommit=False, autoflush=False, bind=eng)
    Base.metadata.create_all(bind=eng)

    def override_get_db():
        db = TestingSessionLocal()
        try:
            yield db
        finally:
            db.close()

    app.dependency_overrides[get_db] = override_get_db
    return TestClient(app), eng


def _create_campaign(client):
    return client.post("/api/campaigns", json={
        "name": "upgrade test",
        "difficulty": "realistic",
        "objectives": [],
        "seed": 42,
    }).json()


def test_upgrade_shelter_increments_count():
    client, eng = _client()
    try:
        campaign = _create_campaign(client)
        cid = campaign["id"]

        # Get first base template_id
        bases_r = client.get(f"/api/campaigns/{cid}/bases")
        assert bases_r.status_code == 200
        bases = bases_r.json()["bases"]
        assert len(bases) > 0
        base_tid = bases[0]["template_id"]
        initial_shelter = bases[0]["shelter_count"]

        r = client.post(
            f"/api/campaigns/{cid}/bases/{base_tid}/upgrade",
            json={"upgrade_type": "shelter"},
        )
        assert r.status_code == 200
        body = r.json()
        assert body["base_template_id"] == base_tid
        assert body["upgrade_type"] == "shelter"
        assert body["shelter_count"] == initial_shelter + 4
        assert body["cost_cr"] == 5000
        assert body["remaining_budget_cr"] == campaign["budget_cr"] - 5000
    finally:
        app.dependency_overrides.clear()
        Base.metadata.drop_all(bind=eng)


def test_upgrade_base_deducts_budget():
    client, eng = _client()
    try:
        campaign = _create_campaign(client)
        cid = campaign["id"]
        initial_budget = campaign["budget_cr"]

        bases = client.get(f"/api/campaigns/{cid}/bases").json()["bases"]
        base_tid = bases[0]["template_id"]

        r = client.post(
            f"/api/campaigns/{cid}/bases/{base_tid}/upgrade",
            json={"upgrade_type": "fuel_depot"},
        )
        assert r.status_code == 200
        body = r.json()
        assert body["remaining_budget_cr"] == initial_budget - 3000
    finally:
        app.dependency_overrides.clear()
        Base.metadata.drop_all(bind=eng)


def test_upgrade_nonexistent_base_returns_404():
    client, eng = _client()
    try:
        campaign = _create_campaign(client)
        cid = campaign["id"]

        r = client.post(
            f"/api/campaigns/{cid}/bases/does_not_exist/upgrade",
            json={"upgrade_type": "shelter"},
        )
        assert r.status_code == 404
    finally:
        app.dependency_overrides.clear()
        Base.metadata.drop_all(bind=eng)


def test_upgrade_nonexistent_campaign_returns_404():
    client, eng = _client()
    try:
        r = client.post(
            "/api/campaigns/99999/bases/ambala/upgrade",
            json={"upgrade_type": "shelter"},
        )
        assert r.status_code == 404
    finally:
        app.dependency_overrides.clear()
        Base.metadata.drop_all(bind=eng)


def test_upgrade_invalid_type_returns_422():
    client, eng = _client()
    try:
        campaign = _create_campaign(client)
        cid = campaign["id"]

        bases = client.get(f"/api/campaigns/{cid}/bases").json()["bases"]
        base_tid = bases[0]["template_id"]

        r = client.post(
            f"/api/campaigns/{cid}/bases/{base_tid}/upgrade",
            json={"upgrade_type": "invalid_upgrade"},
        )
        assert r.status_code == 422
    finally:
        app.dependency_overrides.clear()
        Base.metadata.drop_all(bind=eng)


def test_bases_list_includes_upgrade_fields():
    client, eng = _client()
    try:
        campaign = _create_campaign(client)
        cid = campaign["id"]

        r = client.get(f"/api/campaigns/{cid}/bases")
        assert r.status_code == 200
        bases = r.json()["bases"]
        assert len(bases) > 0
        first = bases[0]
        assert "shelter_count" in first
        assert "fuel_depot_size" in first
        assert "ad_integration_level" in first
        assert "runway_class" in first
        assert isinstance(first["shelter_count"], int)
        assert isinstance(first["fuel_depot_size"], int)
        assert isinstance(first["ad_integration_level"], int)
        assert isinstance(first["runway_class"], str)
    finally:
        app.dependency_overrides.clear()
        Base.metadata.drop_all(bind=eng)
