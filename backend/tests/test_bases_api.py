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
        try: yield db
        finally: db.close()

    app.dependency_overrides[get_db] = override_get_db
    return TestClient(app), eng


def test_list_bases_404_for_missing_campaign():
    client, eng = _client()
    try:
        r = client.get("/api/campaigns/99999/bases")
        assert r.status_code == 404
    finally:
        app.dependency_overrides.clear()
        Base.metadata.drop_all(bind=eng)


def test_list_bases_returns_seeded_airbases_with_squadrons():
    client, eng = _client()
    try:
        created = client.post("/api/campaigns", json={
            "name": "b", "difficulty": "realistic", "objectives": [], "seed": 7,
        }).json()
        cid = created["id"]
        r = client.get(f"/api/campaigns/{cid}/bases")
        assert r.status_code == 200
        body = r.json()
        assert "bases" in body
        assert len(body["bases"]) > 0
        first = body["bases"][0]
        assert "id" in first
        assert "template_id" in first
        assert "name" in first
        assert isinstance(first["lat"], float)
        assert isinstance(first["lon"], float)
        assert "squadrons" in first
        total_squadrons = sum(len(b["squadrons"]) for b in body["bases"])
        assert total_squadrons >= 1
        if total_squadrons > 0:
            for b in body["bases"]:
                if b["squadrons"]:
                    sq = b["squadrons"][0]
                    for key in ("id", "name", "call_sign", "platform_id",
                                "strength", "readiness_pct", "xp", "ace_name"):
                        assert key in sq
    finally:
        app.dependency_overrides.clear()
        Base.metadata.drop_all(bind=eng)
