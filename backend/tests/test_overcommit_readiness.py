"""Committing to a vignette should reduce readiness of committed squadrons.

Base cost: 5% per committed squadron. Overcommit (>2x adversary) adds penalty.
"""
import pytest
from fastapi.testclient import TestClient
from sqlalchemy import create_engine
from sqlalchemy.orm import Session, sessionmaker
from sqlalchemy.pool import StaticPool

from app.db.base import Base
import app.models  # noqa: F401 — ensures all mapped models are registered before create_all
from app.api.deps import get_db
from main import app
from app.models.squadron import Squadron


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
    yield TestClient(app), TestingSessionLocal
    app.dependency_overrides.clear()
    Base.metadata.drop_all(bind=engine)


def _find_pending_vignette(client, cid: int):
    """Advance turns until a vignette is pending, return (vignette_id, planning_state).

    Returns (None, None) if no vignette fires after 20 turns (unlikely with baseline seed).
    """
    for _ in range(20):
        client.post(f"/api/campaigns/{cid}/advance")
        r = client.get(f"/api/campaigns/{cid}/vignettes/pending")
        if r.status_code == 200 and r.json().get("vignettes"):
            vid = r.json()["vignettes"][0]["id"]
            details = client.get(f"/api/campaigns/{cid}/vignettes/{vid}").json()
            return vid, details
    return None, None


def test_commit_reduces_committed_squadron_readiness(client):
    http_client, SessionLocal = client
    resp = http_client.post("/api/campaigns", json={"name": "Test"})
    cid = resp.json()["id"]

    vid, details = _find_pending_vignette(http_client, cid)
    if vid is None:
        pytest.skip("No vignette fired — seed-dependent")

    ps = details["planning_state"]
    eligible = [s for s in ps.get("eligible_squadrons", []) if s["in_range"] and s["airframes_available"] > 0]
    if not eligible:
        pytest.skip("No eligible squadrons for this vignette")

    sq_id = eligible[0]["squadron_id"]

    # Capture readiness before commit
    with SessionLocal() as s:
        sq_before = s.get(Squadron, sq_id)
        readiness_before = sq_before.readiness_pct

    commit_payload = {
        "squadrons": [{"squadron_id": sq_id, "airframes": eligible[0]["airframes_available"]}],
        "support": {"awacs": False, "tanker": False, "sead_package": False},
        "roe": ps["roe_options"][0],
    }
    r = http_client.post(f"/api/campaigns/{cid}/vignettes/{vid}/commit", json=commit_payload)
    assert r.status_code == 200, r.text

    with SessionLocal() as s:
        sq_after = s.get(Squadron, sq_id)
        readiness_after = sq_after.readiness_pct

    assert readiness_after < readiness_before, (
        f"Committed squadron should lose readiness. "
        f"Before: {readiness_before}, After: {readiness_after}"
    )
    assert readiness_before - readiness_after <= 30, "Cost should be capped at 30%"


def test_readiness_cost_floor_at_zero(client):
    """Committed squadron's readiness can't go negative."""
    http_client, SessionLocal = client
    resp = http_client.post("/api/campaigns", json={"name": "Test"})
    cid = resp.json()["id"]

    vid, details = _find_pending_vignette(http_client, cid)
    if vid is None:
        pytest.skip("No vignette fired")

    ps = details["planning_state"]
    eligible = [s for s in ps.get("eligible_squadrons", []) if s["in_range"] and s["airframes_available"] > 0]
    if not eligible:
        pytest.skip("No eligible squadrons")
    sq_id = eligible[0]["squadron_id"]

    # Manually set readiness near zero to test floor
    with SessionLocal() as s:
        sq = s.get(Squadron, sq_id)
        sq.readiness_pct = 3
        s.commit()

    commit_payload = {
        "squadrons": [{"squadron_id": sq_id, "airframes": 1}],
        "support": {"awacs": False, "tanker": False, "sead_package": False},
        "roe": ps["roe_options"][0],
    }
    http_client.post(f"/api/campaigns/{cid}/vignettes/{vid}/commit", json=commit_payload)

    with SessionLocal() as s:
        sq_after = s.get(Squadron, sq_id)
        assert sq_after.readiness_pct >= 0
