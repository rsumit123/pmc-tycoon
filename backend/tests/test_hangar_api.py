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


def test_hangar_returns_all_squadrons(client):
    resp = client.post("/api/campaigns", json={"name": "Test"})
    cid = resp.json()["id"]
    r = client.get(f"/api/campaigns/{cid}/hangar")
    assert r.status_code == 200
    d = r.json()
    assert "squadrons" in d
    assert len(d["squadrons"]) >= 30


def test_hangar_squadron_includes_platform_and_base(client):
    resp = client.post("/api/campaigns", json={"name": "Test"})
    cid = resp.json()["id"]
    r = client.get(f"/api/campaigns/{cid}/hangar")
    assert r.status_code == 200
    s0 = r.json()["squadrons"][0]
    assert "platform_id" in s0
    assert "platform_name" in s0
    assert "base_id" in s0
    assert "base_name" in s0
    assert "readiness_pct" in s0
    assert "strength" in s0
    assert "loadout" in s0
    assert isinstance(s0["loadout"], list)


def test_hangar_summary_counts_platforms(client):
    resp = client.post("/api/campaigns", json={"name": "Test"})
    cid = resp.json()["id"]
    r = client.get(f"/api/campaigns/{cid}/hangar")
    d = r.json()
    assert "summary_by_platform" in d
    rafale = next((e for e in d["summary_by_platform"] if e["platform_id"] == "rafale_f4"), None)
    assert rafale is not None
    assert rafale["total_airframes"] > 0
    assert rafale["squadron_count"] > 0
    assert rafale["avg_readiness_pct"] > 0
