"""LLM client retries once on transient 5xx errors."""
import httpx
import pytest
from unittest.mock import patch

from app.llm.client import chat_completion, LLMUnavailableError


def _make_transport(responses: list[httpx.Response]):
    call_count = {"n": 0}
    def handler(request: httpx.Request) -> httpx.Response:
        idx = min(call_count["n"], len(responses) - 1)
        call_count["n"] += 1
        return responses[idx]
    return httpx.MockTransport(handler), call_count


def test_retries_once_on_502_then_succeeds():
    responses = [
        httpx.Response(502, text="Bad Gateway"),
        httpx.Response(200, json={
            "choices": [{"message": {"content": "ok"}}],
            "usage": {"prompt_tokens": 10, "completion_tokens": 5},
        }),
    ]
    transport, call_count = _make_transport(responses)
    with patch("app.llm.client._transport_factory", return_value=transport), \
         patch("app.llm.client.settings") as mock_settings, \
         patch("app.llm.client.time.sleep") as mock_sleep:
        mock_settings.openrouter_api_key = "test-key"
        mock_settings.openrouter_model = "test/model"
        result = chat_completion([{"role": "user", "content": "hi"}])
        assert result.text == "ok"
        assert call_count["n"] == 2
        mock_sleep.assert_called_once()
        jitter = mock_sleep.call_args[0][0]
        assert 1.0 <= jitter <= 3.0


def test_raises_after_two_consecutive_502s():
    responses = [
        httpx.Response(502, text="Bad Gateway"),
        httpx.Response(502, text="Bad Gateway again"),
    ]
    transport, call_count = _make_transport(responses)
    with patch("app.llm.client._transport_factory", return_value=transport), \
         patch("app.llm.client.settings") as mock_settings, \
         patch("app.llm.client.time.sleep"):
        mock_settings.openrouter_api_key = "test-key"
        mock_settings.openrouter_model = "test/model"
        with pytest.raises(LLMUnavailableError, match="502"):
            chat_completion([{"role": "user", "content": "hi"}])
        assert call_count["n"] == 2


def test_no_retry_on_400():
    responses = [httpx.Response(400, text="Bad request")]
    transport, call_count = _make_transport(responses)
    with patch("app.llm.client._transport_factory", return_value=transport), \
         patch("app.llm.client.settings") as mock_settings:
        mock_settings.openrouter_api_key = "test-key"
        mock_settings.openrouter_model = "test/model"
        from app.llm.client import LLMRequestError
        with pytest.raises(LLMRequestError, match="400"):
            chat_completion([{"role": "user", "content": "hi"}])
        assert call_count["n"] == 1
