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


def test_list_platforms_returns_yaml_registry():
    client, eng = _client()
    try:
        r = client.get("/api/content/platforms")
        assert r.status_code == 200
        body = r.json()
        assert "platforms" in body
        assert len(body["platforms"]) > 0
        first = body["platforms"][0]
        for key in ("id", "name", "origin", "role", "generation",
                    "combat_radius_km", "payload_kg", "rcs_band",
                    "radar_range_km", "cost_cr", "intro_year"):
            assert key in first, f"missing {key} in {first}"
    finally:
        app.dependency_overrides.clear()
        Base.metadata.drop_all(bind=eng)


def test_list_platforms_includes_rafale_f4():
    client, eng = _client()
    try:
        r = client.get("/api/content/platforms")
        ids = {p["id"] for p in r.json()["platforms"]}
        assert "rafale_f4" in ids
    finally:
        app.dependency_overrides.clear()
        Base.metadata.drop_all(bind=eng)
