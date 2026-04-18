"""Confirm starting state seeds AWACS + tanker squadrons at real-world bases."""
import pytest
from fastapi.testclient import TestClient
from sqlalchemy import create_engine
from sqlalchemy.orm import sessionmaker
from sqlalchemy.pool import StaticPool

from app.db.base import Base
import app.models  # noqa: F401
from app.api.deps import get_db
from app.models.squadron import Squadron
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
    yield TestClient(app), TestingSessionLocal
    app.dependency_overrides.clear()
    Base.metadata.drop_all(bind=engine)


def test_campaign_seeds_netra_squadrons(client):
    test_client, SessionLocal = client
    resp = test_client.post("/api/campaigns", json={"name": "Test"})
    assert resp.status_code == 201
    cid = resp.json()["id"]

    with SessionLocal() as s:
        netra = s.query(Squadron).filter_by(campaign_id=cid, platform_id="netra_aewc").all()
    assert len(netra) >= 2, f"expected >=2 Netra AWACS squadrons, got {len(netra)}"


def test_netra_squadrons_have_nonzero_readiness(client):
    test_client, SessionLocal = client
    resp = test_client.post("/api/campaigns", json={"name": "Test"})
    assert resp.status_code == 201
    cid = resp.json()["id"]

    with SessionLocal() as s:
        netra = s.query(Squadron).filter_by(campaign_id=cid, platform_id="netra_aewc").all()
    for sq in netra:
        assert sq.readiness_pct > 0
        assert sq.strength > 0


def test_campaign_seeds_il78_tanker_squadron(client):
    test_client, SessionLocal = client
    resp = test_client.post("/api/campaigns", json={"name": "Test"})
    assert resp.status_code == 201
    cid = resp.json()["id"]

    with SessionLocal() as s:
        tankers = s.query(Squadron).filter_by(campaign_id=cid, platform_id="il78_tanker").all()
    assert len(tankers) >= 1, f"expected >=1 tanker squadron, got {len(tankers)}"
