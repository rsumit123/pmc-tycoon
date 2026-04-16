"""Seed the campaign with the historically-grounded 2026-Q2 starting state.

Plan 2 / Task 10 implements the full 2026-Q2 inheritance: bases,
named squadrons, MRFA Rafale F4, Tejas Mk1A contract, AMCA Mk1 R&D,
Astra Mk2 R&D nearing series production. This stub exists so
crud/campaign.py can import it before Task 10 lands.
"""

from sqlalchemy.orm import Session

from app.models.campaign import Campaign


def seed_starting_state(db: Session, campaign: Campaign) -> None:
    pass
