"""OpenRouter HTTP client. Thin sync wrapper over /chat/completions.

Tests override `_transport_factory` to inject an httpx.MockTransport so
we never hit the real network. Production calls build a real httpx.Client.
"""
from __future__ import annotations

from dataclasses import dataclass
from typing import Any
import random as _random
import time

import httpx

from app.core.config import settings


OPENROUTER_URL = "https://openrouter.ai/api/v1/chat/completions"
DEFAULT_MAX_TOKENS = 1200
DEFAULT_TEMPERATURE = 0.7
TIMEOUT_SECONDS = 60.0

MAX_RETRIES = 1
JITTER_MIN = 1.0
JITTER_MAX = 3.0


class LLMRequestError(RuntimeError):
    """Programmer/config error — bad request body, missing key, 4xx response."""


class LLMUnavailableError(RuntimeError):
    """Transient upstream error — OpenRouter 5xx / network. API layer returns 502."""


@dataclass
class LLMResponse:
    text: str
    model: str
    prompt_tokens: int
    completion_tokens: int


def _transport_factory() -> httpx.BaseTransport | None:
    """Overridden by tests to inject MockTransport. None → default httpx network."""
    return None


def _do_request(
    body: dict[str, Any],
    headers: dict[str, str],
    transport: httpx.BaseTransport | None,
) -> httpx.Response:
    """Execute a single HTTP request to OpenRouter. Raises LLMUnavailableError on network errors."""
    client_kwargs: dict[str, Any] = {"timeout": TIMEOUT_SECONDS}
    if transport is not None:
        client_kwargs["transport"] = transport
    try:
        with httpx.Client(**client_kwargs) as client:
            return client.post(OPENROUTER_URL, json=body, headers=headers)
    except httpx.RequestError as e:
        raise LLMUnavailableError(f"OpenRouter transport error: {e}") from e


def chat_completion(
    messages: list[dict],
    *,
    model: str | None = None,
    max_tokens: int = DEFAULT_MAX_TOKENS,
    temperature: float = DEFAULT_TEMPERATURE,
) -> LLMResponse:
    if not settings.openrouter_api_key:
        raise LLMRequestError("OPENROUTER_API_KEY is empty — set it in backend/.env")

    resolved_model = model or settings.openrouter_model
    body: dict[str, Any] = {
        "model": resolved_model,
        "messages": messages,
        "max_tokens": max_tokens,
        "temperature": temperature,
    }
    headers = {
        "Authorization": f"Bearer {settings.openrouter_api_key}",
        "Content-Type": "application/json",
        "HTTP-Referer": "https://pmc-tycoon.skdev.one",
        "X-Title": "Sovereign Shield",
    }

    transport = _transport_factory()

    last_error: LLMUnavailableError | None = None
    r: httpx.Response | None = None

    for attempt in range(MAX_RETRIES + 1):
        try:
            r = _do_request(body, headers, transport)
        except LLMUnavailableError as e:
            last_error = e
            if attempt < MAX_RETRIES:
                time.sleep(_random.uniform(JITTER_MIN, JITTER_MAX))
                continue
            raise

        if r.status_code >= 500:
            last_error = LLMUnavailableError(f"OpenRouter {r.status_code}: {r.text[:200]}")
            if attempt < MAX_RETRIES:
                time.sleep(_random.uniform(JITTER_MIN, JITTER_MAX))
                continue
            raise last_error

        if r.status_code >= 400:
            raise LLMRequestError(f"OpenRouter {r.status_code}: {r.text[:200]}")

        # Success — exit retry loop
        break

    assert r is not None
    data = r.json()
    try:
        text = data["choices"][0]["message"]["content"]
        usage = data.get("usage", {})
    except (KeyError, IndexError, TypeError) as e:
        raise LLMRequestError(f"Unexpected OpenRouter response shape: {data!r}") from e

    return LLMResponse(
        text=text,
        model=resolved_model,
        prompt_tokens=int(usage.get("prompt_tokens", 0)),
        completion_tokens=int(usage.get("completion_tokens", 0)),
    )
