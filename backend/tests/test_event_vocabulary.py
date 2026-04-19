"""Pin down the canonical event_type strings the engine emits.

Future plans (Plan 5 LLM AAR, Plan 9 retrospective) read CampaignEvent
rows by event_type. If any subsystem silently renames an event_type
string this test fails fast — much better than discovering it during
retrospective generation.

Also pins the from-clock invariant: every event from one advance_turn
call must be tagged with the BEFORE-advance year/quarter, not the
AFTER. Plan 5 will read these in chronological order to narrate
"what happened during 2026-Q2" — they need to actually be tagged Q2,
not Q3.
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
from app.models.event import CampaignEvent


CANONICAL_EVENT_TYPES = {
    # campaign lifecycle
    "campaign_created",
    "turn_advanced",
    # R&D engine
    "rd_progressed",
    "rd_milestone",
    "rd_breakthrough",
    "rd_setback",
    "rd_completed",
    "rd_underfunded",
    # acquisition engine
    "acquisition_delivery",
    "acquisition_completed",
    "acquisition_underfunded",
    # readiness engine
    "readiness_changed",
    # adversary engine (Plan 3)
    "adversary_roadmap_event_applied",
    "adversary_doctrine_shifted",
    # intel engine (Plan 3)
    "intel_card_generated",
    "intel_underfilled",
    # vignette engine (Plan 4)
    "vignette_fired",
    "vignette_resolved",
    # LLM / narrative layer (Plan 5 — reserved, not auto-emitted in MVP)
    "narrative_generated",
    "ace_awarded",
    # loadout upgrade queue (Plan 15)
    "loadout_upgrade_complete",
}


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


def test_event_types_are_a_subset_of_the_canonical_vocabulary(client_with_session):
    """After a few turns of seeded gameplay, every event_type that lands in
    the DB must be one we've named in CANONICAL_EVENT_TYPES. New event
    types intentionally added by future plans should be registered here.
    """
    client, Session = client_with_session

    created = client.post("/api/campaigns", json={
        "name": "vocab", "difficulty": "realistic", "objectives": [],
        "seed": 1,
    }).json()
    campaign_id = created["id"]

    for _ in range(4):
        client.post(f"/api/campaigns/{campaign_id}/advance")

    db = Session()
    rows = db.query(CampaignEvent).filter(CampaignEvent.campaign_id == campaign_id).all()
    seen = {r.event_type for r in rows}
    unknown = seen - CANONICAL_EVENT_TYPES
    assert not unknown, (
        f"event_type(s) {unknown} not in CANONICAL_EVENT_TYPES — "
        "if intentionally added, register them in this test"
    )


def test_turn_events_use_from_clock_not_to_clock(client_with_session):
    """Events emitted during the engine's advance from Q2 to Q3 must be
    tagged year/quarter = 2026/2 (the FROM clock), not 2026/3.

    Plan 5 (LLM AAR) and Plan 9 (retrospective) read CampaignEvent
    chronologically and narrate "what happened during 2026-Q2" — the
    rows must actually be tagged Q2.
    """
    client, Session = client_with_session
    created = client.post("/api/campaigns", json={
        "name": "clock", "difficulty": "realistic", "objectives": [],
        "seed": 7,
    }).json()
    campaign_id = created["id"]

    # Campaign starts at 2026-Q2; one advance moves to 2026-Q3
    client.post(f"/api/campaigns/{campaign_id}/advance")

    db = Session()
    # All non-creation events from this advance should be tagged 2026-Q2
    turn_events = db.query(CampaignEvent).filter(
        CampaignEvent.campaign_id == campaign_id,
        CampaignEvent.event_type != "campaign_created",
    ).all()
    assert turn_events, "expected at least one event from the advance"
    for e in turn_events:
        assert (e.year, e.quarter) == (2026, 2), (
            f"event {e.event_type} tagged ({e.year}, {e.quarter}); "
            "expected (2026, 2) — the FROM clock"
        )
