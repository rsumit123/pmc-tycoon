"""POST /api/campaigns/{id}/squadrons/{sqn_id}/rebase moves a squadron."""
import pytest
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
        "name": "rebase test",
        "difficulty": "realistic",
        "objectives": [],
        "seed": 42,
    }).json()


def test_rebase_squadron(monkeypatch):
    client, eng = _client()
    try:
        campaign = _create_campaign(client)
        cid = campaign["id"]

        # Get seeded bases to find two distinct base IDs
        bases_r = client.get(f"/api/campaigns/{cid}/bases")
        assert bases_r.status_code == 200
        bases = bases_r.json()["bases"]
        assert len(bases) >= 2, "Need at least 2 bases for rebase test"

        # Find a base with at least one squadron
        src_base = next((b for b in bases if b["squadrons"]), None)
        assert src_base is not None, "Need at least one squadron to test rebase"

        sqn_id = src_base["squadrons"][0]["id"]
        src_base_id = src_base["id"]

        # Pick a different target base
        target_base = next(b for b in bases if b["id"] != src_base_id)
        target_base_id = target_base["id"]

        r = client.post(
            f"/api/campaigns/{cid}/squadrons/{sqn_id}/rebase",
            json={"target_base_id": target_base_id},
        )
        assert r.status_code == 200
        data = r.json()
        assert data["base_id"] == target_base_id
        assert data["id"] == sqn_id
    finally:
        app.dependency_overrides.clear()
        Base.metadata.drop_all(bind=eng)


def test_rebase_to_nonexistent_base():
    client, eng = _client()
    try:
        campaign = _create_campaign(client)
        cid = campaign["id"]

        bases_r = client.get(f"/api/campaigns/{cid}/bases")
        bases = bases_r.json()["bases"]
        src_base = next((b for b in bases if b["squadrons"]), None)
        assert src_base is not None

        sqn_id = src_base["squadrons"][0]["id"]

        r = client.post(
            f"/api/campaigns/{cid}/squadrons/{sqn_id}/rebase",
            json={"target_base_id": 999999},
        )
        assert r.status_code == 404
    finally:
        app.dependency_overrides.clear()
        Base.metadata.drop_all(bind=eng)


def test_rebase_nonexistent_squadron():
    client, eng = _client()
    try:
        campaign = _create_campaign(client)
        cid = campaign["id"]

        bases_r = client.get(f"/api/campaigns/{cid}/bases")
        bases = bases_r.json()["bases"]
        target_base_id = bases[0]["id"]

        r = client.post(
            f"/api/campaigns/{cid}/squadrons/999999/rebase",
            json={"target_base_id": target_base_id},
        )
        assert r.status_code == 404
    finally:
        app.dependency_overrides.clear()
        Base.metadata.drop_all(bind=eng)
