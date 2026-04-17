from sqlalchemy.orm import Session

from app.models.vignette import Vignette


def list_pending_vignettes(db: Session, campaign_id: int) -> list[Vignette]:
    return db.query(Vignette).filter(
        Vignette.campaign_id == campaign_id,
        Vignette.status == "pending",
    ).order_by(Vignette.year.desc(), Vignette.quarter.desc(), Vignette.id.desc()).all()


def get_vignette(db: Session, campaign_id: int, vignette_id: int) -> Vignette | None:
    return db.query(Vignette).filter(
        Vignette.campaign_id == campaign_id,
        Vignette.id == vignette_id,
    ).first()
