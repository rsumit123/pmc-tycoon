import pytest
from fastapi.testclient import TestClient
from sqlalchemy import create_engine
from sqlalchemy.orm import sessionmaker
from sqlalchemy.pool import StaticPool

from app.api.deps import get_db
from app.db.base import Base
from app.models.adversary_base import AdversaryBase
from app.models.campaign import Campaign
from app.models.missile_stock import MissileStock
from app.models.squadron import Squadron
from main import app


@pytest.fixture
def client_db():
    engine = create_engine(
        "sqlite:///:memory:",
        connect_args={"check_same_thread": False},
        poolclass=StaticPool,
    )
    Local = sessionmaker(autocommit=False, autoflush=False, bind=engine)
    Base.metadata.create_all(bind=engine)

    def _g():
        d = Local()
        try:
            yield d
        finally:
            d.close()
    app.dependency_overrides[get_db] = _g
    yield TestClient(app), Local
    app.dependency_overrides.clear()


def _new_campaign(client) -> int:
    return client.post(
        "/api/campaigns",
        json={"name": "off", "difficulty": "realistic", "objectives": ["defend_punjab"]},
    ).json()["id"]


def test_strike_preview_blocked_until_unlocked(client_db):
    client, _ = client_db
    cid = _new_campaign(client)
    r = client.post(
        f"/api/campaigns/{cid}/strikes/preview",
        json={"target_base_id": 1, "profile": "deep_strike", "squadrons": [],
              "weapons_planned": {}, "support": {}, "roe": "unrestricted"},
    )
    assert r.status_code == 409


def _unlock(client, Local, cid):
    db = Local()
    camp = db.get(Campaign, cid)
    camp.offensive_unlocked = True
    db.commit()
    db.close()


def test_standoff_cruise_strike_no_munitions_writes_zero_damage_op(client_db):
    """A cruise strike with no weapons planned still resolves (validates &
    writes an OffensiveOp with zero damage). Verifies the API path end-to-end.
    """
    client, Local = client_db
    cid = _new_campaign(client)
    _unlock(client, Local, cid)

    bases = client.get(f"/api/campaigns/{cid}/adversary-bases?covered_only=false").json()["bases"]
    sqns = client.get(f"/api/campaigns/{cid}/hangar").json()["squadrons"]
    # Pick a squadron with role compatible with standoff_cruise.
    sq = next((s for s in sqns if s["platform_id"] in ("rafale_f4", "su30_mki", "tejas_mk1a")), sqns[0])

    r = client.post(f"/api/campaigns/{cid}/strikes", json={
        "target_base_id": bases[0]["id"],
        "profile": "standoff_cruise",
        "squadrons": [{"squadron_id": sq["id"], "airframes": min(2, sq["strength"])}],
        "weapons_planned": {},
        "support": {},
        "roe": "unrestricted",
    })
    assert r.status_code == 201
    body = r.json()
    assert body["profile"] == "standoff_cruise"
    assert body["target_base_id"] == bases[0]["id"]


def test_strike_cap_per_quarter(client_db):
    client, Local = client_db
    cid = _new_campaign(client)
    _unlock(client, Local, cid)
    bases = client.get(f"/api/campaigns/{cid}/adversary-bases?covered_only=false").json()["bases"]
    sqns = client.get(f"/api/campaigns/{cid}/hangar").json()["squadrons"]
    sq = next((s for s in sqns if s["platform_id"] in ("rafale_f4", "su30_mki", "tejas_mk1a")), sqns[0])

    payload = {
        "target_base_id": bases[0]["id"],
        "profile": "standoff_cruise",
        "squadrons": [{"squadron_id": sq["id"], "airframes": 2}],
        "weapons_planned": {},
        "support": {},
        "roe": "unrestricted",
    }
    r1 = client.post(f"/api/campaigns/{cid}/strikes", json=payload)
    assert r1.status_code == 201
    r2 = client.post(f"/api/campaigns/{cid}/strikes", json=payload)
    assert r2.status_code == 201
    r3 = client.post(f"/api/campaigns/{cid}/strikes", json=payload)
    assert r3.status_code == 409


def test_diplomacy_endpoint(client_db):
    client, _ = client_db
    cid = _new_campaign(client)
    r = client.get(f"/api/campaigns/{cid}/diplomacy")
    assert r.status_code == 200
    body = r.json()
    assert {f["faction"] for f in body["factions"]} == {"PAF", "PLAAF", "PLAN"}
    assert "grant_bump_pct" in body


def test_posture_endpoint(client_db):
    client, _ = client_db
    cid = _new_campaign(client)
    r = client.get(f"/api/campaigns/{cid}/posture")
    assert r.status_code == 200
    body = r.json()
    assert body["offensive_unlocked"] is False
    assert "treasury" in body
    assert isinstance(body["fleet_by_role"], list)
    assert body["strikes_this_quarter"] == 0
