from sqlalchemy import create_engine
from sqlalchemy.orm import sessionmaker
from sqlalchemy.pool import StaticPool

from app.db.base import Base
import app.models  # noqa: F401
from app.models.user import User
from app.models.campaign import Campaign


def _session():
    engine = create_engine("sqlite:///:memory:", connect_args={"check_same_thread": False}, poolclass=StaticPool)
    Base.metadata.create_all(bind=engine)
    return sessionmaker(bind=engine)()


def test_user_row_roundtrips():
    db = _session()
    u = User(email="a@b.com", google_id="g123", auth_provider="google", display_name="A")
    db.add(u)
    db.commit()
    got = db.query(User).filter_by(email="a@b.com").one()
    assert got.id is not None
    assert got.google_id == "g123"
    assert got.password_hash is None


def test_campaign_has_user_id_column():
    db = _session()
    u = User(email="c@d.com", auth_provider="password", password_hash="x", display_name="C")
    db.add(u)
    db.commit()
    c = Campaign(
        name="T", seed=1, starting_year=2026, starting_quarter=1,
        current_year=2026, current_quarter=1, difficulty="realistic",
        objectives_json=[], budget_cr=45000, user_id=u.id,
    )
    db.add(c)
    db.commit()
    assert db.query(Campaign).one().user_id == u.id
