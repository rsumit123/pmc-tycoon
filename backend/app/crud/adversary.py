from sqlalchemy.orm import Session

from app.models.adversary import AdversaryState


def list_adversary_states(db: Session, campaign_id: int) -> list[AdversaryState]:
    return db.query(AdversaryState).filter(
        AdversaryState.campaign_id == campaign_id,
    ).order_by(AdversaryState.faction).all()
