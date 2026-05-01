from sqlalchemy import create_engine
from sqlalchemy.orm import sessionmaker
from sqlalchemy.pool import StaticPool

from app.db.base import Base
from app.schemas.campaign import CampaignCreate
from app.crud.campaign import create_campaign, advance_turn
from app.models.adversary_base import AdversaryBase
from app.models.base_damage import BaseDamage


def _db():
    engine = create_engine("sqlite://", connect_args={"check_same_thread": False}, poolclass=StaticPool)
    Base.metadata.create_all(engine)
    return sessionmaker(bind=engine)


def test_base_damage_decays_each_turn():
    s = _db()()
    c = create_campaign(s, CampaignCreate(name="t", difficulty="realistic", objectives=["defend_punjab"]))
    target = s.query(AdversaryBase).filter_by(campaign_id=c.id).first()
    s.add(BaseDamage(
        campaign_id=c.id, adversary_base_id=target.id,
        shelter_loss_pct=40, runway_disabled_quarters_remaining=2,
        ad_destroyed=False, garrisoned_loss=8,
    ))
    s.commit()
    advance_turn(s, c)
    s.commit()
    bd = s.query(BaseDamage).filter_by(campaign_id=c.id, adversary_base_id=target.id).first()
    assert bd.shelter_loss_pct == 30
    assert bd.runway_disabled_quarters_remaining == 1
    assert bd.garrisoned_loss == 6
