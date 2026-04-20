"""Campaign lifecycle helpers — shared across mutation endpoints."""
from fastapi import HTTPException, status

from app.models.campaign import Campaign


def is_campaign_complete(campaign: Campaign) -> bool:
    return campaign.current_year > 2036 or (
        campaign.current_year == 2036 and campaign.current_quarter > 1
    )


def require_active_campaign(campaign: Campaign) -> None:
    """Raise 409 if the campaign is past its final turn.

    Read-only endpoints (GET, LLM narrative generation for reflection,
    export, delete) do not call this. Mutations on a completed campaign
    are rejected so the player's final score / force state stays frozen.
    """
    if is_campaign_complete(campaign):
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail="campaign is complete — no further actions allowed",
        )
