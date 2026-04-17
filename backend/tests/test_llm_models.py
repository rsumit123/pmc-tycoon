from datetime import datetime
from sqlalchemy import create_engine
from sqlalchemy.orm import sessionmaker
from sqlalchemy.pool import StaticPool
import pytest

from app.db.base import Base
import app.models  # noqa: F401
from app.models.llm_cache import LLMCache
from app.models.campaign_narrative import CampaignNarrative
from app.models.squadron import Squadron


@pytest.fixture
def session():
    eng = create_engine("sqlite:///:memory:", connect_args={"check_same_thread": False}, poolclass=StaticPool)
    Base.metadata.create_all(bind=eng)
    S = sessionmaker(bind=eng)
    yield S()
    Base.metadata.drop_all(bind=eng)


def test_llm_cache_roundtrip(session):
    row = LLMCache(
        cache_key="a" * 64, prompt_kind="aar", prompt_version="v1",
        model="anthropic/claude-haiku-4.5", output_text="hello",
        prompt_tokens=10, completion_tokens=20,
    )
    session.add(row); session.commit()
    fetched = session.query(LLMCache).filter_by(cache_key="a" * 64).one()
    assert fetched.output_text == "hello"
    assert fetched.prompt_tokens == 10


def test_campaign_narrative_unique_per_subject(session):
    from app.models.campaign import Campaign
    c = Campaign(name="t", seed=1, starting_year=2026, starting_quarter=2,
                 current_year=2026, current_quarter=2, difficulty="realistic",
                 objectives_json=[], budget_cr=0)
    session.add(c); session.commit()
    n1 = CampaignNarrative(campaign_id=c.id, kind="aar", year=2026, quarter=2,
                           subject_id="vig-1", text="first",
                           prompt_version="v1", input_hash="h1")
    session.add(n1); session.commit()
    n2 = CampaignNarrative(campaign_id=c.id, kind="aar", year=2026, quarter=2,
                           subject_id="vig-1", text="second",
                           prompt_version="v1", input_hash="h2")
    session.add(n2)
    with pytest.raises(Exception):
        session.commit()


def test_squadron_ace_fields_default_none():
    sq = Squadron(campaign_id=1, name="17 Sqn", platform_id="rafale_f4",
                  base_id=1, strength=16, readiness_pct=80, xp=0)
    assert sq.ace_name is None
    assert sq.ace_awarded_year is None
    assert sq.ace_awarded_quarter is None
