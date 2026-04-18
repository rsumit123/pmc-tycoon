"""When acquisition_delivery fires, a Squadron row must be created/augmented."""
import pytest
from fastapi.testclient import TestClient
from sqlalchemy import create_engine
from sqlalchemy.orm import sessionmaker
from sqlalchemy.pool import StaticPool

from app.db.base import Base
import app.models  # noqa: F401
from app.api.deps import get_db
from main import app
from app.models.acquisition import AcquisitionOrder
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


def test_delivery_creates_or_augments_squadron(client):
    test_client, SessionLocal = client
    resp = test_client.post("/api/campaigns", json={"name": "Test"})
    assert resp.status_code == 201
    cid = resp.json()["id"]

    with SessionLocal() as s:
        before = s.query(Squadron).filter_by(campaign_id=cid, platform_id="tejas_mk1a").all()
        before_strength = sum(sq.strength for sq in before)

    # Tejas Mk1A order starts delivering from 2026-Q1 (we start at Q2),
    # so advancing a few turns should produce deliveries.
    for _ in range(6):
        test_client.post(f"/api/campaigns/{cid}/advance")

    with SessionLocal() as s:
        after = s.query(Squadron).filter_by(campaign_id=cid, platform_id="tejas_mk1a").all()
        after_strength = sum(sq.strength for sq in after)
        order = s.query(AcquisitionOrder).filter_by(
            campaign_id=cid, platform_id="tejas_mk1a"
        ).first()

    assert order is not None, "tejas_mk1a order should exist"
    assert order.delivered > 0, "order should have deliveries"
    assert after_strength > before_strength, "squadron strength should have grown"
