"""
Tests that AdversaryState has a UniqueConstraint on (campaign_id, faction).
"""
import pytest
from sqlalchemy import create_engine
from sqlalchemy.orm import sessionmaker
from sqlalchemy.pool import StaticPool
from sqlalchemy.exc import IntegrityError

from app.db.base import Base
import app.models  # noqa: F401
from app.models.adversary import AdversaryState


@pytest.fixture
def db():
    engine = create_engine(
        "sqlite:///:memory:", connect_args={"check_same_thread": False}, poolclass=StaticPool,
    )
    Base.metadata.create_all(bind=engine)
    Session = sessionmaker(bind=engine)
    session = Session()
    yield session
    session.close()
    Base.metadata.drop_all(bind=engine)


def test_duplicate_campaign_faction_raises_integrity_error(db):
    db.add(AdversaryState(campaign_id=1, faction="PLAAF", state={"gen": 4}))
    db.flush()

    db.add(AdversaryState(campaign_id=1, faction="PLAAF", state={"gen": 5}))
    with pytest.raises(IntegrityError):
        db.flush()


def test_same_faction_different_campaign_is_allowed(db):
    db.add(AdversaryState(campaign_id=1, faction="PLAAF", state={"gen": 4}))
    db.add(AdversaryState(campaign_id=2, faction="PLAAF", state={"gen": 4}))
    db.flush()  # should not raise


def test_different_factions_same_campaign_is_allowed(db):
    db.add(AdversaryState(campaign_id=1, faction="PLAAF", state={"gen": 4}))
    db.add(AdversaryState(campaign_id=1, faction="PAF", state={"gen": 4}))
    db.flush()  # should not raise
