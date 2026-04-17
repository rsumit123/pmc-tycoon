"""Tests for R&D program state UniqueConstraint."""
import pytest
from sqlalchemy import create_engine
from sqlalchemy.orm import sessionmaker
from sqlalchemy.pool import StaticPool
from sqlalchemy.exc import IntegrityError
from app.db.base import Base
from app.models.rd_program import RDProgramState


@pytest.fixture
def db():
    engine = create_engine("sqlite://", poolclass=StaticPool)
    Base.metadata.create_all(engine)
    Session = sessionmaker(bind=engine)
    session = Session()
    yield session
    session.close()


def test_unique_constraint_prevents_duplicate(db):
    state1 = RDProgramState(campaign_id=1, program_id="amca_mk1", status="active", progress_pct=0, funding_level="standard", cost_invested_cr=0)
    db.add(state1)
    db.flush()

    state2 = RDProgramState(campaign_id=1, program_id="amca_mk1", status="active", progress_pct=50, funding_level="standard", cost_invested_cr=1000)
    db.add(state2)
    with pytest.raises(IntegrityError):
        db.flush()


def test_different_campaigns_allowed(db):
    state1 = RDProgramState(campaign_id=1, program_id="amca_mk1", status="active", progress_pct=0, funding_level="standard", cost_invested_cr=0)
    state2 = RDProgramState(campaign_id=2, program_id="amca_mk1", status="active", progress_pct=0, funding_level="standard", cost_invested_cr=0)
    db.add_all([state1, state2])
    db.flush()
    assert True
