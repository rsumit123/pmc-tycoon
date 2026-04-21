"""Tests for GET /api/campaigns/{id}/notifications."""
import pytest
from fastapi.testclient import TestClient
from sqlalchemy import create_engine
from sqlalchemy.orm import sessionmaker
from sqlalchemy.pool import StaticPool

from app.api.deps import get_db
from app.db.base import Base
from app.engine.vignette.bvr import PLATFORM_LOADOUTS
from main import app


@pytest.fixture
def client_with_session():
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


def _make_campaign(client) -> int:
    r = client.post("/api/campaigns", json={
        "name": "notif-test",
        "difficulty": "realistic",
        "objectives": ["amca_operational_by_2035"],
    })
    assert r.status_code == 201, r.text
    return r.json()["id"]


def _weapon_capacity_for(session, cid: int, base_id: int, weapon_id: str) -> int:
    """Sum squadron.strength*4 for squadrons at this base whose loadout
    includes the weapon."""
    from app.models.squadron import Squadron
    rows = session.query(Squadron).filter_by(campaign_id=cid, base_id=base_id).all()
    total = 0
    for sq in rows:
        ld = PLATFORM_LOADOUTS.get(sq.platform_id, {})
        weapons = list(ld.get("bvr", [])) + list(ld.get("wvr", []))
        if weapon_id in weapons:
            total += (sq.strength or 0) * 4
    return total


def _pick_base_weapon_pair(session, cid: int) -> tuple[int, str, int]:
    """Find a (base_id, weapon_id, capacity) seeded for the campaign."""
    from app.models.missile_stock import MissileStock
    rows = session.query(MissileStock).filter_by(campaign_id=cid).all()
    for s in rows:
        cap = _weapon_capacity_for(session, cid, s.base_id, s.weapon_id)
        if cap > 0:
            return s.base_id, s.weapon_id, cap
    raise RuntimeError("no seeded stock/squadron pair found")


def test_notifications_404_when_campaign_missing(client_with_session):
    client, _ = client_with_session
    r = client.get("/api/campaigns/999/notifications")
    assert r.status_code == 404


def test_notifications_empty_new_campaign(client_with_session):
    """Fresh campaign: seeded MissileStock is full (above 25% threshold) and
    AD batteries are seeded with stock > 0. There may still be pending
    vignettes synthesized from generator on campaign creation — this test
    asserts there are no low/empty/empty_ad notifications, allowing any
    pending_vignette entries."""
    client, SessionLocal = client_with_session
    cid = _make_campaign(client)
    r = client.get(f"/api/campaigns/{cid}/notifications")
    assert r.status_code == 200
    notifs = r.json()["notifications"]
    kinds = {n["kind"] for n in notifs}
    assert "low_stock" not in kinds
    assert "empty_stock" not in kinds
    assert "empty_ad" not in kinds


def test_low_stock_notification_fires_below_threshold(client_with_session):
    client, SessionLocal = client_with_session
    cid = _make_campaign(client)

    from app.models.missile_stock import MissileStock
    with SessionLocal() as s:
        base_id, weapon_id, cap = _pick_base_weapon_pair(s, cid)
        # Set stock to ~10% of capacity (definitely < 25%)
        low = max(1, cap // 10)
        row = s.query(MissileStock).filter_by(
            campaign_id=cid, base_id=base_id, weapon_id=weapon_id,
        ).one()
        row.stock = low
        s.commit()

    r = client.get(f"/api/campaigns/{cid}/notifications")
    assert r.status_code == 200
    notifs = r.json()["notifications"]
    low_stock = [n for n in notifs if n["kind"] == "low_stock"]
    assert len(low_stock) >= 1
    matched = [
        n for n in low_stock
        if n["id"] == f"low_stock:{base_id}:{weapon_id}"
    ]
    assert len(matched) == 1, low_stock
    n = matched[0]
    assert n["severity"] == "warning"
    assert weapon_id.upper() in n["title"]
    assert f"missile={weapon_id}" in n["action_url"]
    assert f"base={base_id}" in n["action_url"]


def test_empty_stock_notification_fires_at_zero(client_with_session):
    client, SessionLocal = client_with_session
    cid = _make_campaign(client)

    from app.models.missile_stock import MissileStock
    with SessionLocal() as s:
        base_id, weapon_id, _cap = _pick_base_weapon_pair(s, cid)
        row = s.query(MissileStock).filter_by(
            campaign_id=cid, base_id=base_id, weapon_id=weapon_id,
        ).one()
        row.stock = 0
        s.commit()

    r = client.get(f"/api/campaigns/{cid}/notifications")
    assert r.status_code == 200
    notifs = r.json()["notifications"]
    empties = [
        n for n in notifs
        if n["kind"] == "empty_stock"
        and n["id"] == f"empty_stock:{base_id}:{weapon_id}"
    ]
    assert len(empties) == 1
    assert empties[0]["severity"] == "warning"
    assert "EMPTY" in empties[0]["title"]


def test_no_notification_when_base_has_no_squadron_for_weapon(client_with_session):
    """Insert a MissileStock row for a weapon no squadron at that base uses.
    The synthesizer should skip it entirely (derived capacity = 0)."""
    client, SessionLocal = client_with_session
    cid = _make_campaign(client)

    from app.models.missile_stock import MissileStock
    from app.models.campaign_base import CampaignBase
    from app.models.squadron import Squadron
    with SessionLocal() as s:
        bases = s.query(CampaignBase).filter_by(campaign_id=cid).all()
        # Pick a base, find a weapon none of its squadrons use
        unusable: tuple[int, str] | None = None
        for b in bases:
            sqs = s.query(Squadron).filter_by(
                campaign_id=cid, base_id=b.id,
            ).all()
            used: set[str] = set()
            for sq in sqs:
                ld = PLATFORM_LOADOUTS.get(sq.platform_id, {})
                used.update(ld.get("bvr", []))
                used.update(ld.get("wvr", []))
            # pl17 is used only by j20/j36 (adversary), so no friendly
            # squadron will carry it
            if "pl17" not in used:
                unusable = (b.id, "pl17")
                break
        assert unusable is not None
        base_id, weapon_id = unusable

        # Remove any pre-existing row for (cid, base, weapon) then insert low
        s.query(MissileStock).filter_by(
            campaign_id=cid, base_id=base_id, weapon_id=weapon_id,
        ).delete()
        s.add(MissileStock(
            campaign_id=cid, base_id=base_id, weapon_id=weapon_id, stock=0,
        ))
        s.commit()

    r = client.get(f"/api/campaigns/{cid}/notifications")
    assert r.status_code == 200
    notifs = r.json()["notifications"]
    bogus = [
        n for n in notifs
        if n["id"] in (
            f"empty_stock:{base_id}:{weapon_id}",
            f"low_stock:{base_id}:{weapon_id}",
        )
    ]
    assert bogus == []


def test_empty_ad_notification_fires_when_interceptor_stock_zero(client_with_session):
    client, SessionLocal = client_with_session
    cid = _make_campaign(client)

    from app.models.ad_battery import ADBattery
    with SessionLocal() as s:
        batteries = s.query(ADBattery).filter_by(campaign_id=cid).all()
        assert batteries, "expected seeded AD batteries"
        bat = batteries[0]
        bat.interceptor_stock = 0
        s.commit()
        bat_id = bat.id

    r = client.get(f"/api/campaigns/{cid}/notifications")
    assert r.status_code == 200
    notifs = r.json()["notifications"]
    empties = [
        n for n in notifs
        if n["kind"] == "empty_ad" and n["id"] == f"empty_ad:{bat_id}"
    ]
    assert len(empties) == 1
    assert empties[0]["severity"] == "warning"


def test_pending_vignette_listed(client_with_session):
    client, SessionLocal = client_with_session
    cid = _make_campaign(client)

    from app.models.vignette import Vignette
    with SessionLocal() as s:
        v = Vignette(
            campaign_id=cid,
            year=2026, quarter=2,
            scenario_id="test_scn",
            status="pending",
            planning_state={
                "scenario_name": "Border Incursion",
                "ao": {"name": "Leh"},
            },
        )
        s.add(v); s.commit()
        vid = v.id

    r = client.get(f"/api/campaigns/{cid}/notifications")
    assert r.status_code == 200
    notifs = r.json()["notifications"]
    pending = [
        n for n in notifs
        if n["kind"] == "pending_vignette"
        and n["id"] == f"pending_vignette:{vid}"
    ]
    assert len(pending) == 1
    assert "Border Incursion" in pending[0]["title"]
    assert "Leh" in pending[0]["body"]
    assert f"/vignette/{vid}" in pending[0]["action_url"]


def test_rd_completed_event_becomes_notification_within_recency(client_with_session):
    client, SessionLocal = client_with_session
    cid = _make_campaign(client)

    from app.models.campaign import Campaign
    from app.models.event import CampaignEvent
    with SessionLocal() as s:
        camp = s.query(Campaign).filter_by(id=cid).one()
        # Recent event: at current turn
        s.add(CampaignEvent(
            campaign_id=cid,
            year=camp.current_year, quarter=camp.current_quarter,
            event_type="rd_completed",
            payload={"program_id": "amca"},
        ))
        # Old event: 15 quarters ago — outside recency
        total_q = camp.current_year * 4 + (camp.current_quarter - 1) - 15
        old_y = total_q // 4
        old_q = (total_q % 4) + 1
        s.add(CampaignEvent(
            campaign_id=cid,
            year=old_y, quarter=old_q,
            event_type="rd_completed",
            payload={"program_id": "astra_mk3"},
        ))
        s.commit()

    r = client.get(f"/api/campaigns/{cid}/notifications")
    assert r.status_code == 200
    notifs = r.json()["notifications"]
    rd = [n for n in notifs if n["kind"] == "rd_completed"]
    # Recent amca should be present, old astra_mk3 should NOT be
    amcas = [n for n in rd if "amca" in n["title"].lower() or "AMCA" in n["title"]]
    astras = [n for n in rd if "astra" in n["title"].lower()]
    assert len(amcas) == 1
    assert amcas[0]["severity"] == "info"
    assert astras == []


def test_acquisition_slipped_event_fires_warning(client_with_session):
    client, SessionLocal = client_with_session
    cid = _make_campaign(client)

    from app.models.campaign import Campaign
    from app.models.event import CampaignEvent
    with SessionLocal() as s:
        camp = s.query(Campaign).filter_by(id=cid).one()
        s.add(CampaignEvent(
            campaign_id=cid,
            year=camp.current_year, quarter=camp.current_quarter,
            event_type="acquisition_slipped",
            payload={
                "platform_id": "rafale_f4",
                "new_foc_year": 2029,
                "new_foc_quarter": 2,
            },
        ))
        s.commit()

    r = client.get(f"/api/campaigns/{cid}/notifications")
    assert r.status_code == 200
    notifs = r.json()["notifications"]
    slips = [n for n in notifs if n["kind"] == "acquisition_slipped"]
    assert len(slips) == 1
    assert slips[0]["severity"] == "warning"
    assert "rafale_f4" in slips[0]["title"]
    assert "2029-Q2" in slips[0]["body"]


def test_warnings_sorted_before_infos(client_with_session):
    client, SessionLocal = client_with_session
    cid = _make_campaign(client)

    from app.models.ad_battery import ADBattery
    from app.models.campaign import Campaign
    from app.models.event import CampaignEvent
    with SessionLocal() as s:
        # Add an empty AD (warning)
        bat = s.query(ADBattery).filter_by(campaign_id=cid).first()
        assert bat
        bat.interceptor_stock = 0
        # Add an rd_completed info
        camp = s.query(Campaign).filter_by(id=cid).one()
        s.add(CampaignEvent(
            campaign_id=cid,
            year=camp.current_year, quarter=camp.current_quarter,
            event_type="rd_completed",
            payload={"program_id": "amca"},
        ))
        s.commit()

    r = client.get(f"/api/campaigns/{cid}/notifications")
    assert r.status_code == 200
    notifs = r.json()["notifications"]
    # Find first warning index and first info index
    severities = [n["severity"] for n in notifs]
    assert "warning" in severities
    assert "info" in severities
    first_info = severities.index("info")
    # Every entry before first_info must be warning
    assert all(sv == "warning" for sv in severities[:first_info])
    # And no warning appears after first_info
    assert all(sv == "info" for sv in severities[first_info:])
