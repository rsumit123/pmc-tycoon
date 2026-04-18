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
from app.llm import client as llm_client
from app.llm.client import LLMResponse


@pytest.fixture
def client_and_stub(monkeypatch):
    eng = create_engine("sqlite:///:memory:", connect_args={"check_same_thread": False}, poolclass=StaticPool)
    Base.metadata.create_all(bind=eng)
    S = sessionmaker(bind=eng)

    def override_get_db():
        db = S()
        try:
            yield db
        finally:
            db.close()

    app.dependency_overrides[get_db] = override_get_db

    outputs = ["AAR paragraph one... Directorate note: _good work_",
               "brief.", "Sqn Ldr X 'Y'", "recap sentence.", "retro body."]
    def fake(messages, **kw):
        return LLMResponse(text=outputs.pop(0), model="stub",
                           prompt_tokens=1, completion_tokens=2)
    monkeypatch.setattr(llm_service, "chat_completion", fake)

    yield TestClient(app), S
    app.dependency_overrides.clear()
    Base.metadata.drop_all(bind=eng)


def _seed_campaign_with_resolved_vignette(client: TestClient, S) -> tuple[int, int, int]:
    created = client.post("/api/campaigns", json={
        "name": "t", "difficulty": "realistic", "objectives": [], "seed": 42,
    }).json()
    campaign_id = created["id"]
    # Force a resolved vignette directly via DB
    db = S()
    from app.models.vignette import Vignette
    from app.models.squadron import Squadron
    sqs = db.query(Squadron).filter_by(campaign_id=campaign_id).all()
    sq_id = sqs[0].id
    v = Vignette(
        campaign_id=campaign_id, year=2026, quarter=2, scenario_id="sc1",
        status="resolved",
        planning_state={"scenario_name": "Scen", "ao": {"name": "A"},
                        "adversary_force": [{"role": "CAP", "faction": "PLAAF",
                                             "platform_id": "j20a", "count": 6, "loadout": []}]},
        committed_force={"squadrons": [{"squadron_id": sq_id, "name": sqs[0].name,
                                         "platform_id": sqs[0].platform_id, "airframes": 8}],
                         "support": {"awacs": True, "tanker": True, "sead_package": False},
                         "roe": "weapons_free"},
        event_trace=[{"t_min": 0, "kind": "detection", "side": "IND", "detail": "ok"}],
        aar_text="",
        outcome={"adv_kia": 5, "ind_airframes_lost": 0, "ind_kia": 0,
                 "adv_airframes_lost": 5, "objective_met": True, "aar_stub": "win"},
        resolved_at=datetime.now(UTC),
    )
    db.add(v); db.commit()
    vig_id = v.id
    db.close()
    return campaign_id, vig_id, sq_id


def test_generate_aar_endpoint(client_and_stub):
    client, S = client_and_stub
    campaign_id, vig_id, _ = _seed_campaign_with_resolved_vignette(client, S)

    r = client.post(f"/api/campaigns/{campaign_id}/vignettes/{vig_id}/aar")
    assert r.status_code == 200
    body = r.json()
    assert "Directorate note" in body["text"]
    assert body["cached"] is False

    r2 = client.post(f"/api/campaigns/{campaign_id}/vignettes/{vig_id}/aar")
    assert r2.status_code == 200
    assert r2.json()["cached"] is True


def test_generate_ace_name_endpoint(client_and_stub):
    client, S = client_and_stub
    campaign_id, vig_id, sq_id = _seed_campaign_with_resolved_vignette(client, S)
    # First trigger AAR so outputs[0] is consumed; then ace is outputs[2]
    client.post(f"/api/campaigns/{campaign_id}/vignettes/{vig_id}/aar")
    # intel brief endpoint will consume outputs[1]
    client.post(f"/api/campaigns/{campaign_id}/intel-briefs/generate")
    r = client.post(f"/api/campaigns/{campaign_id}/vignettes/{vig_id}/ace-name")
    assert r.status_code == 200
    assert r.json()["text"].startswith("Sqn Ldr")


def test_ineligible_returns_409(client_and_stub):
    client, S = client_and_stub
    created = client.post("/api/campaigns", json={
        "name": "t2", "difficulty": "realistic", "objectives": [], "seed": 9,
    }).json()
    r = client.post(f"/api/campaigns/{created['id']}/retrospective")
    assert r.status_code == 409


def test_list_narratives_endpoint(client_and_stub):
    client, S = client_and_stub
    campaign_id, vig_id, _ = _seed_campaign_with_resolved_vignette(client, S)
    client.post(f"/api/campaigns/{campaign_id}/vignettes/{vig_id}/aar")
    r = client.get(f"/api/campaigns/{campaign_id}/narratives")
    assert r.status_code == 200
    body = r.json()
    assert len(body["narratives"]) == 1
    assert body["narratives"][0]["kind"] == "aar"
