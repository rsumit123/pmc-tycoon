import pytest
import httpx

from app.llm import client as llm_client
from app.llm.client import (
    chat_completion, LLMResponse, LLMUnavailableError, LLMRequestError,
)


def _mock_transport(status: int, body: dict):
    def handler(request: httpx.Request) -> httpx.Response:
        return httpx.Response(status, json=body)
    return httpx.MockTransport(handler)


def test_chat_completion_happy_path(monkeypatch):
    body = {
        "choices": [{"message": {"content": "hello world"}}],
        "usage": {"prompt_tokens": 7, "completion_tokens": 3},
    }
    monkeypatch.setattr(llm_client, "_transport_factory",
                        lambda: _mock_transport(200, body))
    monkeypatch.setattr(llm_client.settings, "openrouter_api_key", "sk-test")

    resp = chat_completion([{"role": "user", "content": "hi"}])
    assert isinstance(resp, LLMResponse)
    assert resp.text == "hello world"
    assert resp.prompt_tokens == 7
    assert resp.completion_tokens == 3
    assert resp.model  # resolved from settings


def test_chat_completion_missing_key(monkeypatch):
    monkeypatch.setattr(llm_client.settings, "openrouter_api_key", "")
    with pytest.raises(LLMRequestError, match="OPENROUTER_API_KEY"):
        chat_completion([{"role": "user", "content": "hi"}])


def test_chat_completion_5xx_raises_unavailable(monkeypatch):
    monkeypatch.setattr(llm_client, "_transport_factory",
                        lambda: _mock_transport(503, {"error": "busy"}))
    monkeypatch.setattr(llm_client.settings, "openrouter_api_key", "sk-test")
    with pytest.raises(LLMUnavailableError):
        chat_completion([{"role": "user", "content": "hi"}])


def test_chat_completion_4xx_raises_request_error(monkeypatch):
    monkeypatch.setattr(llm_client, "_transport_factory",
                        lambda: _mock_transport(400, {"error": "bad"}))
    monkeypatch.setattr(llm_client.settings, "openrouter_api_key", "sk-test")
    with pytest.raises(LLMRequestError):
        chat_completion([{"role": "user", "content": "hi"}])
