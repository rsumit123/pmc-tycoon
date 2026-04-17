from sqlalchemy import create_engine
from sqlalchemy.orm import sessionmaker
from sqlalchemy.pool import StaticPool
import pytest

from app.db.base import Base
import app.models  # noqa: F401
from app.models.llm_cache import LLMCache
from app.llm.cache import get_or_generate
from app.llm.client import LLMResponse


@pytest.fixture
def session():
    eng = create_engine("sqlite:///:memory:", connect_args={"check_same_thread": False}, poolclass=StaticPool)
    Base.metadata.create_all(bind=eng)
    S = sessionmaker(bind=eng)
    yield S()
    Base.metadata.drop_all(bind=eng)


def test_cache_miss_calls_client_and_stores(session, monkeypatch):
    calls = []
    def fake_chat(messages, **kw):
        calls.append(messages)
        return LLMResponse(text="generated prose", model="m1",
                           prompt_tokens=5, completion_tokens=12)
    text, cached = get_or_generate(
        session,
        cache_key="k" * 64,
        prompt_kind="aar", prompt_version="v1",
        build_messages=lambda: [{"role": "user", "content": "hi"}],
        chat_completion_fn=fake_chat,
    )
    assert text == "generated prose"
    assert cached is False
    assert len(calls) == 1
    row = session.query(LLMCache).filter_by(cache_key="k" * 64).one()
    assert row.output_text == "generated prose"


def test_cache_hit_skips_client(session):
    session.add(LLMCache(cache_key="k" * 64, prompt_kind="aar", prompt_version="v1",
                         model="m1", output_text="cached prose",
                         prompt_tokens=0, completion_tokens=0))
    session.commit()

    def fake_chat(messages, **kw):
        raise AssertionError("should not be called on cache hit")

    text, cached = get_or_generate(
        session,
        cache_key="k" * 64,
        prompt_kind="aar", prompt_version="v1",
        build_messages=lambda: [{"role": "user", "content": "hi"}],
        chat_completion_fn=fake_chat,
    )
    assert text == "cached prose"
    assert cached is True
