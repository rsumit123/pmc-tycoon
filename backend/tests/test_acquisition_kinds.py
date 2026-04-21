"""Plan 18 — AcquisitionOrder.kind + three new kinds."""
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
        "sqlite:///:memory:",
        connect_args={"check_same_thread": False},
        poolclass=StaticPool,
    )
    TestingSessionLocal = sessionmaker(bind=engine)
    Base.metadata.create_all(bind=engine)

    def override_get_db():
        db = TestingSessionLocal()
        try:
            yield db
        finally:
            db.close()

    app.dependency_overrides[get_db] = override_get_db
    client = TestClient(app)
    client._engine = engine  # expose for tests that need a session
    yield client
    app.dependency_overrides.clear()
    Base.metadata.drop_all(bind=engine)


def _create_campaign(client):
    r = client.post("/api/campaigns", json={
        "name": "T", "difficulty": "realistic", "objectives": [],
    })
    assert r.status_code == 201, r.text
    return r.json()


def _base_payload(**overrides):
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


def test_platform_acquisition_still_defaults_to_platform_kind(client):
    """Backward compat: no kind supplied => kind=platform persisted."""
    c = _create_campaign(client)
    r = client.post(f"/api/campaigns/{c['id']}/acquisitions", json=_base_payload())
    assert r.status_code == 201, r.text
    body = r.json()
    assert body["kind"] == "platform"
    assert body["target_battery_id"] is None


def test_missile_batch_kind_accepted_with_weapon_id(client):
    c = _create_campaign(client)
    payload = _base_payload(
        platform_id="meteor", quantity=100,
        total_cost_cr=1800,
        kind="missile_batch",
    )
    r = client.post(f"/api/campaigns/{c['id']}/acquisitions", json=payload)
    assert r.status_code == 201, r.text
    body = r.json()
    assert body["kind"] == "missile_batch"
    assert body["platform_id"] == "meteor"


def test_missile_batch_rejects_unknown_weapon(client):
    c = _create_campaign(client)
    payload = _base_payload(
        platform_id="imaginary_missile", quantity=100,
        total_cost_cr=1800, kind="missile_batch",
    )
    r = client.post(f"/api/campaigns/{c['id']}/acquisitions", json=payload)
    assert r.status_code == 400


def test_ad_battery_kind_accepted_with_system_id(client):
    c = _create_campaign(client)
    payload = _base_payload(
        platform_id="s400", quantity=1,
        total_cost_cr=8272,  # 8000 + 16 * 17
        kind="ad_battery",
        preferred_base_id=1,
        first_delivery_year=2028,
        foc_year=2028,
    )
    r = client.post(f"/api/campaigns/{c['id']}/acquisitions", json=payload)
    assert r.status_code == 201, r.text
    body = r.json()
    assert body["kind"] == "ad_battery"


def test_ad_reload_requires_target_battery_id(client):
    c = _create_campaign(client)
    payload = _base_payload(
        platform_id="s400", quantity=16,
        total_cost_cr=272,  # 16 * 17
        kind="ad_reload",
        first_delivery_year=2026,
        first_delivery_quarter=3,
        foc_year=2026, foc_quarter=4,
        # target_battery_id missing on purpose
    )
    r = client.post(f"/api/campaigns/{c['id']}/acquisitions", json=payload)
    assert r.status_code == 400
    assert "target_battery_id" in r.text


def test_ad_reload_rejects_bad_battery_id(client):
    c = _create_campaign(client)
    payload = _base_payload(
        platform_id="s400", quantity=16,
        total_cost_cr=272,
        kind="ad_reload",
        target_battery_id=999999,
        first_delivery_year=2026,
        first_delivery_quarter=3,
        foc_year=2026, foc_quarter=4,
    )
    r = client.post(f"/api/campaigns/{c['id']}/acquisitions", json=payload)
    assert r.status_code == 400


def test_ad_reload_accepts_real_battery(client):
    """Use the seeded S-400 battery id, pass ad_reload, expect 201."""
    from sqlalchemy.orm import Session
    from app.models.ad_battery import ADBattery
    c = _create_campaign(client)
    with Session(client._engine) as s:
        batt = s.query(ADBattery).filter_by(
            campaign_id=c["id"], system_id="s400",
        ).first()
        assert batt is not None, "seed should include an S-400 battery"
        bid = batt.id

    payload = _base_payload(
        platform_id="s400", quantity=16,
        total_cost_cr=272,
        kind="ad_reload",
        target_battery_id=bid,
        first_delivery_year=2026,
        first_delivery_quarter=3,
        foc_year=2026, foc_quarter=4,
    )
    r = client.post(f"/api/campaigns/{c['id']}/acquisitions", json=payload)
    assert r.status_code == 201, r.text
    body = r.json()
    assert body["kind"] == "ad_reload"
    assert body["target_battery_id"] == bid


# ── Delivery dispatch e2e tests ────────────────────────────────────────────

def _advance_turns(client, campaign_id: int, n: int) -> None:
    for _ in range(n):
        r = client.post(f"/api/campaigns/{campaign_id}/advance")
        assert r.status_code == 200, r.text


def test_missile_batch_delivery_adds_to_stock(client):
    """Order 100 Meteor at a specific base, advance past FOC, verify stock grew."""
    from sqlalchemy.orm import Session
    from app.models.campaign_base import CampaignBase
    from app.models.missile_stock import MissileStock
    c = _create_campaign(client)

    with Session(client._engine) as s:
        base = s.query(CampaignBase).filter_by(
            campaign_id=c["id"], template_id="ambala",
        ).first()
        assert base is not None
        base_id = base.id
        existing_stock = s.query(MissileStock).filter_by(
            campaign_id=c["id"], base_id=base_id, weapon_id="meteor",
        ).first()
        start_stock = existing_stock.stock if existing_stock else 0

    # Order 100 Meteor, all delivered in 1 quarter for test simplicity.
    payload = _base_payload(
        platform_id="meteor", quantity=100,
        total_cost_cr=1800,
        kind="missile_batch",
        preferred_base_id=base_id,
        first_delivery_year=2026, first_delivery_quarter=3,
        foc_year=2026, foc_quarter=3,
    )
    r = client.post(f"/api/campaigns/{c['id']}/acquisitions", json=payload)
    assert r.status_code == 201, r.text

    # Advance one turn (2026-Q2 -> 2026-Q3 — FOC quarter).
    _advance_turns(client, c["id"], 2)

    with Session(client._engine) as s:
        row = s.query(MissileStock).filter_by(
            campaign_id=c["id"], base_id=base_id, weapon_id="meteor",
        ).first()
        assert row is not None
        assert row.stock >= start_stock + 100


def test_ad_battery_delivery_creates_battery(client):
    """ad_battery order delivered at FOC creates new ADBattery row at preferred base."""
    from sqlalchemy.orm import Session
    from app.models.campaign_base import CampaignBase
    from app.models.ad_battery import ADBattery
    c = _create_campaign(client)

    with Session(client._engine) as s:
        # Find a base that does NOT already have MR-SAM.
        bases = s.query(CampaignBase).filter_by(campaign_id=c["id"]).all()
        target = None
        for b in bases:
            if not s.query(ADBattery).filter_by(
                campaign_id=c["id"], base_id=b.id, system_id="mrsam_air",
            ).first():
                target = b
                break
        assert target is not None
        target_id = target.id

    payload = _base_payload(
        platform_id="mrsam_air", quantity=1,
        total_cost_cr=5000 + 24 * 5,
        kind="ad_battery",
        preferred_base_id=target_id,
        first_delivery_year=2026, first_delivery_quarter=3,
        foc_year=2026, foc_quarter=3,
    )
    r = client.post(f"/api/campaigns/{c['id']}/acquisitions", json=payload)
    assert r.status_code == 201, r.text

    _advance_turns(client, c["id"], 2)

    with Session(client._engine) as s:
        batt = s.query(ADBattery).filter_by(
            campaign_id=c["id"], base_id=target_id, system_id="mrsam_air",
        ).first()
        assert batt is not None
        assert batt.interceptor_stock == 24  # AD_STARTING_INTERCEPTORS[mrsam_air]


def test_ad_reload_delivery_adds_to_specific_battery(client):
    """ad_reload delivery adds quantity to target_battery_id's stock."""
    from sqlalchemy.orm import Session
    from app.models.ad_battery import ADBattery
    c = _create_campaign(client)

    with Session(client._engine) as s:
        batt = s.query(ADBattery).filter_by(
            campaign_id=c["id"], system_id="s400",
        ).first()
        assert batt is not None
        bid = batt.id
        start = batt.interceptor_stock

    payload = _base_payload(
        platform_id="s400", quantity=8,
        total_cost_cr=8 * 17,
        kind="ad_reload",
        target_battery_id=bid,
        first_delivery_year=2026, first_delivery_quarter=3,
        foc_year=2026, foc_quarter=3,
    )
    r = client.post(f"/api/campaigns/{c['id']}/acquisitions", json=payload)
    assert r.status_code == 201, r.text

    _advance_turns(client, c["id"], 2)

    with Session(client._engine) as s:
        batt = s.get(ADBattery, bid)
        assert batt.interceptor_stock == start + 8
