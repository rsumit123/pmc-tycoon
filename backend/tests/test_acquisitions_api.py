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


def _create_campaign(client):
    return client.post("/api/campaigns", json={
        "name": "T", "difficulty": "realistic", "objectives": [],
    }).json()


def _payload(**overrides):
    base = {
        "platform_id": "rafale_f5",
        "quantity": 36,
        "first_delivery_year": 2030,
        "first_delivery_quarter": 4,
        "foc_year": 2034,
        "foc_quarter": 4,
        "total_cost_cr": 180000,
    }
    base.update(overrides)
    return base


def test_create_acquisition_returns_201(client):
    c = _create_campaign(client)
    r = client.post(f"/api/campaigns/{c['id']}/acquisitions", json=_payload())
    assert r.status_code == 201
    body = r.json()
    assert body["platform_id"] == "rafale_f5"
    assert body["quantity"] == 36
    assert body["delivered"] == 0
    assert body["signed_year"] == 2026  # taken from current campaign clock
    assert body["signed_quarter"] == 2


def test_create_acquisition_unknown_platform_404(client):
    c = _create_campaign(client)
    r = client.post(f"/api/campaigns/{c['id']}/acquisitions",
                    json=_payload(platform_id="hyperdrone_9000"))
    assert r.status_code == 404


def test_create_acquisition_inverted_window_400(client):
    c = _create_campaign(client)
    # FOC before first delivery
    r = client.post(f"/api/campaigns/{c['id']}/acquisitions",
                    json=_payload(first_delivery_year=2032, foc_year=2030))
    assert r.status_code == 400


def test_create_acquisition_negative_quantity_422(client):
    c = _create_campaign(client)
    r = client.post(f"/api/campaigns/{c['id']}/acquisitions", json=_payload(quantity=-1))
    assert r.status_code == 422


def test_create_acquisition_unknown_campaign_404(client):
    r = client.post("/api/campaigns/99999/acquisitions", json=_payload())
    assert r.status_code == 404


# ---------------------------------------------------------------------------
# GET /api/campaigns/{id}/acquisitions tests
# ---------------------------------------------------------------------------

from sqlalchemy import create_engine as _create_engine  # noqa: E402
from sqlalchemy.orm import sessionmaker as _sessionmaker  # noqa: E402


def _client():
    eng = _create_engine(
        "sqlite:///:memory:",
        connect_args={"check_same_thread": False},
        poolclass=StaticPool,
    )
    TestingSessionLocal = _sessionmaker(autocommit=False, autoflush=False, bind=eng)
    Base.metadata.create_all(bind=eng)

    def override_get_db():
        db = TestingSessionLocal()
        try: yield db
        finally: db.close()

    app.dependency_overrides[get_db] = override_get_db
    return TestClient(app), eng


def test_list_acquisitions_404_for_missing_campaign():
    client, eng = _client()
    try:
        r = client.get("/api/campaigns/99999/acquisitions")
        assert r.status_code == 404
    finally:
        app.dependency_overrides.clear()
        Base.metadata.drop_all(bind=eng)


def test_list_acquisitions_returns_seeded_orders():
    client, eng = _client()
    try:
        created = client.post("/api/campaigns", json={
            "name": "acq", "difficulty": "realistic", "objectives": [], "seed": 1,
        }).json()
        cid = created["id"]
        r = client.get(f"/api/campaigns/{cid}/acquisitions")
        assert r.status_code == 200
        body = r.json()
        assert "orders" in body
        assert len(body["orders"]) >= 1
        first = body["orders"][0]
        for key in ("id", "platform_id", "quantity", "signed_year",
                    "signed_quarter", "first_delivery_year",
                    "first_delivery_quarter", "foc_year", "foc_quarter",
                    "delivered", "total_cost_cr"):
            assert key in first
    finally:
        app.dependency_overrides.clear()
        Base.metadata.drop_all(bind=eng)


def test_list_acquisitions_includes_newly_created():
    client, eng = _client()
    try:
        created = client.post("/api/campaigns", json={
            "name": "acq2", "difficulty": "realistic", "objectives": [], "seed": 2,
        }).json()
        cid = created["id"]
        s = client.post(f"/api/campaigns/{cid}/acquisitions", json={
            "platform_id": "tejas_mk1a", "quantity": 16,
            "first_delivery_year": 2028, "first_delivery_quarter": 1,
            "foc_year": 2030, "foc_quarter": 4,
            "total_cost_cr": 8000,
        })
        assert s.status_code == 201
        r = client.get(f"/api/campaigns/{cid}/acquisitions")
        platform_ids = [o["platform_id"] for o in r.json()["orders"]]
        assert "tejas_mk1a" in platform_ids
    finally:
        app.dependency_overrides.clear()
        Base.metadata.drop_all(bind=eng)
