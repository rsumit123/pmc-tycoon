# backend/tests/test_llm_service.py
from datetime import datetime
from sqlalchemy import create_engine
from sqlalchemy.orm import sessionmaker
from sqlalchemy.pool import StaticPool
import pytest

from app.db.base import Base
import app.models  # noqa: F401
from app.models.campaign import Campaign
from app.models.vignette import Vignette
from app.models.adversary import AdversaryState
from app.models.intel import IntelCard
from app.models.squadron import Squadron
from app.models.campaign_narrative import CampaignNarrative
from app.llm import service
from app.llm.client import LLMResponse


@pytest.fixture
def session():
    eng = create_engine("sqlite:///:memory:", connect_args={"check_same_thread": False}, poolclass=StaticPool)
    Base.metadata.create_all(bind=eng)
    S = sessionmaker(bind=eng)
    yield S()
    Base.metadata.drop_all(bind=eng)


def _stub(monkeypatch, text="stub narrative"):
    calls = []
    def fake(messages, **kw):
        calls.append(messages)
        return LLMResponse(text=text, model="stub",
                           prompt_tokens=1, completion_tokens=2)
    monkeypatch.setattr(service, "chat_completion", fake)
    return calls


def _campaign(session):
    c = Campaign(name="t", seed=1, starting_year=2026, starting_quarter=2,
                 current_year=2030, current_quarter=1, difficulty="realistic",
                 objectives_json=[], budget_cr=1000)
    session.add(c); session.commit()
    return c


def test_generate_aar_idempotent(session, monkeypatch):
    c = _campaign(session)
    v = Vignette(
        campaign_id=c.id, year=2029, quarter=3, scenario_id="lac_air_incursion_limited",
        status="resolved",
        planning_state={
            "scenario_name": "LAC Air Incursion (Limited)",
            "ao": {"region": "lac_western", "name": "Ladakh", "lat": 34.0, "lon": 78.5},
            "response_clock_minutes": 45,
            "adversary_force": [{"role": "CAP", "faction": "PLAAF", "platform_id": "j20a", "count": 6, "loadout": []}],
            "eligible_squadrons": [], "allowed_ind_roles": [], "roe_options": [],
            "objective": {"kind": "defend_airspace", "success_threshold": {}},
        },
        committed_force={"squadrons": [{"squadron_id": 17, "name": "17 Sqn",
                                        "platform_id": "rafale_f4", "airframes": 8}],
                         "support": {"awacs": True, "tanker": True, "sead_package": False},
                         "roe": "weapons_free"},
        event_trace=[{"t_min": 0, "kind": "detection", "side": "IND", "detail": "ok"}],
        aar_text="",
        outcome={"ind_kia": 0, "adv_kia": 4, "ind_airframes_lost": 0,
                 "adv_airframes_lost": 4, "objective_met": True, "aar_stub": "win"},
        resolved_at=datetime.utcnow(),
    )
    session.add(v); session.commit()

    calls = _stub(monkeypatch, text="A crisp AAR.")
    text, cached = service.generate_aar(session, c, v)
    assert text == "A crisp AAR."
    assert cached is False
    # Vignette.aar_text was populated
    session.refresh(v)
    assert v.aar_text == "A crisp AAR."
    # CampaignNarrative row was written
    row = session.query(CampaignNarrative).filter_by(
        campaign_id=c.id, kind="aar", subject_id=f"vig-{v.id}").one()
    assert row.text == "A crisp AAR."

    # Second call should cache-hit — no additional LLM call
    text2, cached2 = service.generate_aar(session, c, v)
    assert text2 == "A crisp AAR."
    assert cached2 is True
    assert len(calls) == 1


def test_generate_ace_name_requires_notable_win(session, monkeypatch):
    c = _campaign(session)
    sq = Squadron(campaign_id=c.id, name="17 Sqn", platform_id="rafale_f4",
                  base_id=1, strength=16, readiness_pct=80, xp=0)
    session.add(sq); session.commit()
    v = Vignette(
        campaign_id=c.id, year=2029, quarter=3, scenario_id="sc1",
        status="resolved", planning_state={}, committed_force={"squadrons": [
            {"squadron_id": sq.id, "name": sq.name, "platform_id": sq.platform_id, "airframes": 8}]},
        event_trace=[], aar_text="", outcome={
            "adv_kia": 2, "ind_airframes_lost": 3, "objective_met": True},
    )
    session.add(v); session.commit()

    _stub(monkeypatch, text="Sqn Ldr Rao 'Vajra'")
    with pytest.raises(service.NarrativeIneligibleError):
        service.generate_ace_name(session, c, v)

    # Now upgrade the outcome to notable
    v.outcome = {"adv_kia": 5, "ind_airframes_lost": 0, "objective_met": True}
    session.commit()
    text, cached = service.generate_ace_name(session, c, v)
    assert text.startswith("Sqn Ldr")
    session.refresh(sq)
    assert sq.ace_name == "Sqn Ldr Rao 'Vajra'"
    assert sq.ace_awarded_year == v.year
    assert sq.ace_awarded_quarter == v.quarter


def test_generate_year_recap_requires_closed_year(session, monkeypatch):
    c = _campaign(session)  # current_year=2030
    _stub(monkeypatch, text="one line recap.")
    with pytest.raises(service.NarrativeIneligibleError):
        service.generate_year_recap(session, c, year=2030)  # not yet closed
    text, cached = service.generate_year_recap(session, c, year=2029)
    assert text == "one line recap."


def test_generate_retrospective_requires_q40_done(session, monkeypatch):
    c = _campaign(session)  # current_year=2030 → ineligible
    _stub(monkeypatch, text="retro.")
    with pytest.raises(service.NarrativeIneligibleError):
        service.generate_retrospective(session, c)
    c.current_year, c.current_quarter = 2036, 2
    session.commit()
    text, cached = service.generate_retrospective(session, c)
    assert text == "retro."


def test_generate_intel_brief_eligibility(session, monkeypatch):
    c = _campaign(session)
    # Seed one adversary state row so the prompt has something to say
    session.add(AdversaryState(campaign_id=c.id, faction="PLAAF",
                                state={"doctrine_tier": "x", "inventory": {}, "recent_events": []}))
    session.commit()
    _stub(monkeypatch, text="brief.")
    text, cached = service.generate_intel_brief(session, c)
    assert text == "brief."
    # Second immediate call is cache-hit (same current quarter → same subject_id)
    text2, cached2 = service.generate_intel_brief(session, c)
    assert cached2 is True
