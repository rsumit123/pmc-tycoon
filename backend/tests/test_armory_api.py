import pytest
from fastapi.testclient import TestClient
from sqlalchemy import create_engine
from sqlalchemy.orm import Session, sessionmaker
from sqlalchemy.pool import StaticPool

from app.db.base import Base
import app.models  # noqa: F401
from app.api.deps import get_db
from main import app


def _make_client():
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
    return TestClient(app), engine


def _advance_until_astra_mk2_complete(client, engine, cid: int, max_turns: int = 6) -> bool:
    """Seed has astra_mk2 at 75%. Completes in 1-2 turns at standard funding."""
    from app.models.rd_program import RDProgramState
    for _ in range(max_turns):
        client.post(f"/api/campaigns/{cid}/advance")
        with Session(engine) as s:
            row = s.query(RDProgramState).filter_by(
                campaign_id=cid, program_id="astra_mk2"
            ).first()
            if row and row.status == "completed":
                return True
    return False


def test_unlocks_endpoint_empty_at_start():
    client, engine = _make_client()
    try:
        resp = client.post("/api/campaigns", json={"name": "Test"})
        cid = resp.json()["id"]
        r = client.get(f"/api/campaigns/{cid}/armory/unlocks")
        assert r.status_code == 200
        d = r.json()
        assert "missiles" in d
        assert "ad_systems" in d
        assert "isr_drones" in d
        assert "strike_platforms" in d
    finally:
        app.dependency_overrides.clear()
        Base.metadata.drop_all(bind=engine)


def test_unlocks_endpoint_shows_completed_missile():
    client, engine = _make_client()
    try:
        resp = client.post("/api/campaigns", json={"name": "Test"})
        cid = resp.json()["id"]
        completed = _advance_until_astra_mk2_complete(client, engine, cid)
        if not completed:
            pytest.skip("astra_mk2 did not complete — seed or engine change")
        r = client.get(f"/api/campaigns/{cid}/armory/unlocks")
        missile_ids = {m["target_id"] for m in r.json()["missiles"]}
        assert "astra_mk2" in missile_ids
    finally:
        app.dependency_overrides.clear()
        Base.metadata.drop_all(bind=engine)


def test_equip_missile_creates_loadout_upgrade():
    client, engine = _make_client()
    try:
        resp = client.post("/api/campaigns", json={"name": "Test"})
        cid = resp.json()["id"]
        completed = _advance_until_astra_mk2_complete(client, engine, cid)
        if not completed:
            pytest.skip("astra_mk2 did not complete")
        from app.models.squadron import Squadron
        with Session(engine) as s:
            sq = s.query(Squadron).filter_by(campaign_id=cid, platform_id="rafale_f4").first()
            if sq is None:
                pytest.skip("no rafale_f4 squadron seeded")
            sq_id = sq.id
        r = client.post(
            f"/api/campaigns/{cid}/armory/missiles/astra_mk2/equip",
            json={"squadron_id": sq_id},
        )
        assert r.status_code == 200, r.text
        body = r.json()
        assert body["squadron_id"] == sq_id
        assert body["weapon_id"] == "astra_mk2"
        assert body["status"] == "pending"
        assert body["completion_year"] >= 2026
    finally:
        app.dependency_overrides.clear()
        Base.metadata.drop_all(bind=engine)


def test_equip_missile_rejects_ineligible_platform():
    client, engine = _make_client()
    try:
        resp = client.post("/api/campaigns", json={"name": "Test"})
        cid = resp.json()["id"]
        completed = _advance_until_astra_mk2_complete(client, engine, cid)
        if not completed:
            pytest.skip("astra_mk2 did not complete")
        from app.models.squadron import Squadron
        with Session(engine) as s:
            sq = s.query(Squadron).filter_by(campaign_id=cid, platform_id="mig21_bison").first()
            if sq is None:
                pytest.skip("no mig21_bison squadron seeded")
            sq_id = sq.id
        r = client.post(
            f"/api/campaigns/{cid}/armory/missiles/astra_mk2/equip",
            json={"squadron_id": sq_id},
        )
        assert r.status_code == 400
    finally:
        app.dependency_overrides.clear()
        Base.metadata.drop_all(bind=engine)


def test_equip_missile_requires_unlock():
    client, engine = _make_client()
    try:
        resp = client.post("/api/campaigns", json={"name": "Test"})
        cid = resp.json()["id"]
        # astra_mk3 is not completed yet at campaign start
        from app.models.squadron import Squadron
        with Session(engine) as s:
            sq = s.query(Squadron).filter_by(campaign_id=cid, platform_id="rafale_f4").first()
            if sq is None:
                pytest.skip("no rafale_f4 squadron seeded")
            sq_id = sq.id
        r = client.post(
            f"/api/campaigns/{cid}/armory/missiles/astra_mk3/equip",
            json={"squadron_id": sq_id},
        )
        assert r.status_code == 409
    finally:
        app.dependency_overrides.clear()
        Base.metadata.drop_all(bind=engine)


def test_install_ad_system_rejects_non_unlocked():
    client, engine = _make_client()
    try:
        resp = client.post("/api/campaigns", json={"name": "Test"})
        cid = resp.json()["id"]
        from app.models.campaign_base import CampaignBase
        with Session(engine) as s:
            base = s.query(CampaignBase).filter_by(campaign_id=cid).first()
            base_id = base.id
        r = client.post(
            f"/api/campaigns/{cid}/armory/ad-systems/akash_ng/install",
            json={"base_id": base_id},
        )
        # akash_ng is not unlocked at campaign start (no R&D program points to it)
        assert r.status_code == 409
    finally:
        app.dependency_overrides.clear()
        Base.metadata.drop_all(bind=engine)


def test_install_ad_system_rejects_duplicate_at_same_base():
    """Strict one-battery-per-(base, system_id). Second install at same base → 409."""
    client, engine = _make_client()
    try:
        resp = client.post("/api/campaigns", json={"name": "Test"})
        cid = resp.json()["id"]

        from app.models.campaign_base import CampaignBase
        from app.models.rd_program import RDProgramState
        from app.models.ad_battery import ADBattery
        from app.models.campaign import Campaign

        with Session(engine) as s:
            bases = s.query(CampaignBase).filter_by(campaign_id=cid).all()
            base_a_id = bases[0].id
            base_b_id = bases[1].id
            # Force long_range_sam R&D to completed so the unlock check passes.
            s.add(RDProgramState(
                campaign_id=cid, program_id="long_range_sam",
                funding_level="standard", status="completed",
                progress_pct=100, cost_invested_cr=0,
            ))
            # Pump treasury so the install-cost check doesn't fire.
            camp = s.get(Campaign, cid)
            camp.budget_cr = 500_000
            s.commit()

        # First install: succeeds
        r1 = client.post(
            f"/api/campaigns/{cid}/armory/ad-systems/long_range_sam/install",
            json={"base_id": base_a_id},
        )
        assert r1.status_code == 200, r1.text

        # Second install at SAME base: 409 duplicate
        r2 = client.post(
            f"/api/campaigns/{cid}/armory/ad-systems/long_range_sam/install",
            json={"base_id": base_a_id},
        )
        assert r2.status_code == 409
        assert "already installed" in r2.json()["detail"].lower()

        # Install at a DIFFERENT base: succeeds (same system, different base)
        r3 = client.post(
            f"/api/campaigns/{cid}/armory/ad-systems/long_range_sam/install",
            json={"base_id": base_b_id},
        )
        assert r3.status_code == 200, r3.text

        # Confirm two battery rows, one per base
        with Session(engine) as s:
            rows = s.query(ADBattery).filter_by(campaign_id=cid, system_id="long_range_sam").all()
            assert len(rows) == 2
            assert {r.base_id for r in rows} == {base_a_id, base_b_id}
    finally:
        app.dependency_overrides.clear()
        Base.metadata.drop_all(bind=engine)
