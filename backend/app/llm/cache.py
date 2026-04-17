"""Content-hash read-through cache for LLM responses."""
from __future__ import annotations

from typing import Callable

from sqlalchemy.orm import Session

from app.models.llm_cache import LLMCache
from app.llm.client import chat_completion as default_chat_completion, LLMResponse


def get_or_generate(
    db: Session,
    *,
    cache_key: str,
    prompt_kind: str,
    prompt_version: str,
    build_messages: Callable[[], list[dict]],
    chat_completion_fn: Callable[..., LLMResponse] = default_chat_completion,
    model: str | None = None,
) -> tuple[str, bool]:
    """Return (text, cached_bool). Hit → existing row's text. Miss → call LLM, persist, return."""
    row = db.query(LLMCache).filter(LLMCache.cache_key == cache_key).first()
    if row is not None:
        return row.output_text, True

    messages = build_messages()
    resp = chat_completion_fn(messages, model=model)

    db.add(LLMCache(
        cache_key=cache_key,
        prompt_kind=prompt_kind,
        prompt_version=prompt_version,
        model=resp.model,
        output_text=resp.text,
        prompt_tokens=resp.prompt_tokens,
        completion_tokens=resp.completion_tokens,
    ))
    db.flush()
    return resp.text, False
