from sqlalchemy.orm import Session

from app.models.intel import IntelCard


def list_intel_cards(
    db: Session,
    campaign_id: int,
    year: int | None = None,
    quarter: int | None = None,
    source_type: str | None = None,
    limit: int = 100,
    offset: int = 0,
) -> tuple[int, list[IntelCard]]:
    q = db.query(IntelCard).filter(IntelCard.campaign_id == campaign_id)
    if year is not None:
        q = q.filter(IntelCard.appeared_year == year)
    if quarter is not None:
        q = q.filter(IntelCard.appeared_quarter == quarter)
    if source_type is not None:
        q = q.filter(IntelCard.source_type == source_type)
    total = q.count()
    cards = q.order_by(
        IntelCard.appeared_year.desc(),
        IntelCard.appeared_quarter.desc(),
        IntelCard.id.desc(),
    ).offset(offset).limit(limit).all()
    return total, cards
