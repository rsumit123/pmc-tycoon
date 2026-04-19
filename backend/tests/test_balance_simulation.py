"""40-turn balance simulation — sanity checks for expanded content."""
import pytest
from sqlalchemy import create_engine
from sqlalchemy.orm import sessionmaker
from sqlalchemy.pool import StaticPool

from app.db.base import Base
import app.models  # noqa: F401
from app.schemas.campaign import CampaignCreate
from app.crud.campaign import create_campaign, advance_turn
from app.crud.vignette import list_pending_vignettes, commit_vignette
from app.models.vignette import Vignette
from app.models.adversary import AdversaryState


@pytest.fixture
def db():
    engine = create_engine(
        "sqlite:///:memory:",
        connect_args={"check_same_thread": False},
        poolclass=StaticPool,
    )
    Base.metadata.create_all(engine)
    Session = sessionmaker(autocommit=False, autoflush=False, bind=engine)
    session = Session()
    yield session
    session.close()


def test_40_turn_simulation_sanity(db):
    """Run 40 turns with default settings and check balance invariants."""
    payload = CampaignCreate(name="balance", seed=12345)
    campaign = create_campaign(db, payload)
    # seed_starting_state is already called inside create_campaign

    for _ in range(40):
        # Auto-commit any pending vignettes before advancing so backpressure
        # doesn't block further vignette generation.
        for v in list_pending_vignettes(db, campaign.id):
            ps = v.planning_state or {}
            eligible = ps.get("eligible_squadrons", [])
            roe_options = ps.get("roe_options", [])
            # Pick the first in-range (tier A) squadron — tier B/C now require
            # tanker support / are hard-blocked, so an unconditional eligible[0]
            # would fail commit validation on far-AO scenarios.
            pick = next((s for s in eligible if s.get("range_tier") == "A"), None)
            committed_force = {
                "squadrons": [
                    {
                        "squadron_id": pick["squadron_id"],
                        "airframes": 1,
                    }
                ] if pick else [],
                "roe": roe_options[0] if roe_options else "defensive",
                "support_awacs": False,
                "support_tanker": False,
                "support_ew": False,
            }
            commit_vignette(db, campaign, v, committed_force)
        campaign = advance_turn(db, campaign)

    db.refresh(campaign)
    assert campaign.current_year == 2036
    assert campaign.current_quarter == 2

    # Budget should not spiral absurdly negative
    assert campaign.budget_cr > -500000, f"Budget spiraled to {campaign.budget_cr}"

    # Count vignettes that fired
    vignettes = db.query(Vignette).filter_by(campaign_id=campaign.id).all()
    # Expect some vignettes over 40 turns (threat curve 0.15→0.55)
    assert len(vignettes) >= 3, f"Too few vignettes: {len(vignettes)}"
    assert len(vignettes) <= 35, f"Too many vignettes: {len(vignettes)}"

    # Adversary should have grown
    plaaf = (
        db.query(AdversaryState)
        .filter_by(campaign_id=campaign.id, faction="PLAAF")
        .first()
    )
    assert plaaf is not None
    # AdversaryState.state is a dict with nested structure; inventory lives under state["inventory"]
    inventory = plaaf.state.get("inventory", {}) if plaaf.state else {}
    j20a_count = inventory.get("j20a", 0)
    assert j20a_count > 500, f"PLAAF J-20A count should have grown: {j20a_count}"
