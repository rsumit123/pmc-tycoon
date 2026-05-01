from sqlalchemy import create_engine
from sqlalchemy.orm import sessionmaker
from sqlalchemy.pool import StaticPool

from app.db.base import Base
from app.schemas.campaign import CampaignCreate
from app.crud.campaign import create_campaign, advance_turn
from app.models.diplomatic_state import DiplomaticState


def _db():
    engine = create_engine("sqlite://", connect_args={"check_same_thread": False}, poolclass=StaticPool)
    Base.metadata.create_all(engine)
    return sessionmaker(bind=engine)


def test_diplomacy_drift_advance():
    s = _db()()
    c = create_campaign(s, CampaignCreate(name="t", difficulty="realistic", objectives=["defend_punjab"]))
    rows_before = {r.faction: r.temperature_pct for r in
                   s.query(DiplomaticState).filter_by(campaign_id=c.id).all()}
    advance_turn(s, c)
    s.commit()
    rows_after = {r.faction: r.temperature_pct for r in
                  s.query(DiplomaticState).filter_by(campaign_id=c.id).all()}
    # PAF starts at 25 (cool), drifts +2 → 27.
    assert rows_after["PAF"] == rows_before["PAF"] + 2
