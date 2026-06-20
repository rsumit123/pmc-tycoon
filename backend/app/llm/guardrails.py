"""Per-user daily generation cap + global daily token ceiling for LLM calls.

Financial safety net for open self-service signup: caps how many narratives a
single user can generate per UTC day, and pauses all generation once the global
daily token spend crosses a ceiling.
"""
from datetime import datetime, UTC

from sqlalchemy.orm import Session


class RateLimitedError(Exception):
    """Raised when a daily LLM limit is exceeded; API maps to HTTP 429."""


def _today_start() -> datetime:
    # NOTE: CampaignNarrative.created_at and LLMCache.created_at are declared as
    # plain `DateTime` (not timezone-aware). On SQLite the stored values come
    # back NAIVE (tzinfo stripped) even though they are written with
    # datetime.now(UTC). We return a NAIVE UTC midnight to match the stored
    # format and avoid aware/naive comparison surprises.
    now = datetime.now(UTC).replace(tzinfo=None)
    return datetime(now.year, now.month, now.day)


def _user_generations_today(db: Session, user_id: int) -> int:
    from app.models.campaign_narrative import CampaignNarrative
    from app.models.campaign import Campaign
    return (db.query(CampaignNarrative)
              .join(Campaign, Campaign.id == CampaignNarrative.campaign_id)
              .filter(Campaign.user_id == user_id,
                      CampaignNarrative.created_at >= _today_start())
              .count())


def _tokens_today(db: Session) -> int:
    # LLMCache has no single `total_tokens` column; it splits usage into
    # `prompt_tokens` + `completion_tokens`. Sum both for the day's spend.
    from sqlalchemy import func
    from app.models.llm_cache import LLMCache
    total = (db.query(
                func.coalesce(func.sum(LLMCache.prompt_tokens), 0)
                + func.coalesce(func.sum(LLMCache.completion_tokens), 0))
               .filter(LLMCache.created_at >= _today_start())
               .scalar())
    return int(total or 0)


def check_user_daily_cap(db: Session, user_id: int, cap: int) -> None:
    if _user_generations_today(db, user_id) >= cap:
        raise RateLimitedError("daily narrative limit reached")


def check_global_token_ceiling(db: Session, ceiling: int) -> None:
    if _tokens_today(db) >= ceiling:
        raise RateLimitedError("narrative generation paused for today")
