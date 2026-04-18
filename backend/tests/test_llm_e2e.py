"""End-to-end: seed a campaign → advance → fabricate a resolved vignette →
hit each narrative endpoint → verify CampaignNarrative rows + Squadron
ace fields are populated, and second calls are cached."""

import pytest
from datetime import datetime, UTC
from fastapi.testclient import TestClient
from sqlalchemy import create_engine
from sqlalchemy.orm import sessionmaker
from sqlalchemy.pool import StaticPool

from app.db.base import Base
import app.models  # noqa: F401
from app.api.deps import get_db
from main import app
from app.llm import service as llm_service
from app.llm.client import LLMResponse


@pytest.fixture
def client_and_session(monkeypatch):
    eng = create_engine("sqlite:///:memory:", connect_args={"check_same_thread": False}, poolclass=StaticPool)
    Base.metadata.create_all(bind=eng)
    S = sessionmaker(bind=eng)

    def override_get_db():
        db = S()
        try: yield db
        finally: db.close()
    app.dependency_overrides[get_db] = override_get_db

    call_count = {"n": 0}
    def fake(messages, **kw):
        call_count["n"] += 1
        return LLMResponse(text=f"text-{call_count['n']}", model="stub",
                           prompt_tokens=1, completion_tokens=2)
    monkeypatch.setattr(llm_service, "chat_completion", fake)

    yield TestClient(app), S, call_count
    app.dependency_overrides.clear()
    Base.metadata.drop_all(bind=eng)


def test_full_narrative_flow(client_and_session):
    client, S, calls = client_and_session
    created = client.post("/api/campaigns", json={
        "name": "e2e", "difficulty": "realistic", "objectives": [], "seed": 11,
    }).json()
    cid = created["id"]

    # Advance a few turns so adversary state + current_year > 2026
    for _ in range(6):
        client.post(f"/api/campaigns/{cid}/advance")

    # Fabricate a resolved vignette
    db = S()
    from app.models.vignette import Vignette
    from app.models.squadron import Squadron
    sq = db.query(Squadron).filter_by(campaign_id=cid).first()
    sq_id = sq.id
    sq_name = sq.name
    sq_platform_id = sq.platform_id
    v = Vignette(
        campaign_id=cid, year=2026, quarter=3, scenario_id="sc",
        status="resolved",
        planning_state={"scenario_name": "S", "ao": {"name": "A"},
                        "adversary_force": []},
        committed_force={"squadrons": [{"squadron_id": sq_id, "name": sq_name,
                                         "platform_id": sq_platform_id,
                                         "airframes": 10}],
                         "support": {"awacs": False, "tanker": False, "sead_package": False},
                         "roe": "weapons_free"},
        event_trace=[],
        outcome={"adv_kia": 5, "ind_airframes_lost": 0, "ind_kia": 0,
                 "adv_airframes_lost": 5, "objective_met": True, "aar_stub": ""},
        aar_text="", resolved_at=datetime.now(UTC),
    )
    db.add(v); db.commit()
    vig_id = v.id
    db.close()

    # AAR
    r = client.post(f"/api/campaigns/{cid}/vignettes/{vig_id}/aar")
    assert r.status_code == 200 and r.json()["cached"] is False
    # Ace
    r = client.post(f"/api/campaigns/{cid}/vignettes/{vig_id}/ace-name")
    assert r.status_code == 200
    # Intel brief
    r = client.post(f"/api/campaigns/{cid}/intel-briefs/generate")
    assert r.status_code == 200
    # Year recap (year < current_year because advance pushed us past 2026)
    r = client.post(f"/api/campaigns/{cid}/year-recap/generate?year=2026")
    # After 6 advances from 2026-Q2, we're at 2027-Q4 → 2026 is closed.
    assert r.status_code == 200

    # Retrospective ineligible
    r = client.post(f"/api/campaigns/{cid}/retrospective")
    assert r.status_code == 409

    # List all narratives
    r = client.get(f"/api/campaigns/{cid}/narratives")
    assert r.status_code == 200
    kinds = {n["kind"] for n in r.json()["narratives"]}
    assert {"aar", "ace_name", "intel_brief", "year_recap"}.issubset(kinds)

    # Squadron.ace_name populated
    db = S()
    sq2 = db.query(Squadron).filter_by(campaign_id=cid, id=sq_id).one()
    assert sq2.ace_name is not None
    db.close()

    # Second AAR call is cached (no new LLM call)
    before = calls["n"]
    client.post(f"/api/campaigns/{cid}/vignettes/{vig_id}/aar")
    assert calls["n"] == before
