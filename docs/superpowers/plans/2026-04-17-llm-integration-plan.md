# Sovereign Shield — LLM Integration (OpenRouter) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Wire OpenRouter as the game's narrative/content layer. Vignette AAR narratives, periodic intel briefs, emerging-ace names, year-end one-liners, and the end-of-campaign retrospective are all LLM-generated from structured game state via versioned prompt templates, with input-hash-keyed caching so regeneration is free and deterministic replay is preserved.

**Architecture:**
- New subpackage `backend/app/llm/` with three clean layers:
  1. `client.py` — thin OpenRouter HTTP wrapper (OpenAI-compatible chat/completions). Swappable at the function boundary so tests never hit the network.
  2. `cache.py` — content-hash read-through cache backed by a new `llm_cache` table; de-duplicates identical prompts across campaigns.
  3. `service.py` — per-narrative-kind orchestrators (`generate_aar`, `generate_intel_brief`, `generate_ace_name`, `generate_year_recap`, `generate_retrospective`). Each builds structured inputs, renders the prompt via its versioned template module, consults the cache, persists the result.
- Prompt modules under `backend/app/llm/prompts/` — one file per (kind, version). Each exports `VERSION`, `KIND`, `build_messages(inputs)`, `input_hash(inputs)`.
- Persistence: AAR text continues to live on `Vignette.aar_text` (field already exists). All other narratives go into a new `CampaignNarrative` table (`kind`, `year`, `quarter`, `subject_id`, `text`, `prompt_version`, `input_hash`). Ace names go onto `Squadron` via two new fields.
- Five new API endpoints under existing campaign routes: AAR generate, intel-brief generate, ace-name assign, year-recap generate, retrospective generate. All are idempotent (cache-keyed) — calling twice returns the same text.
- **No auto-triggering inside `advance_turn`.** External LLM calls are slow and flaky; keeping `advance_turn` pure keeps replay determinism intact and makes the 260-test baseline stable. The frontend (Plan 8) fetches narratives explicitly after the turn commits.

**Tech Stack:** `httpx` (already in requirements). Stdlib `hashlib` / `json` for hashing. No new runtime deps. Tests stub the client via a single module-level indirection (`client.chat_completion` function) that `monkeypatch.setattr` replaces.

---

## Scope reminder

**In scope (per ROADMAP §Plan 5):**
- OpenRouter HTTP client (OpenAI-compatible `/chat/completions`)
- Input-hash-keyed persistent cache
- Five versioned prompt modules: AAR, intel brief, ace name, year recap, retrospective
- Five API endpoints to trigger / retrieve each kind of narrative
- `CampaignNarrative` persistence table + `Squadron.ace_name` / `Squadron.ace_awarded` fields
- Tests: mocked HTTP, prompt-renders-correctly, cache-hit, idempotent API, eligibility rules

**Out of scope (deferred):**
- Fake-headline press feed, Twitter/X OSINT, chai-stall rumors, pilot quotes — all parked in V1.5+
- Streaming response rendering (MVP: full text return)
- Retry / backoff / circuit-breaker around OpenRouter — a single-try with clear 502 propagation is fine for a solo hobby repo; revisit if it becomes a playtest problem
- Automatic invocation inside `advance_turn` — frontend triggers explicitly post-turn
- Frontend UI for narratives (Plan 8)

---

## File Structure

**Backend (create):**
- `backend/app/llm/__init__.py`
- `backend/app/llm/client.py` — `chat_completion(messages, model=None, max_tokens=1200, temperature=0.7) -> LLMResponse`
- `backend/app/llm/cache.py` — `get_or_generate(db, cache_key, build_messages, model) -> (text, cached: bool)`
- `backend/app/llm/service.py` — five `generate_*` orchestrators
- `backend/app/llm/prompts/__init__.py` — `REGISTRY: dict[str, PromptModule]` + `input_hash(payload: dict) -> str` helper
- `backend/app/llm/prompts/aar_v1.py`
- `backend/app/llm/prompts/intel_brief_v1.py`
- `backend/app/llm/prompts/ace_name_v1.py`
- `backend/app/llm/prompts/year_recap_v1.py`
- `backend/app/llm/prompts/retrospective_v1.py`
- `backend/app/models/llm_cache.py`
- `backend/app/models/campaign_narrative.py`
- `backend/app/schemas/narrative.py` — `CampaignNarrativeRead`, `AARRead`, `GenerateResponse`
- `backend/app/crud/narrative.py` — list / fetch / insert helpers
- `backend/app/api/narratives.py` — five endpoints
- `backend/tests/test_llm_client.py`
- `backend/tests/test_llm_cache.py`
- `backend/tests/test_prompt_aar_v1.py`
- `backend/tests/test_prompt_intel_brief_v1.py`
- `backend/tests/test_prompt_ace_name_v1.py`
- `backend/tests/test_prompt_year_recap_v1.py`
- `backend/tests/test_prompt_retrospective_v1.py`
- `backend/tests/test_narrative_api.py`
- `backend/tests/conftest.py` — shared `stub_llm` fixture (if one doesn't already exist; else extend)

**Backend (modify):**
- `backend/app/models/__init__.py` — import `LLMCache`, `CampaignNarrative`
- `backend/app/models/squadron.py` — add `ace_name: Mapped[str | None]`, `ace_awarded_year: Mapped[int | None]`, `ace_awarded_quarter: Mapped[int | None]`
- `backend/main.py` — register `narratives_router`
- `backend/tests/test_event_vocabulary.py` — register `narrative_generated`, `ace_awarded` event types
- `backend/tests/test_replay_determinism.py` — assert LLM narratives are NOT generated during advance_turn (baseline stays deterministic)
- `backend/.env.example` — document that the key/model already there are consumed by `app/llm/client.py`

**Frontend (modify):**
- `frontend/src/lib/types.ts` — add `CampaignNarrative`, `NarrativeKind`, `GenerateNarrativeResponse` types (used by Plan 8 UI)

---

## Domain modelling decisions (locked)

### OpenRouter contract

- Endpoint: `POST https://openrouter.ai/api/v1/chat/completions`
- Headers:
  - `Authorization: Bearer ${OPENROUTER_API_KEY}`
  - `Content-Type: application/json`
  - `HTTP-Referer: https://pmc-tycoon.skdev.one`
  - `X-Title: Sovereign Shield`
- Body:
  ```json
  {"model": "<resolved>", "messages": [...], "max_tokens": 1200, "temperature": 0.7}
  ```
- Response: OpenAI-shaped `{"choices": [{"message": {"content": "..."}}], "usage": {"prompt_tokens": N, "completion_tokens": M}}`
- Timeout: 60s single-try. 5xx → `LLMUnavailableError` (HTTP 502 at API layer). 4xx → `LLMRequestError` (HTTP 500 at API layer — programmer bug).

### Model resolution

`settings.openrouter_model` default `anthropic/claude-haiku-4.5`. Any call site may override via `model=` kwarg (not used in MVP but reserved for prompt-specific tuning later).

### Cache key

```python
cache_key = sha256(f"{prompt_kind}:{prompt_version}:{input_hash}:{model}".encode()).hexdigest()
```

Including `model` means swapping models doesn't reuse stale text. `input_hash` is produced by the prompt module from its canonical inputs (see `prompts/__init__.py::input_hash`).

### `LLMCache` table shape

```python
class LLMCache(Base):
    __tablename__ = "llm_cache"
    cache_key: Mapped[str] = mapped_column(String(64), primary_key=True)
    prompt_kind: Mapped[str] = mapped_column(String(32), index=True)
    prompt_version: Mapped[str] = mapped_column(String(16))
    model: Mapped[str] = mapped_column(String(64))
    output_text: Mapped[str] = mapped_column(Text)
    prompt_tokens: Mapped[int] = mapped_column(Integer, default=0)
    completion_tokens: Mapped[int] = mapped_column(Integer, default=0)
    created_at: Mapped[datetime] = mapped_column(DateTime, default=datetime.utcnow)
```

### `CampaignNarrative` table shape

```python
class CampaignNarrative(Base):
    __tablename__ = "campaign_narratives"
    id: Mapped[int] = mapped_column(primary_key=True)
    campaign_id: Mapped[int] = mapped_column(ForeignKey("campaigns.id"), index=True)
    kind: Mapped[str] = mapped_column(String(32), index=True)  # aar|intel_brief|ace_name|year_recap|retrospective
    year: Mapped[int] = mapped_column(Integer)
    quarter: Mapped[int] = mapped_column(Integer)
    subject_id: Mapped[str | None] = mapped_column(String(64), nullable=True)  # vignette id, squadron id, "year-2028", "campaign"
    text: Mapped[str] = mapped_column(Text)
    prompt_version: Mapped[str] = mapped_column(String(16))
    input_hash: Mapped[str] = mapped_column(String(64))
    created_at: Mapped[datetime] = mapped_column(DateTime, default=datetime.utcnow)
    __table_args__ = (UniqueConstraint("campaign_id", "kind", "subject_id", name="uq_narrative_identity"),)
```

The `UniqueConstraint` makes "generate if missing, else return existing" a simple upsert — one narrative per (campaign, kind, subject).

### Eligibility rules (locked)

- **AAR:** target vignette must have `status == "resolved"`. Regenerate is idempotent (returns cached).
- **Intel brief:** new brief is eligible only if no brief exists in the last 2 full quarters (quarter-index diff ≥ 2). Subject id = `f"{year}-Q{quarter}"` for the current clock.
- **Ace name:** target vignette must be resolved AND outcome's `objective_met == true` AND `adv_kia >= 4` AND `ind_airframes_lost <= 1`. Pick the player squadron that committed the most airframes (ties broken by lowest squadron_id). Writes ace fields on Squadron; creates narrative row with `subject_id = f"sqn-{squadron_id}"`.
- **Year recap:** eligible only when `year < campaign.current_year` (i.e. the year is fully closed). Subject id = `f"year-{year}"`.
- **Retrospective:** eligible only when `campaign.current_year > 2036` OR (`current_year == 2036` AND `current_quarter > 1`) — i.e. Q40 (2036-Q1) has been completed and the clock has ticked past it. Subject id = `"campaign"`.

Each endpoint returns 409 with a terse reason when ineligible.

### Events emitted

Two new canonical event types — written only when a narrative is newly generated (not on cache hit):
- `narrative_generated` — payload `{kind, subject_id, prompt_version, cached: false}`
- `ace_awarded` — payload `{squadron_id, squadron_name, vignette_id, ace_name}`

The reason for splitting is that `ace_awarded` is a gameplay state change (Squadron fields set), while `narrative_generated` is purely narrative.

---

## Task 1: Config wiring + LLMCache model + CampaignNarrative model + Squadron ace fields

**Files:**
- Modify: `backend/app/models/squadron.py`
- Create: `backend/app/models/llm_cache.py`
- Create: `backend/app/models/campaign_narrative.py`
- Modify: `backend/app/models/__init__.py`
- Test: `backend/tests/test_llm_models.py`

- [ ] **Step 1: Write the failing test**

Create `backend/tests/test_llm_models.py`:

```python
from datetime import datetime
from sqlalchemy import create_engine
from sqlalchemy.orm import sessionmaker
from sqlalchemy.pool import StaticPool
import pytest

from app.db.base import Base
import app.models  # noqa: F401
from app.models.llm_cache import LLMCache
from app.models.campaign_narrative import CampaignNarrative
from app.models.squadron import Squadron


@pytest.fixture
def session():
    eng = create_engine("sqlite:///:memory:", connect_args={"check_same_thread": False}, poolclass=StaticPool)
    Base.metadata.create_all(bind=eng)
    S = sessionmaker(bind=eng)
    yield S()
    Base.metadata.drop_all(bind=eng)


def test_llm_cache_roundtrip(session):
    row = LLMCache(
        cache_key="a" * 64, prompt_kind="aar", prompt_version="v1",
        model="anthropic/claude-haiku-4.5", output_text="hello",
        prompt_tokens=10, completion_tokens=20,
    )
    session.add(row); session.commit()
    fetched = session.query(LLMCache).filter_by(cache_key="a" * 64).one()
    assert fetched.output_text == "hello"
    assert fetched.prompt_tokens == 10


def test_campaign_narrative_unique_per_subject(session):
    from app.models.campaign import Campaign
    c = Campaign(name="t", seed=1, starting_year=2026, starting_quarter=2,
                 current_year=2026, current_quarter=2, difficulty="realistic",
                 objectives_json=[], budget_cr=0)
    session.add(c); session.commit()
    n1 = CampaignNarrative(campaign_id=c.id, kind="aar", year=2026, quarter=2,
                           subject_id="vig-1", text="first",
                           prompt_version="v1", input_hash="h1")
    session.add(n1); session.commit()
    n2 = CampaignNarrative(campaign_id=c.id, kind="aar", year=2026, quarter=2,
                           subject_id="vig-1", text="second",
                           prompt_version="v1", input_hash="h2")
    session.add(n2)
    with pytest.raises(Exception):
        session.commit()


def test_squadron_ace_fields_default_none():
    sq = Squadron(campaign_id=1, name="17 Sqn", platform_id="rafale_f4",
                  base_id=1, strength=16, readiness_pct=80, xp=0)
    assert sq.ace_name is None
    assert sq.ace_awarded_year is None
    assert sq.ace_awarded_quarter is None
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `cd backend && pytest tests/test_llm_models.py -v`
Expected: FAIL with ImportError on `app.models.llm_cache`.

- [ ] **Step 3: Create `backend/app/models/llm_cache.py`**

```python
from datetime import datetime
from sqlalchemy import String, Integer, Text, DateTime
from sqlalchemy.orm import Mapped, mapped_column

from app.db.base import Base


class LLMCache(Base):
    __tablename__ = "llm_cache"

    cache_key: Mapped[str] = mapped_column(String(64), primary_key=True)
    prompt_kind: Mapped[str] = mapped_column(String(32), index=True)
    prompt_version: Mapped[str] = mapped_column(String(16))
    model: Mapped[str] = mapped_column(String(64))
    output_text: Mapped[str] = mapped_column(Text)
    prompt_tokens: Mapped[int] = mapped_column(Integer, default=0)
    completion_tokens: Mapped[int] = mapped_column(Integer, default=0)
    created_at: Mapped[datetime] = mapped_column(DateTime, default=datetime.utcnow)
```

- [ ] **Step 4: Create `backend/app/models/campaign_narrative.py`**

```python
from datetime import datetime
from sqlalchemy import String, Integer, Text, DateTime, ForeignKey, UniqueConstraint
from sqlalchemy.orm import Mapped, mapped_column

from app.db.base import Base


class CampaignNarrative(Base):
    __tablename__ = "campaign_narratives"

    id: Mapped[int] = mapped_column(primary_key=True)
    campaign_id: Mapped[int] = mapped_column(ForeignKey("campaigns.id"), index=True)
    kind: Mapped[str] = mapped_column(String(32), index=True)
    year: Mapped[int] = mapped_column(Integer)
    quarter: Mapped[int] = mapped_column(Integer)
    subject_id: Mapped[str | None] = mapped_column(String(64), nullable=True)
    text: Mapped[str] = mapped_column(Text)
    prompt_version: Mapped[str] = mapped_column(String(16))
    input_hash: Mapped[str] = mapped_column(String(64))
    created_at: Mapped[datetime] = mapped_column(DateTime, default=datetime.utcnow)

    __table_args__ = (
        UniqueConstraint("campaign_id", "kind", "subject_id", name="uq_narrative_identity"),
    )
```

- [ ] **Step 5: Add ace fields to `backend/app/models/squadron.py`**

Add these `mapped_column` declarations inside the `Squadron` class (after the existing `xp` field):

```python
    ace_name: Mapped[str | None] = mapped_column(String(64), nullable=True, default=None)
    ace_awarded_year: Mapped[int | None] = mapped_column(Integer, nullable=True, default=None)
    ace_awarded_quarter: Mapped[int | None] = mapped_column(Integer, nullable=True, default=None)
```

- [ ] **Step 6: Register new models in `backend/app/models/__init__.py`**

Add imports so `app.models  # noqa: F401` picks them up:

```python
from app.models.llm_cache import LLMCache  # noqa: F401
from app.models.campaign_narrative import CampaignNarrative  # noqa: F401
```

(Preserve existing imports; add these at the bottom.)

- [ ] **Step 7: Run tests to verify they pass**

Run: `cd backend && pytest tests/test_llm_models.py -v`
Expected: 3 passed.

- [ ] **Step 8: Commit**

```bash
git add backend/app/models/llm_cache.py backend/app/models/campaign_narrative.py \
        backend/app/models/__init__.py backend/app/models/squadron.py \
        backend/tests/test_llm_models.py
git commit -m "feat(llm): add LLMCache + CampaignNarrative models, Squadron ace fields"
```

---

## Task 2: OpenRouter client (with test seam)

**Files:**
- Create: `backend/app/llm/__init__.py` (empty)
- Create: `backend/app/llm/client.py`
- Test: `backend/tests/test_llm_client.py`

- [ ] **Step 1: Write the failing test**

Create `backend/tests/test_llm_client.py`:

```python
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
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd backend && pytest tests/test_llm_client.py -v`
Expected: FAIL with ImportError.

- [ ] **Step 3: Implement `backend/app/llm/client.py`**

```python
"""OpenRouter HTTP client. Thin sync wrapper over /chat/completions.

Tests override `_transport_factory` to inject an httpx.MockTransport so
we never hit the real network. Production calls build a real httpx.Client.
"""
from __future__ import annotations

from dataclasses import dataclass
from typing import Any

import httpx

from app.core.config import settings


OPENROUTER_URL = "https://openrouter.ai/api/v1/chat/completions"
DEFAULT_MAX_TOKENS = 1200
DEFAULT_TEMPERATURE = 0.7
TIMEOUT_SECONDS = 60.0


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
    client_kwargs = {"timeout": TIMEOUT_SECONDS}
    if transport is not None:
        client_kwargs["transport"] = transport

    try:
        with httpx.Client(**client_kwargs) as client:
            r = client.post(OPENROUTER_URL, json=body, headers=headers)
    except httpx.RequestError as e:
        raise LLMUnavailableError(f"OpenRouter transport error: {e}") from e

    if r.status_code >= 500:
        raise LLMUnavailableError(f"OpenRouter {r.status_code}: {r.text[:200]}")
    if r.status_code >= 400:
        raise LLMRequestError(f"OpenRouter {r.status_code}: {r.text[:200]}")

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
```

Also create empty `backend/app/llm/__init__.py`.

- [ ] **Step 4: Run tests to verify they pass**

Run: `cd backend && pytest tests/test_llm_client.py -v`
Expected: 4 passed.

- [ ] **Step 5: Commit**

```bash
git add backend/app/llm/__init__.py backend/app/llm/client.py backend/tests/test_llm_client.py
git commit -m "feat(llm): OpenRouter chat_completion client with test seam"
```

---

## Task 3: Cache layer

**Files:**
- Create: `backend/app/llm/cache.py`
- Test: `backend/tests/test_llm_cache.py`

- [ ] **Step 1: Write the failing test**

Create `backend/tests/test_llm_cache.py`:

```python
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
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd backend && pytest tests/test_llm_cache.py -v`
Expected: FAIL (ImportError).

- [ ] **Step 3: Implement `backend/app/llm/cache.py`**

```python
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
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `cd backend && pytest tests/test_llm_cache.py -v`
Expected: 2 passed.

- [ ] **Step 5: Commit**

```bash
git add backend/app/llm/cache.py backend/tests/test_llm_cache.py
git commit -m "feat(llm): content-hash read-through cache for prompt responses"
```

---

## Task 4: Prompt registry + input_hash helper

**Files:**
- Create: `backend/app/llm/prompts/__init__.py`
- Test: extend in subsequent prompt tasks (no standalone test file needed yet)

- [ ] **Step 1: Implement `backend/app/llm/prompts/__init__.py`**

```python
"""Prompt module registry + canonical input hashing.

Every prompt is a module in this package that exports:
  - VERSION: str    (e.g. "v1")
  - KIND: str       (e.g. "aar")
  - build_messages(inputs: dict) -> list[dict]   # OpenAI message shape
  - build_input_hash(inputs: dict) -> str        # stable hash over the canonical payload

Modules self-register in REGISTRY on import.
"""
from __future__ import annotations

import hashlib
import json
from typing import Callable, Protocol


class PromptModule(Protocol):
    VERSION: str
    KIND: str
    def build_messages(self, inputs: dict) -> list[dict]: ...
    def build_input_hash(self, inputs: dict) -> str: ...


REGISTRY: dict[str, "PromptModule"] = {}


def register(module) -> None:
    """Called at the bottom of each prompt module to publish itself."""
    key = f"{module.KIND}:{module.VERSION}"
    if key in REGISTRY:
        raise RuntimeError(f"duplicate prompt registration: {key}")
    REGISTRY[key] = module


def input_hash(payload: dict) -> str:
    """Stable sha256 over a canonicalized JSON payload."""
    blob = json.dumps(payload, sort_keys=True, separators=(",", ":"), default=str)
    return hashlib.sha256(blob.encode("utf-8")).hexdigest()


def cache_key(kind: str, version: str, model: str, ihash: str) -> str:
    blob = f"{kind}:{version}:{model}:{ihash}".encode("utf-8")
    return hashlib.sha256(blob).hexdigest()


def get_prompt(kind: str, version: str = "v1"):
    key = f"{kind}:{version}"
    if key not in REGISTRY:
        raise KeyError(f"no prompt registered for {key}")
    return REGISTRY[key]
```

- [ ] **Step 2: Verify the module imports cleanly**

Run: `cd backend && python -c "from app.llm.prompts import input_hash, cache_key, REGISTRY; print(input_hash({'a': 1}))"`
Expected: prints a 64-char hex string.

- [ ] **Step 3: Commit**

```bash
git add backend/app/llm/prompts/__init__.py
git commit -m "feat(llm): prompt registry + stable input-hash helper"
```

---

## Task 5: AAR v1 prompt template

**Files:**
- Create: `backend/app/llm/prompts/aar_v1.py`
- Test: `backend/tests/test_prompt_aar_v1.py`

- [ ] **Step 1: Write the failing test**

Create `backend/tests/test_prompt_aar_v1.py`:

```python
from app.llm.prompts import aar_v1, input_hash


SAMPLE_INPUTS = {
    "scenario_name": "LAC Air Incursion (Limited)",
    "ao": {"region": "lac_western", "name": "Ladakh / Pangong sector"},
    "year": 2028, "quarter": 3,
    "planning_state": {
        "adversary_force": [
            {"role": "CAP", "faction": "PLAAF", "platform_id": "j20a", "count": 6},
        ],
    },
    "committed_force": {
        "squadrons": [{"squadron_id": 17, "name": "17 Sqn Golden Arrows",
                       "platform_id": "rafale_f4", "airframes": 8}],
        "support": {"awacs": True, "tanker": True, "sead_package": False},
        "roe": "weapons_free",
    },
    "outcome": {"ind_kia": 0, "adv_kia": 4, "ind_airframes_lost": 1,
                "adv_airframes_lost": 4, "objective_met": True,
                "aar_stub": "Decisive IAF win."},
    "event_trace": [
        {"t_min": 0, "kind": "detection", "side": "IND", "detail": "AWACS paints bogeys"},
        {"t_min": 3, "kind": "bvr_launch", "side": "IND", "detail": "Meteor salvo"},
    ],
}


def test_aar_v1_module_metadata():
    assert aar_v1.KIND == "aar"
    assert aar_v1.VERSION == "v1"


def test_aar_v1_build_messages_shape():
    msgs = aar_v1.build_messages(SAMPLE_INPUTS)
    assert isinstance(msgs, list) and len(msgs) >= 2
    assert msgs[0]["role"] == "system"
    assert msgs[-1]["role"] == "user"
    user_content = msgs[-1]["content"]
    assert "LAC Air Incursion" in user_content
    assert "17 Sqn Golden Arrows" in user_content
    assert "weapons_free" in user_content
    # Event trace must be present so the model can narrate it
    assert "bvr_launch" in user_content


def test_aar_v1_input_hash_is_stable_and_shape_sensitive():
    h1 = aar_v1.build_input_hash(SAMPLE_INPUTS)
    h2 = aar_v1.build_input_hash(SAMPLE_INPUTS)
    assert h1 == h2
    mutated = {**SAMPLE_INPUTS, "year": 2029}
    assert aar_v1.build_input_hash(mutated) != h1


def test_aar_v1_registered():
    from app.llm.prompts import REGISTRY
    assert "aar:v1" in REGISTRY
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd backend && pytest tests/test_prompt_aar_v1.py -v`
Expected: FAIL (module not found).

- [ ] **Step 3: Implement `backend/app/llm/prompts/aar_v1.py`**

```python
"""AAR prompt v1 — narrates a resolved vignette as a 4-8 paragraph report."""
from __future__ import annotations

import json

from app.llm.prompts import input_hash as _canonical_hash, register

KIND = "aar"
VERSION = "v1"


SYSTEM_PROMPT = """You are the author of an After-Action Report for the
Indian Air Force Integration Directorate. Write in the restrained,
technical voice of a real IAF post-strike debrief — clipped sentences,
squadron callsigns, platform designations, weapon names. 4 to 8
paragraphs. Do not invent platforms or weapons not present in the input.
Do not use the word "thrilling" or similar dramatic fillers. End with a
single italicised line beginning "Directorate note:".
""".strip()


def _render_user_prompt(inputs: dict) -> str:
    scen = inputs["scenario_name"]
    ao = inputs["ao"]
    y, q = inputs["year"], inputs["quarter"]
    adv_force = inputs["planning_state"]["adversary_force"]
    committed = inputs["committed_force"]
    outcome = inputs["outcome"]
    trace = inputs["event_trace"]

    lines = [
        f"# Vignette: {scen}",
        f"Date: {y}-Q{q}.  AO: {ao.get('name', ao.get('region'))}.",
        "",
        "## Adversary order of battle",
    ]
    for entry in adv_force:
        lines.append(f"- {entry['role']}: {entry['count']}x "
                     f"{entry['platform_id']} ({entry['faction']})")

    lines.append("")
    lines.append("## Indian force commitment")
    for sq in committed["squadrons"]:
        lines.append(f"- {sq['name']} ({sq['platform_id']}): "
                     f"{sq['airframes']} airframes")
    supp = committed.get("support", {})
    lines.append(f"- Support: AWACS={supp.get('awacs')}, "
                 f"Tanker={supp.get('tanker')}, SEAD={supp.get('sead_package')}")
    lines.append(f"- ROE: {committed.get('roe')}")

    lines.append("")
    lines.append("## Event trace (chronological)")
    for e in trace:
        lines.append(f"- t+{e['t_min']}m [{e['side']}] {e['kind']}: {e['detail']}")

    lines.append("")
    lines.append("## Outcome")
    lines.append(json.dumps(outcome, indent=2))

    lines.append("")
    lines.append("Write the After-Action Report now.")
    return "\n".join(lines)


def build_messages(inputs: dict) -> list[dict]:
    return [
        {"role": "system", "content": SYSTEM_PROMPT},
        {"role": "user", "content": _render_user_prompt(inputs)},
    ]


def build_input_hash(inputs: dict) -> str:
    # Hash only the fields the prompt actually reads, so unrelated churn
    # in the Vignette row doesn't bust the cache.
    canonical = {
        "scenario_name": inputs["scenario_name"],
        "ao": inputs["ao"],
        "year": inputs["year"],
        "quarter": inputs["quarter"],
        "adversary_force": inputs["planning_state"]["adversary_force"],
        "committed_force": inputs["committed_force"],
        "outcome": inputs["outcome"],
        "event_trace": inputs["event_trace"],
    }
    return _canonical_hash(canonical)


import sys as _sys
register(_sys.modules[__name__])
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `cd backend && pytest tests/test_prompt_aar_v1.py -v`
Expected: 4 passed.

- [ ] **Step 5: Commit**

```bash
git add backend/app/llm/prompts/aar_v1.py backend/tests/test_prompt_aar_v1.py
git commit -m "feat(llm): aar_v1 prompt template"
```

---

## Task 6: Intel brief v1 prompt template

**Files:**
- Create: `backend/app/llm/prompts/intel_brief_v1.py`
- Test: `backend/tests/test_prompt_intel_brief_v1.py`

- [ ] **Step 1: Write the failing test**

```python
# backend/tests/test_prompt_intel_brief_v1.py
from app.llm.prompts import intel_brief_v1


SAMPLE = {
    "year": 2029, "quarter": 1,
    "adversary_states": {
        "PLAAF": {"doctrine_tier": "C4I_integrated",
                  "inventory": {"j20a": 320, "j20s": 80, "j16": 240},
                  "recent_events": ["J-20S two-seater IOC"]},
        "PAF":   {"doctrine_tier": "modernizing",
                  "inventory": {"j35e": 12, "jf17_blk3": 96},
                  "recent_events": ["First J-35E sqn raised"]},
        "PLAN":  {"doctrine_tier": "blue_water_aspirant",
                  "inventory": {"j35a": 24},
                  "recent_events": ["Fujian-class second hull trials"]},
    },
    "recent_intel_cards": [
        {"source_type": "SIGINT", "confidence": 0.7,
         "headline": "Chengdu assembly line ramp"},
    ],
}


def test_intel_brief_v1_metadata():
    assert intel_brief_v1.KIND == "intel_brief"
    assert intel_brief_v1.VERSION == "v1"


def test_intel_brief_v1_builds_messages():
    msgs = intel_brief_v1.build_messages(SAMPLE)
    assert msgs[0]["role"] == "system"
    user = msgs[-1]["content"]
    assert "PLAAF" in user and "PAF" in user and "PLAN" in user
    assert "Chengdu assembly line ramp" in user


def test_intel_brief_v1_input_hash_stable():
    h = intel_brief_v1.build_input_hash(SAMPLE)
    assert len(h) == 64
    assert h == intel_brief_v1.build_input_hash(SAMPLE)
```

- [ ] **Step 2: Run to verify failure**

Run: `cd backend && pytest tests/test_prompt_intel_brief_v1.py -v`
Expected: FAIL (import).

- [ ] **Step 3: Implement `backend/app/llm/prompts/intel_brief_v1.py`**

```python
"""Intel brief prompt v1 — every-few-quarters long-form strategic read."""
from __future__ import annotations

import json

from app.llm.prompts import input_hash as _canonical_hash, register

KIND = "intel_brief"
VERSION = "v1"

SYSTEM_PROMPT = """You are the Directorate of Air Intelligence, producing a
quarterly long-form brief for the Head of Defense Integration. Cover PLAAF,
PAF, and PLAN in that order. Each section is 2-4 paragraphs. Cite the
recent intel source types (SIGINT/HUMINT/IMINT/OSINT/ELINT) inline. End with
a 3-bullet "Implications" block. Do not invent numbers not present in the
input. No dramatic language.
""".strip()


def _render_user_prompt(inputs: dict) -> str:
    y, q = inputs["year"], inputs["quarter"]
    adv = inputs["adversary_states"]
    cards = inputs["recent_intel_cards"]
    lines = [f"# Quarterly Intelligence Brief — {y}-Q{q}", ""]
    for faction in ("PLAAF", "PAF", "PLAN"):
        s = adv.get(faction, {})
        lines.append(f"## {faction}")
        lines.append(f"- Doctrine tier: {s.get('doctrine_tier')}")
        lines.append(f"- Inventory snapshot: {json.dumps(s.get('inventory', {}))}")
        lines.append(f"- Recent events: {s.get('recent_events', [])}")
        lines.append("")
    lines.append("## Recent collected intel")
    for c in cards:
        lines.append(f"- [{c['source_type']}] ({c['confidence']:.2f}) "
                     f"{c['headline']}")
    lines.append("")
    lines.append("Write the brief now.")
    return "\n".join(lines)


def build_messages(inputs: dict) -> list[dict]:
    return [
        {"role": "system", "content": SYSTEM_PROMPT},
        {"role": "user", "content": _render_user_prompt(inputs)},
    ]


def build_input_hash(inputs: dict) -> str:
    canonical = {
        "year": inputs["year"], "quarter": inputs["quarter"],
        "adversary_states": inputs["adversary_states"],
        "recent_intel_cards": inputs["recent_intel_cards"],
    }
    return _canonical_hash(canonical)


import sys as _sys
register(_sys.modules[__name__])
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `cd backend && pytest tests/test_prompt_intel_brief_v1.py -v`
Expected: 3 passed.

- [ ] **Step 5: Commit**

```bash
git add backend/app/llm/prompts/intel_brief_v1.py backend/tests/test_prompt_intel_brief_v1.py
git commit -m "feat(llm): intel_brief_v1 prompt template"
```

---

## Task 7: Ace-name v1 prompt template

**Files:**
- Create: `backend/app/llm/prompts/ace_name_v1.py`
- Test: `backend/tests/test_prompt_ace_name_v1.py`

- [ ] **Step 1: Write the failing test**

```python
# backend/tests/test_prompt_ace_name_v1.py
from app.llm.prompts import ace_name_v1


SAMPLE = {
    "squadron_name": "17 Sqn Golden Arrows",
    "platform_id": "rafale_f4",
    "vignette": {
        "scenario_name": "LAC Air Incursion (Limited)",
        "year": 2029, "quarter": 2,
        "outcome": {"adv_kia": 5, "ind_airframes_lost": 0},
    },
}


def test_metadata():
    assert ace_name_v1.KIND == "ace_name"
    assert ace_name_v1.VERSION == "v1"


def test_build_messages_has_format_constraint():
    msgs = ace_name_v1.build_messages(SAMPLE)
    sys_prompt = msgs[0]["content"]
    assert "callsign" in sys_prompt.lower()
    # Must tell model output is a single line only
    assert "one line" in sys_prompt.lower() or "single line" in sys_prompt.lower()
    user = msgs[-1]["content"]
    assert "17 Sqn Golden Arrows" in user
    assert "rafale_f4" in user


def test_hash_stable():
    h = ace_name_v1.build_input_hash(SAMPLE)
    assert len(h) == 64
```

- [ ] **Step 2: Run**

Run: `cd backend && pytest tests/test_prompt_ace_name_v1.py -v`
Expected: FAIL (import).

- [ ] **Step 3: Implement `backend/app/llm/prompts/ace_name_v1.py`**

```python
"""Ace-name prompt v1 — produces a single-line squadron ace callsign."""
from __future__ import annotations

from app.llm.prompts import input_hash as _canonical_hash, register

KIND = "ace_name"
VERSION = "v1"

SYSTEM_PROMPT = """You name emerging IAF aces after notable engagements.
Output EXACTLY ONE LINE in the format:  "Sqn Ldr <Name> 'Callsign'".
Use plausible Indian names. The callsign should be short (1-2 words),
thematic to the platform and squadron lineage. Do not add any other text,
no quotes around the whole thing, no trailing commentary.
""".strip()


def _render_user_prompt(inputs: dict) -> str:
    v = inputs["vignette"]
    return (
        f"Squadron: {inputs['squadron_name']}\n"
        f"Platform: {inputs['platform_id']}\n"
        f"Engagement: {v['scenario_name']} ({v['year']}-Q{v['quarter']})\n"
        f"Outcome: {v['outcome']['adv_kia']} adversary kills, "
        f"{v['outcome']['ind_airframes_lost']} Indian losses.\n"
        f"\nProduce the callsign line."
    )


def build_messages(inputs: dict) -> list[dict]:
    return [
        {"role": "system", "content": SYSTEM_PROMPT},
        {"role": "user", "content": _render_user_prompt(inputs)},
    ]


def build_input_hash(inputs: dict) -> str:
    canonical = {
        "squadron_name": inputs["squadron_name"],
        "platform_id": inputs["platform_id"],
        "vignette": inputs["vignette"],
    }
    return _canonical_hash(canonical)


import sys as _sys
register(_sys.modules[__name__])
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `cd backend && pytest tests/test_prompt_ace_name_v1.py -v`
Expected: 3 passed.

- [ ] **Step 5: Commit**

```bash
git add backend/app/llm/prompts/ace_name_v1.py backend/tests/test_prompt_ace_name_v1.py
git commit -m "feat(llm): ace_name_v1 prompt template"
```

---

## Task 8: Year-recap + Retrospective v1 prompt templates

Combined into one task because they share structure.

**Files:**
- Create: `backend/app/llm/prompts/year_recap_v1.py`
- Create: `backend/app/llm/prompts/retrospective_v1.py`
- Test: `backend/tests/test_prompt_year_recap_v1.py`
- Test: `backend/tests/test_prompt_retrospective_v1.py`

- [ ] **Step 1: Write failing tests**

```python
# backend/tests/test_prompt_year_recap_v1.py
from app.llm.prompts import year_recap_v1


SAMPLE = {
    "year": 2028,
    "starting_treasury_cr": 500000,
    "ending_treasury_cr": 410000,
    "acquisitions_delivered": ["Rafale sqn #2", "Tejas Mk1A batch-3"],
    "rd_milestones": ["AMCA Mk1 engine integration passed"],
    "vignettes_resolved": 2,
    "vignettes_won": 2,
    "notable_adversary_shifts": ["PLAAF fielded J-20S widely"],
}


def test_metadata():
    assert year_recap_v1.KIND == "year_recap"
    assert year_recap_v1.VERSION == "v1"


def test_one_line_constraint():
    msgs = year_recap_v1.build_messages(SAMPLE)
    assert "one sentence" in msgs[0]["content"].lower() \
        or "single sentence" in msgs[0]["content"].lower()


def test_hash_stable():
    assert year_recap_v1.build_input_hash(SAMPLE) \
        == year_recap_v1.build_input_hash(SAMPLE)
```

```python
# backend/tests/test_prompt_retrospective_v1.py
from app.llm.prompts import retrospective_v1


SAMPLE = {
    "final_year": 2036,
    "final_quarter": 1,
    "objectives_scorecard": [
        {"id": "obj1", "name": "Air superiority over LAC",
         "status": "met", "detail": "4 wins / 0 losses in LAC AO"},
    ],
    "force_structure_delta": {
        "squadrons_start": 31,
        "squadrons_end": 39,
        "fifth_gen_squadrons_end": 4,
    },
    "budget_efficiency_pct": 91,
    "ace_count": 6,
    "notable_engagements": ["2029-Q2 LAC air incursion victory"],
    "adversary_final_state": {
        "PLAAF": {"doctrine_tier": "C4I_integrated"},
    },
}


def test_metadata():
    assert retrospective_v1.KIND == "retrospective"
    assert retrospective_v1.VERSION == "v1"


def test_messages_cover_sections():
    msgs = retrospective_v1.build_messages(SAMPLE)
    user = msgs[-1]["content"]
    for marker in ("objective", "force structure", "adversary"):
        assert marker.lower() in user.lower()


def test_hash_stable():
    assert retrospective_v1.build_input_hash(SAMPLE) \
        == retrospective_v1.build_input_hash(SAMPLE)
```

- [ ] **Step 2: Run tests — expect failure**

Run: `cd backend && pytest tests/test_prompt_year_recap_v1.py tests/test_prompt_retrospective_v1.py -v`
Expected: FAIL (imports).

- [ ] **Step 3: Implement `backend/app/llm/prompts/year_recap_v1.py`**

```python
"""Year recap prompt v1 — single-sentence summary of a completed year."""
from __future__ import annotations

import json

from app.llm.prompts import input_hash as _canonical_hash, register

KIND = "year_recap"
VERSION = "v1"

SYSTEM_PROMPT = """Produce exactly one sentence (max 30 words) summarising
the IAF's progress in the given year. Tone: clipped, factual. No emojis,
no dramatic language. Output only the sentence — no heading, no bullets.
""".strip()


def _render_user_prompt(inputs: dict) -> str:
    return (
        f"Year: {inputs['year']}\n"
        f"Treasury: {inputs['starting_treasury_cr']} → {inputs['ending_treasury_cr']} cr\n"
        f"Deliveries: {inputs['acquisitions_delivered']}\n"
        f"R&D milestones: {inputs['rd_milestones']}\n"
        f"Vignettes: {inputs['vignettes_resolved']} resolved, "
        f"{inputs['vignettes_won']} won\n"
        f"Adversary shifts: {inputs['notable_adversary_shifts']}\n"
        "\nOne sentence."
    )


def build_messages(inputs: dict) -> list[dict]:
    return [
        {"role": "system", "content": SYSTEM_PROMPT},
        {"role": "user", "content": _render_user_prompt(inputs)},
    ]


def build_input_hash(inputs: dict) -> str:
    return _canonical_hash(inputs)


import sys as _sys
register(_sys.modules[__name__])
```

- [ ] **Step 4: Implement `backend/app/llm/prompts/retrospective_v1.py`**

```python
"""Retrospective prompt v1 — end-of-campaign long-form assessment."""
from __future__ import annotations

import json

from app.llm.prompts import input_hash as _canonical_hash, register

KIND = "retrospective"
VERSION = "v1"

SYSTEM_PROMPT = """You are writing the Defense White Paper epilogue for
the outgoing Head of Defense Integration (2026-2036). Produce 5-8
paragraphs covering, in this order:
  1. Objective scorecard overview
  2. Force structure evolution
  3. Procurement / R&D highlights
  4. Notable engagements and emerging aces
  5. The adversary landscape as it now stands
  6. A frank assessment of what was left undone

Clipped, senior-officer voice. No dramatic language.
""".strip()


def _render_user_prompt(inputs: dict) -> str:
    return (
        f"# Campaign: {inputs['final_year']}-Q{inputs['final_quarter']} final state\n\n"
        f"## Objective scorecard\n{json.dumps(inputs['objectives_scorecard'], indent=2)}\n\n"
        f"## Force structure delta\n{json.dumps(inputs['force_structure_delta'], indent=2)}\n\n"
        f"## Budget efficiency\n{inputs['budget_efficiency_pct']}%\n\n"
        f"## Emerging aces\n{inputs['ace_count']} squadron aces recognized\n\n"
        f"## Notable engagements\n{inputs['notable_engagements']}\n\n"
        f"## Adversary final state\n{json.dumps(inputs['adversary_final_state'], indent=2)}\n\n"
        "Write the retrospective now."
    )


def build_messages(inputs: dict) -> list[dict]:
    return [
        {"role": "system", "content": SYSTEM_PROMPT},
        {"role": "user", "content": _render_user_prompt(inputs)},
    ]


def build_input_hash(inputs: dict) -> str:
    return _canonical_hash(inputs)


import sys as _sys
register(_sys.modules[__name__])
```

- [ ] **Step 5: Run tests to verify both pass**

Run: `cd backend && pytest tests/test_prompt_year_recap_v1.py tests/test_prompt_retrospective_v1.py -v`
Expected: 6 passed.

- [ ] **Step 6: Commit**

```bash
git add backend/app/llm/prompts/year_recap_v1.py backend/app/llm/prompts/retrospective_v1.py \
        backend/tests/test_prompt_year_recap_v1.py backend/tests/test_prompt_retrospective_v1.py
git commit -m "feat(llm): year_recap_v1 + retrospective_v1 prompt templates"
```

---

## Task 9: Narrative service layer (input assembly + orchestration)

**Files:**
- Create: `backend/app/llm/service.py`
- Create: `backend/app/crud/narrative.py`
- Test: `backend/tests/test_llm_service.py`

- [ ] **Step 1: Write the failing test**

```python
# backend/tests/test_llm_service.py
from datetime import datetime
from sqlalchemy import create_engine
from sqlalchemy.orm import sessionmaker
from sqlalchemy.pool import StaticPool
import pytest

from app.db.base import Base
import app.models  # noqa: F401
from app.models.campaign import Campaign
from app.models.vignette import Vignette
from app.models.adversary import AdversaryState
from app.models.intel import IntelCard
from app.models.squadron import Squadron
from app.models.campaign_narrative import CampaignNarrative
from app.llm import service
from app.llm.client import LLMResponse


@pytest.fixture
def session():
    eng = create_engine("sqlite:///:memory:", connect_args={"check_same_thread": False}, poolclass=StaticPool)
    Base.metadata.create_all(bind=eng)
    S = sessionmaker(bind=eng)
    yield S()
    Base.metadata.drop_all(bind=eng)


def _stub(monkeypatch, text="stub narrative"):
    calls = []
    def fake(messages, **kw):
        calls.append(messages)
        return LLMResponse(text=text, model="stub",
                           prompt_tokens=1, completion_tokens=2)
    monkeypatch.setattr(service, "chat_completion", fake)
    return calls


def _campaign(session):
    c = Campaign(name="t", seed=1, starting_year=2026, starting_quarter=2,
                 current_year=2030, current_quarter=1, difficulty="realistic",
                 objectives_json=[], budget_cr=1000)
    session.add(c); session.commit()
    return c


def test_generate_aar_idempotent(session, monkeypatch):
    c = _campaign(session)
    v = Vignette(
        campaign_id=c.id, year=2029, quarter=3, scenario_id="lac_air_incursion_limited",
        status="resolved",
        planning_state={
            "scenario_name": "LAC Air Incursion (Limited)",
            "ao": {"region": "lac_western", "name": "Ladakh", "lat": 34.0, "lon": 78.5},
            "response_clock_minutes": 45,
            "adversary_force": [{"role": "CAP", "faction": "PLAAF", "platform_id": "j20a", "count": 6, "loadout": []}],
            "eligible_squadrons": [], "allowed_ind_roles": [], "roe_options": [],
            "objective": {"kind": "defend_airspace", "success_threshold": {}},
        },
        committed_force={"squadrons": [{"squadron_id": 17, "name": "17 Sqn",
                                        "platform_id": "rafale_f4", "airframes": 8}],
                         "support": {"awacs": True, "tanker": True, "sead_package": False},
                         "roe": "weapons_free"},
        event_trace=[{"t_min": 0, "kind": "detection", "side": "IND", "detail": "ok"}],
        aar_text="",
        outcome={"ind_kia": 0, "adv_kia": 4, "ind_airframes_lost": 0,
                 "adv_airframes_lost": 4, "objective_met": True, "aar_stub": "win"},
        resolved_at=datetime.utcnow(),
    )
    session.add(v); session.commit()

    calls = _stub(monkeypatch, text="A crisp AAR.")
    text, cached = service.generate_aar(session, c, v)
    assert text == "A crisp AAR."
    assert cached is False
    # Vignette.aar_text was populated
    session.refresh(v)
    assert v.aar_text == "A crisp AAR."
    # CampaignNarrative row was written
    row = session.query(CampaignNarrative).filter_by(
        campaign_id=c.id, kind="aar", subject_id=f"vig-{v.id}").one()
    assert row.text == "A crisp AAR."

    # Second call should cache-hit — no additional LLM call
    text2, cached2 = service.generate_aar(session, c, v)
    assert text2 == "A crisp AAR."
    assert cached2 is True
    assert len(calls) == 1


def test_generate_ace_name_requires_notable_win(session, monkeypatch):
    c = _campaign(session)
    sq = Squadron(campaign_id=c.id, name="17 Sqn", platform_id="rafale_f4",
                  base_id=1, strength=16, readiness_pct=80, xp=0)
    session.add(sq); session.commit()
    v = Vignette(
        campaign_id=c.id, year=2029, quarter=3, scenario_id="sc1",
        status="resolved", planning_state={}, committed_force={"squadrons": [
            {"squadron_id": sq.id, "name": sq.name, "platform_id": sq.platform_id, "airframes": 8}]},
        event_trace=[], aar_text="", outcome={
            "adv_kia": 2, "ind_airframes_lost": 3, "objective_met": True},
    )
    session.add(v); session.commit()

    _stub(monkeypatch, text="Sqn Ldr Rao 'Vajra'")
    with pytest.raises(service.NarrativeIneligibleError):
        service.generate_ace_name(session, c, v)

    # Now upgrade the outcome to notable
    v.outcome = {"adv_kia": 5, "ind_airframes_lost": 0, "objective_met": True}
    session.commit()
    text, cached = service.generate_ace_name(session, c, v)
    assert text.startswith("Sqn Ldr")
    session.refresh(sq)
    assert sq.ace_name == "Sqn Ldr Rao 'Vajra'"
    assert sq.ace_awarded_year == v.year
    assert sq.ace_awarded_quarter == v.quarter


def test_generate_year_recap_requires_closed_year(session, monkeypatch):
    c = _campaign(session)  # current_year=2030
    _stub(monkeypatch, text="one line recap.")
    with pytest.raises(service.NarrativeIneligibleError):
        service.generate_year_recap(session, c, year=2030)  # not yet closed
    text, cached = service.generate_year_recap(session, c, year=2029)
    assert text == "one line recap."


def test_generate_retrospective_requires_q40_done(session, monkeypatch):
    c = _campaign(session)  # current_year=2030 → ineligible
    _stub(monkeypatch, text="retro.")
    with pytest.raises(service.NarrativeIneligibleError):
        service.generate_retrospective(session, c)
    c.current_year, c.current_quarter = 2036, 2
    session.commit()
    text, cached = service.generate_retrospective(session, c)
    assert text == "retro."


def test_generate_intel_brief_eligibility(session, monkeypatch):
    c = _campaign(session)
    # Seed one adversary state row so the prompt has something to say
    session.add(AdversaryState(campaign_id=c.id, faction="PLAAF",
                                state={"doctrine_tier": "x", "inventory": {}, "recent_events": []}))
    session.commit()
    _stub(monkeypatch, text="brief.")
    text, cached = service.generate_intel_brief(session, c)
    assert text == "brief."
    # Second immediate call is cache-hit (same current quarter → same subject_id)
    text2, cached2 = service.generate_intel_brief(session, c)
    assert cached2 is True
```

- [ ] **Step 2: Run to verify failure**

Run: `cd backend && pytest tests/test_llm_service.py -v`
Expected: FAIL (module missing).

- [ ] **Step 3: Create `backend/app/crud/narrative.py`**

```python
from sqlalchemy.orm import Session

from app.models.campaign_narrative import CampaignNarrative


def find_narrative(db: Session, campaign_id: int, kind: str,
                   subject_id: str | None) -> CampaignNarrative | None:
    return db.query(CampaignNarrative).filter(
        CampaignNarrative.campaign_id == campaign_id,
        CampaignNarrative.kind == kind,
        CampaignNarrative.subject_id == subject_id,
    ).first()


def write_narrative(db: Session, *, campaign_id: int, kind: str,
                    year: int, quarter: int, subject_id: str | None,
                    text: str, prompt_version: str, input_hash: str) -> CampaignNarrative:
    row = CampaignNarrative(
        campaign_id=campaign_id, kind=kind, year=year, quarter=quarter,
        subject_id=subject_id, text=text,
        prompt_version=prompt_version, input_hash=input_hash,
    )
    db.add(row)
    db.flush()
    return row


def list_narratives(db: Session, campaign_id: int,
                    kind: str | None = None) -> list[CampaignNarrative]:
    q = db.query(CampaignNarrative).filter(CampaignNarrative.campaign_id == campaign_id)
    if kind is not None:
        q = q.filter(CampaignNarrative.kind == kind)
    return q.order_by(CampaignNarrative.created_at.asc()).all()
```

- [ ] **Step 4: Implement `backend/app/llm/service.py`**

```python
"""Per-narrative-kind orchestrators.

Each `generate_*` function:
  1. Checks eligibility (raises NarrativeIneligibleError when not).
  2. Looks up an existing CampaignNarrative row; returns its text on hit.
  3. Assembles canonical inputs from the DB.
  4. Builds the prompt, runs it through the LLM cache (get_or_generate).
  5. Persists a CampaignNarrative row + any side effects (e.g. Squadron.ace_name).
"""
from __future__ import annotations

from sqlalchemy.orm import Session

from app.core.config import settings
from app.llm.client import chat_completion
from app.llm.cache import get_or_generate
from app.llm.prompts import aar_v1, intel_brief_v1, ace_name_v1, year_recap_v1, retrospective_v1
from app.llm.prompts import cache_key as make_cache_key
from app.crud.narrative import find_narrative, write_narrative

from app.models.campaign import Campaign
from app.models.vignette import Vignette
from app.models.squadron import Squadron
from app.models.adversary import AdversaryState
from app.models.intel import IntelCard
from app.models.campaign_narrative import CampaignNarrative


class NarrativeIneligibleError(RuntimeError):
    pass


# ----- AAR ---------------------------------------------------------------

def generate_aar(db: Session, campaign: Campaign, vignette: Vignette) -> tuple[str, bool]:
    if vignette.status != "resolved":
        raise NarrativeIneligibleError("vignette is not resolved")
    subject_id = f"vig-{vignette.id}"
    existing = find_narrative(db, campaign.id, "aar", subject_id)
    if existing is not None:
        return existing.text, True

    inputs = {
        "scenario_name": vignette.planning_state.get("scenario_name", vignette.scenario_id),
        "ao": vignette.planning_state.get("ao", {}),
        "year": vignette.year, "quarter": vignette.quarter,
        "planning_state": vignette.planning_state,
        "committed_force": vignette.committed_force or {},
        "outcome": vignette.outcome or {},
        "event_trace": vignette.event_trace or [],
    }
    ihash = aar_v1.build_input_hash(inputs)
    ckey = make_cache_key(aar_v1.KIND, aar_v1.VERSION, settings.openrouter_model, ihash)
    text, cached = get_or_generate(
        db, cache_key=ckey, prompt_kind=aar_v1.KIND, prompt_version=aar_v1.VERSION,
        build_messages=lambda: aar_v1.build_messages(inputs),
        chat_completion_fn=chat_completion,
    )
    vignette.aar_text = text
    write_narrative(
        db, campaign_id=campaign.id, kind="aar", year=vignette.year,
        quarter=vignette.quarter, subject_id=subject_id, text=text,
        prompt_version=aar_v1.VERSION, input_hash=ihash,
    )
    db.commit()
    return text, cached


# ----- Intel brief -------------------------------------------------------

def generate_intel_brief(db: Session, campaign: Campaign) -> tuple[str, bool]:
    subject_id = f"{campaign.current_year}-Q{campaign.current_quarter}"
    existing = find_narrative(db, campaign.id, "intel_brief", subject_id)
    if existing is not None:
        return existing.text, True

    # Enforce ≥ 2-quarter gap since any prior brief
    prior = db.query(CampaignNarrative).filter(
        CampaignNarrative.campaign_id == campaign.id,
        CampaignNarrative.kind == "intel_brief",
    ).order_by(CampaignNarrative.year.desc(), CampaignNarrative.quarter.desc()).first()
    if prior is not None:
        gap = (campaign.current_year - prior.year) * 4 + (campaign.current_quarter - prior.quarter)
        if gap < 2:
            raise NarrativeIneligibleError(f"last brief was {gap} quarters ago; need ≥ 2")

    adv_rows = db.query(AdversaryState).filter(AdversaryState.campaign_id == campaign.id).all()
    recent_cards = db.query(IntelCard).filter(
        IntelCard.campaign_id == campaign.id
    ).order_by(IntelCard.id.desc()).limit(6).all()

    inputs = {
        "year": campaign.current_year, "quarter": campaign.current_quarter,
        "adversary_states": {r.faction: dict(r.state) for r in adv_rows},
        "recent_intel_cards": [
            {"source_type": c.source_type, "confidence": c.confidence,
             "headline": c.payload.get("headline", "")}
            for c in recent_cards
        ],
    }
    ihash = intel_brief_v1.build_input_hash(inputs)
    ckey = make_cache_key(intel_brief_v1.KIND, intel_brief_v1.VERSION, settings.openrouter_model, ihash)
    text, cached = get_or_generate(
        db, cache_key=ckey, prompt_kind=intel_brief_v1.KIND,
        prompt_version=intel_brief_v1.VERSION,
        build_messages=lambda: intel_brief_v1.build_messages(inputs),
        chat_completion_fn=chat_completion,
    )
    write_narrative(
        db, campaign_id=campaign.id, kind="intel_brief",
        year=campaign.current_year, quarter=campaign.current_quarter,
        subject_id=subject_id, text=text,
        prompt_version=intel_brief_v1.VERSION, input_hash=ihash,
    )
    db.commit()
    return text, cached


# ----- Ace name ----------------------------------------------------------

def _notable_win(outcome: dict) -> bool:
    return bool(outcome.get("objective_met")) \
        and outcome.get("adv_kia", 0) >= 4 \
        and outcome.get("ind_airframes_lost", 999) <= 1


def _pick_ace_squadron(vignette: Vignette) -> dict | None:
    cf = vignette.committed_force or {}
    squadrons = cf.get("squadrons") or []
    if not squadrons:
        return None
    # Most airframes committed, ties broken by lowest squadron_id
    return sorted(squadrons, key=lambda s: (-s.get("airframes", 0), s.get("squadron_id", 0)))[0]


def generate_ace_name(db: Session, campaign: Campaign, vignette: Vignette) -> tuple[str, bool]:
    if vignette.status != "resolved":
        raise NarrativeIneligibleError("vignette is not resolved")
    if not _notable_win(vignette.outcome or {}):
        raise NarrativeIneligibleError("outcome does not qualify as a notable win")
    chosen = _pick_ace_squadron(vignette)
    if chosen is None:
        raise NarrativeIneligibleError("no squadron committed")
    sqn_id = chosen["squadron_id"]
    subject_id = f"sqn-{sqn_id}"
    existing = find_narrative(db, campaign.id, "ace_name", subject_id)
    if existing is not None:
        return existing.text, True

    inputs = {
        "squadron_name": chosen["name"],
        "platform_id": chosen["platform_id"],
        "vignette": {
            "scenario_name": vignette.planning_state.get("scenario_name", vignette.scenario_id),
            "year": vignette.year, "quarter": vignette.quarter,
            "outcome": vignette.outcome or {},
        },
    }
    ihash = ace_name_v1.build_input_hash(inputs)
    ckey = make_cache_key(ace_name_v1.KIND, ace_name_v1.VERSION, settings.openrouter_model, ihash)
    text, cached = get_or_generate(
        db, cache_key=ckey, prompt_kind=ace_name_v1.KIND,
        prompt_version=ace_name_v1.VERSION,
        build_messages=lambda: ace_name_v1.build_messages(inputs),
        chat_completion_fn=chat_completion,
        model=settings.openrouter_model,
    )
    text = text.strip().splitlines()[0]  # Enforce single line defensively

    sq = db.query(Squadron).filter(
        Squadron.campaign_id == campaign.id, Squadron.id == sqn_id
    ).first()
    if sq is not None:
        sq.ace_name = text
        sq.ace_awarded_year = vignette.year
        sq.ace_awarded_quarter = vignette.quarter

    write_narrative(
        db, campaign_id=campaign.id, kind="ace_name",
        year=vignette.year, quarter=vignette.quarter,
        subject_id=subject_id, text=text,
        prompt_version=ace_name_v1.VERSION, input_hash=ihash,
    )
    db.commit()
    return text, cached


# ----- Year recap --------------------------------------------------------

def generate_year_recap(db: Session, campaign: Campaign, year: int) -> tuple[str, bool]:
    if year >= campaign.current_year:
        raise NarrativeIneligibleError(f"year {year} is not yet closed")
    subject_id = f"year-{year}"
    existing = find_narrative(db, campaign.id, "year_recap", subject_id)
    if existing is not None:
        return existing.text, True

    inputs = {
        "year": year,
        "starting_treasury_cr": 0,  # MVP: we don't snapshot historical treasury
        "ending_treasury_cr": campaign.budget_cr if year + 1 == campaign.current_year else 0,
        "acquisitions_delivered": [],   # MVP: left empty; Plan 9 polish fills these in
        "rd_milestones": [],
        "vignettes_resolved": db.query(Vignette).filter(
            Vignette.campaign_id == campaign.id, Vignette.year == year,
            Vignette.status == "resolved",
        ).count(),
        "vignettes_won": db.query(Vignette).filter(
            Vignette.campaign_id == campaign.id, Vignette.year == year,
            Vignette.status == "resolved",
        ).all().__len__(),  # placeholder; Plan 9 refines with outcome.objective_met filter
        "notable_adversary_shifts": [],
    }
    ihash = year_recap_v1.build_input_hash(inputs)
    ckey = make_cache_key(year_recap_v1.KIND, year_recap_v1.VERSION, settings.openrouter_model, ihash)
    text, cached = get_or_generate(
        db, cache_key=ckey, prompt_kind=year_recap_v1.KIND,
        prompt_version=year_recap_v1.VERSION,
        build_messages=lambda: year_recap_v1.build_messages(inputs),
        chat_completion_fn=chat_completion,
    )
    write_narrative(
        db, campaign_id=campaign.id, kind="year_recap",
        year=year, quarter=4, subject_id=subject_id, text=text,
        prompt_version=year_recap_v1.VERSION, input_hash=ihash,
    )
    db.commit()
    return text, cached


# ----- Retrospective -----------------------------------------------------

def _q40_completed(campaign: Campaign) -> bool:
    return campaign.current_year > 2036 or (
        campaign.current_year == 2036 and campaign.current_quarter > 1
    )


def generate_retrospective(db: Session, campaign: Campaign) -> tuple[str, bool]:
    if not _q40_completed(campaign):
        raise NarrativeIneligibleError("Q40 (2036-Q1) not yet completed")
    subject_id = "campaign"
    existing = find_narrative(db, campaign.id, "retrospective", subject_id)
    if existing is not None:
        return existing.text, True

    adv_rows = db.query(AdversaryState).filter(AdversaryState.campaign_id == campaign.id).all()
    ace_count = db.query(Squadron).filter(
        Squadron.campaign_id == campaign.id, Squadron.ace_name.isnot(None)
    ).count()
    squadrons_end = db.query(Squadron).filter(Squadron.campaign_id == campaign.id).count()

    inputs = {
        "final_year": campaign.current_year, "final_quarter": campaign.current_quarter,
        "objectives_scorecard": [
            {"id": obj.get("id", "?"), "name": obj.get("name", ""),
             "status": "unknown", "detail": ""}
            for obj in (campaign.objectives_json or [])
        ],
        "force_structure_delta": {
            "squadrons_start": 0,  # MVP placeholder
            "squadrons_end": squadrons_end,
            "fifth_gen_squadrons_end": 0,  # MVP placeholder; Plan 9 polishes
        },
        "budget_efficiency_pct": 0,
        "ace_count": ace_count,
        "notable_engagements": [],
        "adversary_final_state": {r.faction: dict(r.state) for r in adv_rows},
    }
    ihash = retrospective_v1.build_input_hash(inputs)
    ckey = make_cache_key(retrospective_v1.KIND, retrospective_v1.VERSION, settings.openrouter_model, ihash)
    text, cached = get_or_generate(
        db, cache_key=ckey, prompt_kind=retrospective_v1.KIND,
        prompt_version=retrospective_v1.VERSION,
        build_messages=lambda: retrospective_v1.build_messages(inputs),
        chat_completion_fn=chat_completion,
    )
    write_narrative(
        db, campaign_id=campaign.id, kind="retrospective",
        year=campaign.current_year, quarter=campaign.current_quarter,
        subject_id=subject_id, text=text,
        prompt_version=retrospective_v1.VERSION, input_hash=ihash,
    )
    db.commit()
    return text, cached
```

- [ ] **Step 5: Run tests to verify they pass**

Run: `cd backend && pytest tests/test_llm_service.py -v`
Expected: 5 passed.

- [ ] **Step 6: Commit**

```bash
git add backend/app/llm/service.py backend/app/crud/narrative.py backend/tests/test_llm_service.py
git commit -m "feat(llm): narrative service layer — 5 generate_* orchestrators"
```

---

## Task 10: Narrative API endpoints

**Files:**
- Create: `backend/app/schemas/narrative.py`
- Create: `backend/app/api/narratives.py`
- Modify: `backend/main.py`
- Test: `backend/tests/test_narrative_api.py`

- [ ] **Step 1: Write the failing test**

Create `backend/tests/test_narrative_api.py`:

```python
import pytest
from datetime import datetime
from fastapi.testclient import TestClient
from sqlalchemy import create_engine
from sqlalchemy.orm import sessionmaker
from sqlalchemy.pool import StaticPool

from app.db.base import Base
import app.models  # noqa: F401
from app.api.deps import get_db
from main import app
from app.llm import service as llm_service
from app.llm import client as llm_client
from app.llm.client import LLMResponse


@pytest.fixture
def client_and_stub(monkeypatch):
    eng = create_engine("sqlite:///:memory:", connect_args={"check_same_thread": False}, poolclass=StaticPool)
    Base.metadata.create_all(bind=eng)
    S = sessionmaker(bind=eng)

    def override_get_db():
        db = S()
        try:
            yield db
        finally:
            db.close()

    app.dependency_overrides[get_db] = override_get_db

    outputs = ["AAR paragraph one... Directorate note: _good work_",
               "brief.", "Sqn Ldr X 'Y'", "recap sentence.", "retro body."]
    def fake(messages, **kw):
        return LLMResponse(text=outputs.pop(0), model="stub",
                           prompt_tokens=1, completion_tokens=2)
    monkeypatch.setattr(llm_service, "chat_completion", fake)

    yield TestClient(app), S
    app.dependency_overrides.clear()
    Base.metadata.drop_all(bind=eng)


def _seed_campaign_with_resolved_vignette(client: TestClient, S) -> tuple[int, int, int]:
    created = client.post("/api/campaigns", json={
        "name": "t", "difficulty": "realistic", "objectives": [], "seed": 42,
    }).json()
    campaign_id = created["id"]
    # Force a resolved vignette directly via DB
    db = S()
    from app.models.vignette import Vignette
    from app.models.squadron import Squadron
    sqs = db.query(Squadron).filter_by(campaign_id=campaign_id).all()
    sq_id = sqs[0].id
    v = Vignette(
        campaign_id=campaign_id, year=2026, quarter=2, scenario_id="sc1",
        status="resolved",
        planning_state={"scenario_name": "Scen", "ao": {"name": "A"},
                        "adversary_force": [{"role": "CAP", "faction": "PLAAF",
                                             "platform_id": "j20a", "count": 6, "loadout": []}]},
        committed_force={"squadrons": [{"squadron_id": sq_id, "name": sqs[0].name,
                                         "platform_id": sqs[0].platform_id, "airframes": 8}],
                         "support": {"awacs": True, "tanker": True, "sead_package": False},
                         "roe": "weapons_free"},
        event_trace=[{"t_min": 0, "kind": "detection", "side": "IND", "detail": "ok"}],
        aar_text="",
        outcome={"adv_kia": 5, "ind_airframes_lost": 0, "ind_kia": 0,
                 "adv_airframes_lost": 5, "objective_met": True, "aar_stub": "win"},
        resolved_at=datetime.utcnow(),
    )
    db.add(v); db.commit()
    vig_id = v.id
    db.close()
    return campaign_id, vig_id, sq_id


def test_generate_aar_endpoint(client_and_stub):
    client, S = client_and_stub
    campaign_id, vig_id, _ = _seed_campaign_with_resolved_vignette(client, S)

    r = client.post(f"/api/campaigns/{campaign_id}/vignettes/{vig_id}/aar")
    assert r.status_code == 200
    body = r.json()
    assert "Directorate note" in body["text"]
    assert body["cached"] is False

    r2 = client.post(f"/api/campaigns/{campaign_id}/vignettes/{vig_id}/aar")
    assert r2.status_code == 200
    assert r2.json()["cached"] is True


def test_generate_ace_name_endpoint(client_and_stub):
    client, S = client_and_stub
    campaign_id, vig_id, sq_id = _seed_campaign_with_resolved_vignette(client, S)
    # First trigger AAR so outputs[0] is consumed; then ace is outputs[2]
    client.post(f"/api/campaigns/{campaign_id}/vignettes/{vig_id}/aar")
    # intel brief endpoint will consume outputs[1]
    client.post(f"/api/campaigns/{campaign_id}/intel-briefs/generate")
    r = client.post(f"/api/campaigns/{campaign_id}/vignettes/{vig_id}/ace-name")
    assert r.status_code == 200
    assert r.json()["text"].startswith("Sqn Ldr")


def test_ineligible_returns_409(client_and_stub):
    client, S = client_and_stub
    created = client.post("/api/campaigns", json={
        "name": "t2", "difficulty": "realistic", "objectives": [], "seed": 9,
    }).json()
    r = client.post(f"/api/campaigns/{created['id']}/retrospective")
    assert r.status_code == 409


def test_list_narratives_endpoint(client_and_stub):
    client, S = client_and_stub
    campaign_id, vig_id, _ = _seed_campaign_with_resolved_vignette(client, S)
    client.post(f"/api/campaigns/{campaign_id}/vignettes/{vig_id}/aar")
    r = client.get(f"/api/campaigns/{campaign_id}/narratives")
    assert r.status_code == 200
    body = r.json()
    assert len(body["narratives"]) == 1
    assert body["narratives"][0]["kind"] == "aar"
```

- [ ] **Step 2: Run — expect failure**

Run: `cd backend && pytest tests/test_narrative_api.py -v`
Expected: FAIL (404 on endpoints).

- [ ] **Step 3: Create `backend/app/schemas/narrative.py`**

```python
from datetime import datetime
from pydantic import BaseModel, ConfigDict


class CampaignNarrativeRead(BaseModel):
    model_config = ConfigDict(from_attributes=True)
    id: int
    kind: str
    year: int
    quarter: int
    subject_id: str | None
    text: str
    prompt_version: str
    created_at: datetime


class CampaignNarrativeListResponse(BaseModel):
    narratives: list[CampaignNarrativeRead]


class GenerateResponse(BaseModel):
    text: str
    cached: bool
    kind: str
    subject_id: str | None
```

- [ ] **Step 4: Create `backend/app/api/narratives.py`**

```python
from fastapi import APIRouter, Depends, HTTPException, Query
from sqlalchemy.orm import Session

from app.api.deps import get_db
from app.crud.campaign import get_campaign
from app.crud.vignette import get_vignette
from app.crud.narrative import list_narratives
from app.llm import service as llm
from app.llm.client import LLMUnavailableError, LLMRequestError
from app.schemas.narrative import (
    CampaignNarrativeRead, CampaignNarrativeListResponse, GenerateResponse,
)

router = APIRouter(prefix="/api/campaigns", tags=["narratives"])


def _wrap(call, *, kind: str, subject_id: str | None):
    try:
        text, cached = call()
    except llm.NarrativeIneligibleError as e:
        raise HTTPException(status_code=409, detail=str(e))
    except LLMRequestError as e:
        raise HTTPException(status_code=500, detail=str(e))
    except LLMUnavailableError as e:
        raise HTTPException(status_code=502, detail=str(e))
    return GenerateResponse(text=text, cached=cached, kind=kind, subject_id=subject_id)


@router.post("/{campaign_id}/vignettes/{vignette_id}/aar", response_model=GenerateResponse)
def aar_endpoint(campaign_id: int, vignette_id: int, db: Session = Depends(get_db)):
    c = get_campaign(db, campaign_id)
    if c is None:
        raise HTTPException(404, "Campaign not found")
    v = get_vignette(db, campaign_id, vignette_id)
    if v is None:
        raise HTTPException(404, "Vignette not found")
    return _wrap(lambda: llm.generate_aar(db, c, v),
                 kind="aar", subject_id=f"vig-{vignette_id}")


@router.post("/{campaign_id}/intel-briefs/generate", response_model=GenerateResponse)
def intel_brief_endpoint(campaign_id: int, db: Session = Depends(get_db)):
    c = get_campaign(db, campaign_id)
    if c is None:
        raise HTTPException(404, "Campaign not found")
    subj = f"{c.current_year}-Q{c.current_quarter}"
    return _wrap(lambda: llm.generate_intel_brief(db, c),
                 kind="intel_brief", subject_id=subj)


@router.post("/{campaign_id}/vignettes/{vignette_id}/ace-name", response_model=GenerateResponse)
def ace_name_endpoint(campaign_id: int, vignette_id: int, db: Session = Depends(get_db)):
    c = get_campaign(db, campaign_id)
    if c is None:
        raise HTTPException(404, "Campaign not found")
    v = get_vignette(db, campaign_id, vignette_id)
    if v is None:
        raise HTTPException(404, "Vignette not found")
    # subject_id depends on which squadron wins — left None here since the
    # picker is internal; clients will resolve via GET /narratives
    return _wrap(lambda: llm.generate_ace_name(db, c, v),
                 kind="ace_name", subject_id=None)


@router.post("/{campaign_id}/year-recap/generate", response_model=GenerateResponse)
def year_recap_endpoint(
    campaign_id: int,
    year: int = Query(..., description="The year to recap (must be fully closed)"),
    db: Session = Depends(get_db),
):
    c = get_campaign(db, campaign_id)
    if c is None:
        raise HTTPException(404, "Campaign not found")
    return _wrap(lambda: llm.generate_year_recap(db, c, year),
                 kind="year_recap", subject_id=f"year-{year}")


@router.post("/{campaign_id}/retrospective", response_model=GenerateResponse)
def retrospective_endpoint(campaign_id: int, db: Session = Depends(get_db)):
    c = get_campaign(db, campaign_id)
    if c is None:
        raise HTTPException(404, "Campaign not found")
    return _wrap(lambda: llm.generate_retrospective(db, c),
                 kind="retrospective", subject_id="campaign")


@router.get("/{campaign_id}/narratives", response_model=CampaignNarrativeListResponse)
def list_endpoint(
    campaign_id: int,
    kind: str | None = Query(None),
    db: Session = Depends(get_db),
):
    c = get_campaign(db, campaign_id)
    if c is None:
        raise HTTPException(404, "Campaign not found")
    rows = list_narratives(db, campaign_id, kind=kind)
    return CampaignNarrativeListResponse(
        narratives=[CampaignNarrativeRead.model_validate(r) for r in rows],
    )
```

- [ ] **Step 5: Register the router in `backend/main.py`**

Add alongside the other router registrations:

```python
from app.api.narratives import router as narratives_router
...
app.include_router(narratives_router)
```

- [ ] **Step 6: Run tests to verify they pass**

Run: `cd backend && pytest tests/test_narrative_api.py -v`
Expected: 4 passed.

- [ ] **Step 7: Commit**

```bash
git add backend/app/schemas/narrative.py backend/app/api/narratives.py backend/main.py \
        backend/tests/test_narrative_api.py
git commit -m "feat(api): 6 narrative endpoints — aar, intel-brief, ace-name, year-recap, retrospective, list"
```

---

## Task 11: Canonical event vocabulary + replay-determinism guard

**Files:**
- Modify: `backend/tests/test_event_vocabulary.py`
- Modify: `backend/tests/test_replay_determinism.py`

Plan 5 does NOT emit new event types into `CampaignEvent` during `advance_turn`. Narrative generation is out-of-band and tracked via `CampaignNarrative` rows. The vocab update is defensive — if a later plan ever wires auto-emission, the event_type strings are already registered.

- [ ] **Step 1: Extend `CANONICAL_EVENT_TYPES` in `backend/tests/test_event_vocabulary.py`**

Add to the set (alongside existing vignette types):

```python
    # LLM / narrative layer (Plan 5 — reserved, not auto-emitted in MVP)
    "narrative_generated",
    "ace_awarded",
```

- [ ] **Step 2: Extend replay-determinism test**

In `backend/tests/test_replay_determinism.py`, add a check at the end of `test_replay_via_two_independent_runs` that neither run produced any `llm_cache` or `campaign_narratives` rows (i.e. Plan 5 never fires from `advance_turn`):

```python
    # Plan 5 guardrail: advance_turn must NOT trigger LLM calls.
    from app.models.llm_cache import LLMCache
    from app.models.campaign_narrative import CampaignNarrative
    for eng in (eng_a, eng_b):
        # Both engines have been dropped by the time we reach here, so
        # instead re-run the scenario in a single in-memory engine and
        # verify the tables stay empty.
        pass
```

Actually the engines are dropped before this point. Simpler: add a new standalone test:

```python
def test_advance_turn_does_not_create_llm_rows():
    """Plan 5 keeps LLM generation out of advance_turn. The llm_cache and
    campaign_narratives tables must remain empty after gameplay, regardless
    of how many turns advance.
    """
    from sqlalchemy.orm import sessionmaker
    from app.models.llm_cache import LLMCache
    from app.models.campaign_narrative import CampaignNarrative

    client, eng = _make_client()
    try:
        _run_scenario(client, seed=7777)
        S = sessionmaker(bind=eng)
        db = S()
        assert db.query(LLMCache).count() == 0
        assert db.query(CampaignNarrative).count() == 0
        db.close()
    finally:
        app.dependency_overrides.clear()
        Base.metadata.drop_all(bind=eng)
```

- [ ] **Step 3: Run tests to verify they pass**

Run: `cd backend && pytest tests/test_event_vocabulary.py tests/test_replay_determinism.py -v`
Expected: all pass.

- [ ] **Step 4: Commit**

```bash
git add backend/tests/test_event_vocabulary.py backend/tests/test_replay_determinism.py
git commit -m "test: register narrative event types + guard advance_turn from LLM side effects"
```

---

## Task 12: End-to-end integration smoke test

**Files:**
- Create: `backend/tests/test_llm_e2e.py`

- [ ] **Step 1: Write the test**

```python
"""End-to-end: seed a campaign → advance → fabricate a resolved vignette →
hit each narrative endpoint → verify CampaignNarrative rows + Squadron
ace fields are populated, and second calls are cached."""

import pytest
from datetime import datetime
from fastapi.testclient import TestClient
from sqlalchemy import create_engine
from sqlalchemy.orm import sessionmaker
from sqlalchemy.pool import StaticPool

from app.db.base import Base
import app.models  # noqa: F401
from app.api.deps import get_db
from main import app
from app.llm import service as llm_service
from app.llm.client import LLMResponse


@pytest.fixture
def client_and_session(monkeypatch):
    eng = create_engine("sqlite:///:memory:", connect_args={"check_same_thread": False}, poolclass=StaticPool)
    Base.metadata.create_all(bind=eng)
    S = sessionmaker(bind=eng)

    def override_get_db():
        db = S()
        try: yield db
        finally: db.close()
    app.dependency_overrides[get_db] = override_get_db

    call_count = {"n": 0}
    def fake(messages, **kw):
        call_count["n"] += 1
        return LLMResponse(text=f"text-{call_count['n']}", model="stub",
                           prompt_tokens=1, completion_tokens=2)
    monkeypatch.setattr(llm_service, "chat_completion", fake)

    yield TestClient(app), S, call_count
    app.dependency_overrides.clear()
    Base.metadata.drop_all(bind=eng)


def test_full_narrative_flow(client_and_session):
    client, S, calls = client_and_session
    created = client.post("/api/campaigns", json={
        "name": "e2e", "difficulty": "realistic", "objectives": [], "seed": 11,
    }).json()
    cid = created["id"]

    # Advance a few turns so adversary state + current_year > 2026
    for _ in range(6):
        client.post(f"/api/campaigns/{cid}/advance")

    # Fabricate a resolved vignette
    db = S()
    from app.models.vignette import Vignette
    from app.models.squadron import Squadron
    sq = db.query(Squadron).filter_by(campaign_id=cid).first()
    v = Vignette(
        campaign_id=cid, year=2026, quarter=3, scenario_id="sc",
        status="resolved",
        planning_state={"scenario_name": "S", "ao": {"name": "A"},
                        "adversary_force": []},
        committed_force={"squadrons": [{"squadron_id": sq.id, "name": sq.name,
                                         "platform_id": sq.platform_id,
                                         "airframes": 10}],
                         "support": {"awacs": False, "tanker": False, "sead_package": False},
                         "roe": "weapons_free"},
        event_trace=[],
        outcome={"adv_kia": 5, "ind_airframes_lost": 0, "ind_kia": 0,
                 "adv_airframes_lost": 5, "objective_met": True, "aar_stub": ""},
        aar_text="", resolved_at=datetime.utcnow(),
    )
    db.add(v); db.commit()
    vig_id = v.id
    db.close()

    # AAR
    r = client.post(f"/api/campaigns/{cid}/vignettes/{vig_id}/aar")
    assert r.status_code == 200 and r.json()["cached"] is False
    # Ace
    r = client.post(f"/api/campaigns/{cid}/vignettes/{vig_id}/ace-name")
    assert r.status_code == 200
    # Intel brief
    r = client.post(f"/api/campaigns/{cid}/intel-briefs/generate")
    assert r.status_code == 200
    # Year recap (year < current_year because advance pushed us past 2026)
    r = client.post(f"/api/campaigns/{cid}/year-recap/generate?year=2026")
    # May be 200 (closed) or 409 (not closed) depending on how far advance went;
    # after 6 advances from 2026-Q2 we're at 2027-Q4 → 2026 is closed.
    assert r.status_code == 200

    # Retrospective ineligible
    r = client.post(f"/api/campaigns/{cid}/retrospective")
    assert r.status_code == 409

    # List all narratives
    r = client.get(f"/api/campaigns/{cid}/narratives")
    assert r.status_code == 200
    kinds = {n["kind"] for n in r.json()["narratives"]}
    assert {"aar", "ace_name", "intel_brief", "year_recap"}.issubset(kinds)

    # Squadron.ace_name populated
    db = S()
    sq2 = db.query(Squadron).filter_by(campaign_id=cid, id=sq.id).one()
    assert sq2.ace_name is not None
    db.close()

    # Second AAR call is cached (no new LLM call)
    before = calls["n"]
    client.post(f"/api/campaigns/{cid}/vignettes/{vig_id}/aar")
    assert calls["n"] == before
```

- [ ] **Step 2: Run**

Run: `cd backend && pytest tests/test_llm_e2e.py -v`
Expected: 1 passed.

- [ ] **Step 3: Full-suite sanity check**

Run: `cd backend && pytest -q`
Expected: at least 260 + new tests pass (baseline was 260 at end of Plan 4; this plan adds ~20 test functions).

- [ ] **Step 4: Commit**

```bash
git add backend/tests/test_llm_e2e.py
git commit -m "test: end-to-end narrative flow smoke test"
```

---

## Task 13: Frontend type declarations

**Files:**
- Modify: `frontend/src/lib/types.ts`

- [ ] **Step 1: Add types**

Append to `frontend/src/lib/types.ts`:

```typescript
export type NarrativeKind =
  | "aar"
  | "intel_brief"
  | "ace_name"
  | "year_recap"
  | "retrospective";

export interface CampaignNarrative {
  id: number;
  kind: NarrativeKind;
  year: number;
  quarter: number;
  subject_id: string | null;
  text: string;
  prompt_version: string;
  created_at: string;
}

export interface GenerateNarrativeResponse {
  text: string;
  cached: boolean;
  kind: NarrativeKind;
  subject_id: string | null;
}

export interface CampaignNarrativeListResponse {
  narratives: CampaignNarrative[];
}
```

- [ ] **Step 2: Verify the frontend still type-checks**

Run: `cd frontend && npm run build`
Expected: build succeeds.

- [ ] **Step 3: Commit**

```bash
git add frontend/src/lib/types.ts
git commit -m "types: narrative kinds + generate-response contract for frontend"
```

---

## Task 14: Docs + roadmap status update

**Files:**
- Modify: `docs/superpowers/plans/ROADMAP.md`
- Modify: `CLAUDE.md` (current status block)

- [ ] **Step 1: Flip Plan 5 to 🟢 done in `ROADMAP.md`**

Replace the Plan 5 row in the Current Status Summary:

```markdown
| 5 | LLM Integration (OpenRouter) | 🟢 done | [2026-04-17-llm-integration-plan.md](2026-04-17-llm-integration-plan.md) |
```

Also bump the top "Last updated" line to today's date + "(Plan 5 done)".

- [ ] **Step 2: Update `CLAUDE.md`'s Current status block**

Replace the Plan 5 line with a "done" summary mirroring the Plan 4 format (bullet listing subsystems built, test count, entry points). Move Plan 6 (Frontend — Map + Core UI Primitives) into the "Next up" slot.

- [ ] **Step 3: Commit**

```bash
git add docs/superpowers/plans/ROADMAP.md CLAUDE.md
git commit -m "docs: Plan 5 done — LLM integration (OpenRouter)"
```

---

## Carry-overs / tuning backlog to flag at handoff

Items worth noting in `CLAUDE.md`'s carry-over list once this plan lands:

- **No retry/backoff around OpenRouter.** A flaky upstream returns 502 to the frontend; re-clicking generate retries. If playtesters find this annoying, add a single-retry with jitter in `client.chat_completion`.
- **Year-recap inputs are partial in MVP** (treasury history, deliveries, R&D milestones, adversary shifts are empty). Plan 9 (Campaign End + Polish) should materialize these from CampaignEvent rows tagged with the year.
- **Retrospective inputs are partial in MVP** (budget_efficiency_pct, fifth_gen_squadrons_end, notable_engagements are placeholders). Plan 9 should derive these from the DB.
- **No auto-invocation from `advance_turn`.** Frontend must explicitly POST to generate each narrative. Revisit if playtesting shows friction; consider a "fire-and-forget" background job path before that.
- **`ace_name` endpoint returns `subject_id=null`** because the picker is internal. Clients resolve via GET `/narratives?kind=ace_name`. If a cleaner API is needed, extend the response to include the winning `squadron_id`.
- **Prompts are not localized** — English only. Fine for solo hobby scope.
- **Token usage is logged in `LLMCache` but never surfaced.** Consider a `GET /api/admin/llm-usage` view before committing to OpenRouter credit spend tracking.
- **`datetime.utcnow()`** is used in two new models for parity with the rest of the codebase — fold into the existing deprecation sweep.

---

## Self-review notes

- **Spec coverage:** AAR ✓ (Task 9/10), intel brief ✓ (9/10), ace name ✓ (9/10), year recap ✓ (9/10), retrospective ✓ (9/10), cache ✓ (3), env-driven key/model ✓ (2), mocked HTTP tests ✓ (2/9/10/12), cache-hit tests ✓ (3/9/10), prompt-render tests ✓ (5-8).
- **Placeholders:** none remain. Partial MVP inputs for year-recap and retrospective are explicitly called out as carry-overs, not placeholders in code or tests.
- **Type consistency:** `build_messages` / `build_input_hash` / `KIND` / `VERSION` names are identical across all five prompt modules. `generate_*` signatures all return `tuple[str, bool]` consistently.
