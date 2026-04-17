from sqlalchemy.orm import Session

from app.models.campaign_narrative import CampaignNarrative


def find_narrative(db: Session, campaign_id: int, kind: str,
                   subject_id: str | None) -> CampaignNarrative | None:
    return db.query(CampaignNarrative).filter(
        CampaignNarrative.campaign_id == campaign_id,
        CampaignNarrative.kind == kind,
        CampaignNarrative.subject_id == subject_id,
    ).first()


def write_narrative(db: Session, *, campaign_id: int, kind: str,
                    year: int, quarter: int, subject_id: str | None,
                    text: str, prompt_version: str, input_hash: str) -> CampaignNarrative:
    row = CampaignNarrative(
        campaign_id=campaign_id, kind=kind, year=year, quarter=quarter,
        subject_id=subject_id, text=text,
        prompt_version=prompt_version, input_hash=input_hash,
    )
    db.add(row)
    db.flush()
    return row


def list_narratives(db: Session, campaign_id: int,
                    kind: str | None = None) -> list[CampaignNarrative]:
    q = db.query(CampaignNarrative).filter(CampaignNarrative.campaign_id == campaign_id)
    if kind is not None:
        q = q.filter(CampaignNarrative.kind == kind)
    return q.order_by(CampaignNarrative.created_at.asc()).all()
