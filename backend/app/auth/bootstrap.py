"""One-time, idempotent migrations to make a pre-auth SQLite database usable:
add the new campaigns.user_id column (create_all does NOT alter existing
tables), ensure an owner user exists, and adopt any campaigns that predate
auth (user_id IS NULL)."""
import logging

from sqlalchemy import inspect, text
from sqlalchemy.engine import Engine
from sqlalchemy.orm import Session

from app.models.user import User
from app.models.campaign import Campaign

logger = logging.getLogger(__name__)


def ensure_user_id_column(engine: Engine) -> None:
    """Add campaigns.user_id to a legacy DB that was created before auth.

    SQLAlchemy's `create_all` creates missing tables (so the new `users`
    table appears automatically) but never alters an existing table, so an
    older `campaigns` table is missing `user_id`. SQLite supports
    `ALTER TABLE ... ADD COLUMN`; this is idempotent (no-op once present).
    """
    inspector = inspect(engine)
    if "campaigns" not in inspector.get_table_names():
        return  # fresh DB; create_all will build campaigns with user_id
    columns = {col["name"] for col in inspector.get_columns("campaigns")}
    if "user_id" in columns:
        return
    with engine.begin() as conn:
        conn.execute(text("ALTER TABLE campaigns ADD COLUMN user_id INTEGER"))
    logger.info("added campaigns.user_id column to legacy database")


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
