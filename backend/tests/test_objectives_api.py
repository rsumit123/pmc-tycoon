"""Test GET /api/content/objectives endpoint."""
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


def test_list_objectives_returns_all():
    client, eng = _client()
    try:
        r = client.get("/api/content/objectives")
        assert r.status_code == 200
        data = r.json()
        assert "objectives" in data
        assert len(data["objectives"]) >= 12
    finally:
        app.dependency_overrides.clear()
        Base.metadata.drop_all(bind=eng)


def test_objective_has_required_fields():
    client, eng = _client()
    try:
        r = client.get("/api/content/objectives")
        assert r.status_code == 200
        objs = r.json()["objectives"]
        assert len(objs) > 0
        obj = objs[0]
        assert "id" in obj
        assert "title" in obj
        assert "description" in obj
        assert "weight" in obj
        assert "target_year" in obj
    finally:
        app.dependency_overrides.clear()
        Base.metadata.drop_all(bind=eng)
