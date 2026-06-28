"""Tests for the Story-mode 'stand down' decline path.

Story mode: decline=True → vignette resolves with stand_down=True, zero losses.
Non-story mode: decline=True → CommitValidationError raised.
"""
import pytest
from sqlalchemy import create_engine
from sqlalchemy.orm import sessionmaker
from sqlalchemy.pool import StaticPool

from app.db.base import Base
import app.models  # noqa: F401
from app.api.deps import get_db
from app.auth.deps import get_current_user
from app.models.user import User
from app.models.campaign import Campaign
from app.models.vignette import Vignette
from app.crud.vignette import commit_vignette, CommitValidationError
from main import app


# ---------------------------------------------------------------------------
# Shared fixture helpers
# ---------------------------------------------------------------------------

def _make_db():
    engine = create_engine(
        "sqlite:///:memory:",
        connect_args={"check_same_thread": False},
        poolclass=StaticPool,
    )
    TestingSessionLocal = sessionmaker(autocommit=False, autoflush=False, bind=engine)
    Base.metadata.create_all(bind=engine)
    return TestingSessionLocal


def _minimal_planning_state():
    """A minimal planning_state that satisfies commit_vignette's validation."""
    return {
        "scenario_id": "paf_f16_cap",
        "scenario_name": "Stand-down Test",
        "ao": {"region": "northwest", "name": "Test AO", "lat": 32.0, "lon": 74.0},
        "response_clock_minutes": 30,
        "adversary_force": [
            {"role": "cap", "faction": "PAF", "platform_id": "f16_block52",
             "count": 4, "loadout": ["aim120"]},
        ],
        "adversary_force_observed": [],
        "intel_quality": {"tier": "medium", "score": 0.5},
        "awacs_covering": [],
        "isr_covering": [],
        "eligible_squadrons": [],
        "allowed_ind_roles": ["CAP"],
        "roe_options": ["weapons_free", "weapons_tight"],
        "objective": {
            "kind": "defend_airspace",
            "success_threshold": {"adv_kills_min": 2, "ind_losses_max": 4},
        },
        "ad_batteries": [],
        "ad_specs": {},
        "bases_registry": {},
        "allows_no_cap": True,
    }


def _seed_campaign_and_vignette(db, difficulty: str):
    """Insert a Campaign + a pending Vignette directly; return (campaign, vignette)."""
    # Create a dummy user so the FK is satisfied if user_id is required.
    user = User(id=1, email="tester@example.com", auth_provider="password",
                display_name="Tester")
    db.add(user)
    db.flush()

    campaign = Campaign(
        name="Stand-down Test",
        difficulty=difficulty,
        seed=42,
        starting_year=2026,
        starting_quarter=1,
        current_year=2026,
        current_quarter=1,
        budget_cr=50000,
        quarterly_grant_cr=45000,
        offensive_unlocked=False,
        user_id=user.id,
    )
    db.add(campaign)
    db.flush()

    vignette = Vignette(
        campaign_id=campaign.id,
        year=2026,
        quarter=1,
        scenario_id="paf_f16_cap",
        status="pending",
        planning_state=_minimal_planning_state(),
    )
    db.add(vignette)
    db.commit()
    db.refresh(campaign)
    db.refresh(vignette)
    return campaign, vignette


# ---------------------------------------------------------------------------
# Test: Story mode — stand down succeeds
# ---------------------------------------------------------------------------

def test_stand_down_story_mode_succeeds():
    """Story difficulty: decline=True must resolve with stand_down=True, zero losses."""
    Session = _make_db()
    db = Session()
    try:
        campaign, vignette = _seed_campaign_and_vignette(db, "story")
        payload = {
            "squadrons": [],
            "support": {},
            "roe": "weapons_free",
            "decline": True,
        }
        resolved = commit_vignette(db, campaign, vignette, payload)

        assert resolved.status == "resolved"
        assert resolved.outcome["stand_down"] is True
        assert resolved.outcome["ind_kia"] == 0
        assert resolved.outcome["adv_kia"] == 0
        assert resolved.outcome["objective_met"] is False
        assert resolved.resolved_at is not None
    finally:
        db.close()


# ---------------------------------------------------------------------------
# Test: Non-story mode — stand down raises CommitValidationError
# ---------------------------------------------------------------------------

def test_stand_down_non_story_mode_rejected():
    """Non-story difficulty: decline=True must raise CommitValidationError."""
    Session = _make_db()
    db = Session()
    try:
        campaign, vignette = _seed_campaign_and_vignette(db, "realistic")
        payload = {
            "squadrons": [],
            "support": {},
            "roe": "weapons_free",
            "decline": True,
        }
        with pytest.raises(CommitValidationError):
            commit_vignette(db, campaign, vignette, payload)
    finally:
        db.close()
