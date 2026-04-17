"""Full-campaign adversary roadmap integration.

Advances a fixed-seed campaign through all 40 quarters and asserts
that the key authored roadmap milestones land in the final adversary
state. This is the test that gives confidence Plan 3's roadmap doesn't
silently drop events.
"""

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


def _run_full_campaign(client, seed=1234):
    c = client.post("/api/campaigns", json={
        "name": "full", "difficulty": "realistic", "objectives": [], "seed": seed,
    }).json()
    # Advance 40 quarters; engine processes FROM-clock 2026-Q2 .. 2036-Q1
    for _ in range(40):
        client.post(f"/api/campaigns/{c['id']}/advance")
    return c["id"]


def test_paf_j35e_reaches_authored_total_by_end_of_campaign(client):
    cid = _run_full_campaign(client)
    body = client.get(f"/api/campaigns/{cid}/adversary").json()
    paf = next(f for f in body["factions"] if f["faction"] == "PAF")
    # Roadmap delivers 4 + 36 + 20 + 10 + 20 + 10 = 100 airframes by 2035-Q4.
    # Tight assertion: matches the authored YAML exactly. If a roadmap edit
    # changes the cumulative, update this number deliberately.
    assert paf["state"]["inventory"]["j35e"] == 100


def test_plaaf_doctrine_reaches_saturation_raid_by_end(client):
    cid = _run_full_campaign(client)
    body = client.get(f"/api/campaigns/{cid}/adversary").json()
    plaaf = next(f for f in body["factions"] if f["faction"] == "PLAAF")
    assert plaaf["state"]["doctrine"] == "saturation_raid"


def test_plan_reaches_global_power_projection_with_type004(client):
    cid = _run_full_campaign(client)
    body = client.get(f"/api/campaigns/{cid}/adversary").json()
    plan = next(f for f in body["factions"] if f["faction"] == "PLAN")
    assert plan["state"]["inventory"].get("type004_carrier", 0) >= 2
    assert plan["state"]["doctrine"] == "global_power_projection"


def test_intel_feed_produces_reasonable_volume(client):
    cid = _run_full_campaign(client)
    body = client.get(f"/api/campaigns/{cid}/intel?limit=500").json()
    # 40 turns × ~5.5 avg cards/turn + ~16 roadmap-driven + 1 seed.
    # Empirically lands at 237-242 across seeds; assert >= 200 to allow
    # tuning headroom but catch silent regressions.
    assert body["total"] >= 200


def test_intel_false_rate_is_in_band(client):
    cid = _run_full_campaign(client)
    # Fetch ALL pages by bumping limit
    body = client.get(f"/api/campaigns/{cid}/intel?limit=500").json()
    total = body["total"]
    false_count = sum(1 for c in body["cards"] if not c["truth_value"])
    # Effective expected rate is ~0.18: the source-type mix is IMINT-heavy
    # (40% of all cards via IMINT-only roadmap blocks), and IMINT has the
    # lowest false_rate (10%). Observed across seeds: 0.155-0.207. Band
    # [0.10, 0.30] catches catastrophic regressions while tolerating
    # seed-to-seed sample variance.
    ratio = false_count / total if total else 0
    assert 0.10 <= ratio <= 0.30, f"false rate {ratio:.2f} outside [0.10, 0.30]"


def test_plaaf_j36_sighting_eventually_appears(client):
    cid = _run_full_campaign(client)
    body = client.get(f"/api/campaigns/{cid}/intel?limit=500").json()
    headlines = [card["payload"]["headline"] for card in body["cards"]]
    # J-36 prototype lands 2028-Q2; the plaaf_j36_sighting template should fire
    # at least once over the 30+ eligible turns. Guard with OR for the
    # roadmap-driven 2031-Q2 card too.
    assert any("J-36" in h or "j36" in h for h in headlines), \
        "expected at least one J-36 intel card over 10 years"
