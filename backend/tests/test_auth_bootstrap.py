from sqlalchemy import create_engine
from sqlalchemy.orm import sessionmaker
from sqlalchemy.pool import StaticPool

from app.db.base import Base
import app.models  # noqa: F401
from app.models.user import User
from app.models.campaign import Campaign
from app.auth.bootstrap import ensure_owner_and_backfill


def _session():
    engine = create_engine("sqlite:///:memory:", connect_args={"check_same_thread": False}, poolclass=StaticPool)
    Base.metadata.create_all(bind=engine)
    return sessionmaker(bind=engine)()


def test_creates_owner_and_backfills_null_campaigns():
    db = _session()
    db.add(Campaign(name="orphan", seed=1, starting_year=2026, starting_quarter=1, current_year=2026,
                    current_quarter=1, difficulty="realistic", objectives_json=[], budget_cr=45000, user_id=None))
    db.commit()

    ensure_owner_and_backfill(db, owner_email="owner@x.com")

    owner = db.query(User).filter_by(email="owner@x.com").one()
    assert owner.auth_provider == "google"
    assert db.query(Campaign).one().user_id == owner.id


def test_idempotent():
    db = _session()
    ensure_owner_and_backfill(db, owner_email="owner@x.com")
    ensure_owner_and_backfill(db, owner_email="owner@x.com")
    assert db.query(User).filter_by(email="owner@x.com").count() == 1
