import pytest
from fastapi.testclient import TestClient
from sqlalchemy import create_engine
from sqlalchemy.orm import sessionmaker
from sqlalchemy.pool import StaticPool

from app.db.base import Base
import app.models  # noqa: F401
from app.api.deps import get_db
from main import app

from app.crud.vignette import (
    commit_vignette, submit_engagement_result,
    AlreadyResolvedError, CommitValidationError,
)
from app.engine.engagement import EngagementResultError
from app.models.campaign import Campaign
from app.models.vignette import Vignette
from app.models.missile_stock import MissileStock


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


def _create_campaign(client, seed=42):
    return client.post("/api/campaigns", json={
        "name": "T", "difficulty": "realistic", "objectives": [], "seed": seed,
    }).json()


def _advance_until_vignette(client, campaign_id, max_turns=40):
    for _ in range(max_turns):
        client.post(f"/api/campaigns/{campaign_id}/advance")
        pending = client.get(f"/api/campaigns/{campaign_id}/vignettes/pending").json()
        if pending["vignettes"]:
            return pending["vignettes"][0]
    return None


def _interactive_commit_body(eligible_squadrons, roe_options):
    sq = eligible_squadrons[0]
    return {
        "squadrons": [{"squadron_id": sq["squadron_id"], "airframes": min(4, sq["airframes_available"])}],
        "support": {"awacs": True, "tanker": False, "sead_package": False},
        "roe": roe_options[0] if roe_options else "weapons_free",
        "mode": "interactive",
    }


def _db_session():
    return next(app.dependency_overrides[get_db]())


def _fire_and_commit_interactive(client, seed=7, max_turns=40):
    """Advance turns to a fired combat vignette (with eligible squadrons)
    and commit it in interactive mode. Returns (client, campaign_id, vignette_id, body)."""
    c = _create_campaign(client, seed=seed)
    v = None
    for _ in range(max_turns):
        v = _advance_until_vignette(client, c["id"], max_turns=1)
        if v is None:
            continue
        eligible = v["planning_state"]["eligible_squadrons"]
        if eligible:
            break
        v = None
    if v is None:
        return c["id"], None, None
    body = _interactive_commit_body(v["planning_state"]["eligible_squadrons"], v["planning_state"]["roe_options"])
    r = client.post(f"/api/campaigns/{c['id']}/vignettes/{v['id']}/commit", json=body)
    assert r.status_code == 200
    assert r.json()["status"] == "engaged"
    return c["id"], v["id"], body


def test_interactive_commit_sets_engaged_status(client):
    campaign_id, vignette_id, body = _fire_and_commit_interactive(client)
    if vignette_id is None:
        pytest.skip("no eligible-squadron vignette fired for this seed")
    r = client.get(f"/api/campaigns/{campaign_id}/vignettes/{vignette_id}")
    assert r.json()["status"] == "engaged"
    assert r.json()["committed_force"]["mode"] == "interactive"


def test_recommit_after_engaged_with_auto_falls_through(client):
    """A re-commit (mode auto/omitted) on an engaged vignette resolves it —
    the escape hatch for abandoned interactive engagements."""
    campaign_id, vignette_id, body = _fire_and_commit_interactive(client)
    if vignette_id is None:
        pytest.skip("no eligible-squadron vignette fired for this seed")
    auto_body = dict(body)
    auto_body["mode"] = "auto"
    r = client.post(f"/api/campaigns/{campaign_id}/vignettes/{vignette_id}/commit", json=auto_body)
    assert r.status_code == 200
    assert r.json()["status"] == "resolved"


def test_submit_engagement_result_resolves_vignette():
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
    client = TestClient(app)
    try:
        campaign_id, vignette_id, body = _fire_and_commit_interactive(client)
        if vignette_id is None:
            pytest.skip("no eligible-squadron vignette fired for this seed")

        db = next(override_get_db())
        try:
            campaign = db.query(Campaign).filter_by(id=campaign_id).first()
            vignette = db.query(Vignette).filter_by(id=vignette_id).first()
            player_sqid = body["squadrons"][0]["squadron_id"]
            result = {
                "player_squadron_id": player_sqid,
                "flight_kills": {},
                "flight_losses": 0,
                "munitions_expended": {},
                "flares_used": 0,
                "disengaged": False,
            }
            resolved = submit_engagement_result(db, campaign, vignette, result)
            assert resolved.status == "resolved"
            assert resolved.outcome
            assert resolved.outcome["interactive"] is True
            assert resolved.event_trace[0]["kind"] == "engagement_player_flight"
        finally:
            db.close()
    finally:
        app.dependency_overrides.clear()
        Base.metadata.drop_all(bind=engine)


def _setup_engagement_direct(client, campaign_id, vignette_id):
    db = next(app.dependency_overrides[get_db]())
    campaign = db.query(Campaign).filter_by(id=campaign_id).first()
    vignette = db.query(Vignette).filter_by(id=vignette_id).first()
    return db, campaign, vignette


def test_submit_engagement_result_rejects_bad_caps():
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
    client = TestClient(app)
    try:
        campaign_id, vignette_id, body = _fire_and_commit_interactive(client)
        if vignette_id is None:
            pytest.skip("no eligible-squadron vignette fired for this seed")

        db = next(override_get_db())
        try:
            campaign = db.query(Campaign).filter_by(id=campaign_id).first()
            vignette = db.query(Vignette).filter_by(id=vignette_id).first()
            player_sqid = body["squadrons"][0]["squadron_id"]
            result = {
                "player_squadron_id": player_sqid,
                "flight_kills": {},
                "flight_losses": 999,
                "munitions_expended": {},
                "flares_used": 0,
                "disengaged": False,
            }
            with pytest.raises(EngagementResultError):
                submit_engagement_result(db, campaign, vignette, result)
        finally:
            db.close()
    finally:
        app.dependency_overrides.clear()
        Base.metadata.drop_all(bind=engine)


def test_submit_engagement_result_deducts_player_munitions_stock():
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
    client = TestClient(app)
    try:
        campaign_id, vignette_id, body = _fire_and_commit_interactive(client)
        if vignette_id is None:
            pytest.skip("no eligible-squadron vignette fired for this seed")

        db = next(override_get_db())
        try:
            from app.crud.vignette import _squadron_rows
            from app.engine.vignette.bvr import PLATFORM_LOADOUTS

            campaign = db.query(Campaign).filter_by(id=campaign_id).first()
            vignette = db.query(Vignette).filter_by(id=vignette_id).first()
            player_sqid = body["squadrons"][0]["squadron_id"]

            rows = _squadron_rows(db, vignette.committed_force)
            row = next(r for r in rows if r["id"] == player_sqid)
            loadout = PLATFORM_LOADOUTS.get(row["platform_id"], {"bvr": [], "wvr": []})
            weapon_ids = list(loadout.get("bvr", [])) + list(loadout.get("wvr", []))
            if not weapon_ids:
                pytest.skip("player platform has no loadout weapons to test with")
            weapon_id = weapon_ids[0]

            stock_row = db.query(MissileStock).filter_by(
                campaign_id=campaign.id, base_id=row["base_id"], weapon_id=weapon_id,
            ).first()
            if stock_row is None or stock_row.stock < 1:
                pytest.skip("no starting stock for this weapon at this base")
            before = stock_row.stock

            result = {
                "player_squadron_id": player_sqid,
                "flight_kills": {},
                "flight_losses": 0,
                "munitions_expended": {weapon_id: 1},
                "flares_used": 0,
                "disengaged": False,
            }
            submit_engagement_result(db, campaign, vignette, result)

            db.refresh(stock_row)
            assert stock_row.stock == before - 1
        finally:
            db.close()
    finally:
        app.dependency_overrides.clear()
        Base.metadata.drop_all(bind=engine)


def test_submit_engagement_result_flight_losses_hit_squadron_strength():
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
    client = TestClient(app)
    try:
        campaign_id, vignette_id, body = _fire_and_commit_interactive(client)
        if vignette_id is None:
            pytest.skip("no eligible-squadron vignette fired for this seed")

        db = next(override_get_db())
        try:
            from app.models.squadron import Squadron

            campaign = db.query(Campaign).filter_by(id=campaign_id).first()
            vignette = db.query(Vignette).filter_by(id=vignette_id).first()
            player_sqid = body["squadrons"][0]["squadron_id"]
            sq = db.get(Squadron, player_sqid)
            strength_before = sq.strength

            result = {
                "player_squadron_id": player_sqid,
                "flight_kills": {},
                "flight_losses": 1,
                "munitions_expended": {},
                "flares_used": 0,
                "disengaged": False,
            }
            submit_engagement_result(db, campaign, vignette, result)

            db.refresh(sq)
            assert sq.strength == strength_before - 1
        finally:
            db.close()
    finally:
        app.dependency_overrides.clear()
        Base.metadata.drop_all(bind=engine)


def test_submit_engagement_result_zero_residual_path():
    """Player kills the entire adversary force and takes no losses — no
    residual resolve should run, and the objective rule still applies."""
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
    client = TestClient(app)
    try:
        campaign_id, vignette_id, body = _fire_and_commit_interactive(client)
        if vignette_id is None:
            pytest.skip("no eligible-squadron vignette fired for this seed")

        db = next(override_get_db())
        try:
            campaign = db.query(Campaign).filter_by(id=campaign_id).first()
            vignette = db.query(Vignette).filter_by(id=vignette_id).first()
            player_sqid = body["squadrons"][0]["squadron_id"]
            ps = vignette.planning_state
            flight_kills = {
                e["platform_id"]: e["count"] for e in ps.get("adversary_force", [])
            }
            result = {
                "player_squadron_id": player_sqid,
                "flight_kills": flight_kills,
                "flight_losses": 0,
                "munitions_expended": {},
                "flares_used": 0,
                "disengaged": False,
            }
            resolved = submit_engagement_result(db, campaign, vignette, result)
            assert resolved.status == "resolved"
            adv_total = sum(flight_kills.values())
            assert resolved.outcome["adv_kia"] == adv_total
            # No residual resolve happened, so event_trace is just the
            # player-flight entry.
            assert len(resolved.event_trace) == 1
            assert resolved.event_trace[0]["kind"] == "engagement_player_flight"
        finally:
            db.close()
    finally:
        app.dependency_overrides.clear()
        Base.metadata.drop_all(bind=engine)


def test_submit_engagement_result_already_resolved_raises():
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
    client = TestClient(app)
    try:
        campaign_id, vignette_id, body = _fire_and_commit_interactive(client)
        if vignette_id is None:
            pytest.skip("no eligible-squadron vignette fired for this seed")

        db = next(override_get_db())
        try:
            campaign = db.query(Campaign).filter_by(id=campaign_id).first()
            vignette = db.query(Vignette).filter_by(id=vignette_id).first()
            player_sqid = body["squadrons"][0]["squadron_id"]
            result = {
                "player_squadron_id": player_sqid,
                "flight_kills": {},
                "flight_losses": 0,
                "munitions_expended": {},
                "flares_used": 0,
                "disengaged": False,
            }
            submit_engagement_result(db, campaign, vignette, result)
            with pytest.raises(AlreadyResolvedError):
                submit_engagement_result(db, campaign, vignette, result)
        finally:
            db.close()
    finally:
        app.dependency_overrides.clear()
        Base.metadata.drop_all(bind=engine)


def test_engaged_vignette_blocks_new_vignette_generation(client):
    """Mirrors test_orchestrator_skips_vignette_when_pending_exists (engine
    level): an engaged vignette must suppress rolling a brand-new one on
    turn advance, exactly like a pending vignette does — no stuck/duplicate
    campaigns, no silent auto-resolve."""
    campaign_id, vignette_id, body = _fire_and_commit_interactive(client)
    if vignette_id is None:
        pytest.skip("no eligible-squadron vignette fired for this seed")

    r = client.get(f"/api/campaigns/{campaign_id}/vignettes/{vignette_id}")
    assert r.json()["status"] == "engaged"

    # Advance several more turns while the vignette sits engaged (unresolved).
    # No NEW vignette should ever appear — the engaged one still occupies the
    # backpressure slot, and (review I2) remains discoverable in the pending
    # list so a reloading client can find its way back into the battle.
    for _ in range(5):
        adv = client.post(f"/api/campaigns/{campaign_id}/advance")
        assert adv.status_code == 200
        pending = client.get(f"/api/campaigns/{campaign_id}/vignettes/pending").json()
        assert [v["id"] for v in pending["vignettes"]] == [vignette_id]
        assert pending["vignettes"][0]["status"] == "engaged"

    # The original vignette is still there, still engaged (untouched by
    # turn advance — no silent auto-resolve).
    r = client.get(f"/api/campaigns/{campaign_id}/vignettes/{vignette_id}")
    assert r.json()["status"] == "engaged"


def test_plain_auto_commit_still_resolves_normally(client):
    """Regression: auto-mode commit (mode omitted) is byte-identical in
    behavior to pre-engagement-feature commits."""
    c = _create_campaign(client, seed=7)
    v = _advance_until_vignette(client, c["id"])
    if v is None:
        pytest.skip("no vignette fired")
    eligible = v["planning_state"]["eligible_squadrons"]
    if not eligible:
        pytest.skip("no eligible squadron for this seed")
    sq = eligible[0]
    body = {
        "squadrons": [{"squadron_id": sq["squadron_id"], "airframes": min(4, sq["airframes_available"])}],
        "support": {"awacs": True, "tanker": False, "sead_package": False},
        "roe": v["planning_state"]["roe_options"][0],
    }
    r = client.post(f"/api/campaigns/{c['id']}/vignettes/{v['id']}/commit", json=body)
    assert r.status_code == 200
    resolved = r.json()
    assert resolved["status"] == "resolved"
    assert resolved["outcome"]
    assert resolved["event_trace"]


def test_interactive_commit_requires_at_least_one_squadron(client):
    """Review I1: a zero-squadron interactive commit would park an engaged
    vignette that can never be resolved (no flight to fly) while blocking
    all new vignettes — reject it at commit time."""
    c = _create_campaign(client, seed=7)
    v = _advance_until_vignette(client, c["id"])
    if v is None:
        pytest.skip("no vignette fired")
    body = {
        "squadrons": [],
        "support": {"awacs": False, "tanker": False, "sead_package": False},
        "roe": v["planning_state"]["roe_options"][0],
        "mode": "interactive",
    }
    r = client.post(f"/api/campaigns/{c['id']}/vignettes/{v['id']}/commit", json=body)
    # commit maps CommitValidationError -> 400 (existing endpoint convention)
    assert r.status_code == 400
    assert "at least one committed squadron" in r.json()["detail"]

    # Vignette must remain pending and commitable.
    r = client.get(f"/api/campaigns/{c['id']}/vignettes/{v['id']}")
    assert r.json()["status"] == "pending"
