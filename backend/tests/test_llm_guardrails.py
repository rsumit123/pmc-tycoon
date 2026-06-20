import pytest

from app.llm import guardrails


def test_user_cap_blocks_over_limit(monkeypatch):
    monkeypatch.setattr(guardrails, "_user_generations_today", lambda db, user_id: 40)
    with pytest.raises(guardrails.RateLimitedError):
        guardrails.check_user_daily_cap(db=None, user_id=1, cap=40)


def test_user_cap_allows_under_limit(monkeypatch):
    monkeypatch.setattr(guardrails, "_user_generations_today", lambda db, user_id: 10)
    guardrails.check_user_daily_cap(db=None, user_id=1, cap=40)  # no raise


def test_global_ceiling_blocks(monkeypatch):
    monkeypatch.setattr(guardrails, "_tokens_today", lambda db: 2_000_001)
    with pytest.raises(guardrails.RateLimitedError):
        guardrails.check_global_token_ceiling(db=None, ceiling=2_000_000)


def test_global_ceiling_allows(monkeypatch):
    monkeypatch.setattr(guardrails, "_tokens_today", lambda db: 5)
    guardrails.check_global_token_ceiling(db=None, ceiling=2_000_000)  # no raise
