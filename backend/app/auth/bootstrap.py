"""One-time, idempotent migration: ensure an owner user exists and adopt any
campaigns that predate auth (user_id IS NULL)."""
import logging

from sqlalchemy.orm import Session

from app.models.user import User
from app.models.campaign import Campaign

logger = logging.getLogger(__name__)


def ensure_owner_and_backfill(db: Session, owner_email: str) -> None:
    owner = db.query(User).filter(User.email == owner_email).first()
    if owner is None:
        owner = User(email=owner_email, auth_provider="google",
                     display_name=owner_email.split("@")[0])
        db.add(owner)
        db.commit()
        db.refresh(owner)
        logger.info("created owner user %s", owner_email)

    orphans = db.query(Campaign).filter(Campaign.user_id.is_(None)).all()
    if orphans:
        for c in orphans:
            c.user_id = owner.id
        db.commit()
        logger.info("backfilled %d orphan campaigns to owner", len(orphans))
