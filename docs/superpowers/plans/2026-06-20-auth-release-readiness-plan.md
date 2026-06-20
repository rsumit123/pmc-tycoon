# Auth + Multi-User Release Readiness Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add Google + email/password auth, scope every campaign to its owning user, harden SQLite for concurrency, and cap LLM spend — making Sovereign Shield safe to open to external testers.

**Architecture:** App-issued JWT access+refresh pair (chillbill pattern). Frontend gets a Google ID token via Google Identity Services, POSTs it; backend verifies with `google-auth` and mints app tokens. A shared `require_owned_campaign` dependency, attached at `include_router(...)` level in `main.py`, guards all ~22 campaign-scoped routers (404 on non-owned). `campaigns.py` and `campaign_export.py` are guarded per-route because they have non-campaign-scoped endpoints. SQLite gets WAL + busy_timeout via a connect event. LLM endpoints get a per-user daily cap + global daily token ceiling.

**Tech Stack:** FastAPI, SQLAlchemy 2.x, SQLite, Pydantic 2 / pydantic-settings, PyJWT, passlib[argon2], google-auth (backend); React 19, Zustand, axios, react-router-dom 7, Google Identity Services (frontend).

**Spec:** `docs/superpowers/specs/2026-06-20-auth-release-readiness-design.md`

**Owner account email (existing-data migration target):** `thetinkerer018@gmail.com`

---

## Conventions for this plan

- Backend tests: pytest, in-memory SQLite + `StaticPool`, `app.dependency_overrides[get_db]` per the existing fixture in `backend/tests/test_campaigns_api.py`. Run from `backend/`: `python -m pytest`.
- Frontend tests: vitest. Run from `frontend/`: `npm test`.
- Commit after each task. Commit to `main` (no branches/worktrees — repo owner preference).
- **Intentional-red note:** Tasks 3–6 build the auth backend; existing campaign tests keep passing throughout because protection isn't wired until Task 8, and Task 7 installs the test-suite auth override *before* protection lands. Do not wire protection before Task 7.

---

## Task 1: Dependencies, config, and env examples

**Files:**
- Modify: `backend/requirements.txt`
- Modify: `backend/app/core/config.py`
- Modify: `backend/.env.example`
- Modify: `frontend/.env.example`

- [ ] **Step 1: Add backend dependencies**

Append to `backend/requirements.txt`:

```
pyjwt==2.9.0
passlib[argon2]==1.7.4
google-auth==2.35.0
```

- [ ] **Step 2: Install**

Run from `backend/`: `pip install -r requirements.txt`
Expected: installs `pyjwt`, `passlib`, `argon2-cffi`, `google-auth` and their deps.

- [ ] **Step 3: Add config fields**

Replace the body of `Settings` in `backend/app/core/config.py` with (keep existing fields, add the new ones):

```python
class Settings(BaseSettings):
    model_config = SettingsConfigDict(env_file=".env", env_file_encoding="utf-8", extra="ignore")

    database_url: str = "sqlite:////app/data/sovereign_shield.db"
    openrouter_api_key: str = ""
    openrouter_model: str = "anthropic/claude-haiku-4.5"
    content_dir: str = str(Path(__file__).resolve().parent.parent.parent / "content")

    # Auth
    google_client_id: str = ""
    jwt_secret_key: str = "dev-insecure-change-me"
    jwt_algorithm: str = "HS256"
    access_token_expire_minutes: int = 120
    refresh_token_expire_minutes: int = 43200  # 30 days

    # LLM cost guardrails
    llm_daily_user_cap: int = 40
    llm_daily_token_ceiling: int = 2_000_000

    owner_email: str = "thetinkerer018@gmail.com"

    cors_origins: list[str] = [
        "http://localhost:5173",
        "http://localhost:5174",
        "https://pmc-tycoon.skdev.one",
        "https://pmc-tycoon.vercel.app",
    ]


settings = Settings()
```

- [ ] **Step 4: Update env examples**

`backend/.env.example` — append:

```
GOOGLE_CLIENT_ID=
JWT_SECRET_KEY=change-me-to-a-long-random-string
```

`frontend/.env.example` — append:

```
VITE_GOOGLE_CLIENT_ID=
```

- [ ] **Step 5: Verify import still works**

Run from `backend/`: `python -c "from app.core.config import settings; print(settings.jwt_algorithm, settings.llm_daily_user_cap)"`
Expected: `HS256 40`

- [ ] **Step 6: Commit**

```bash
git add backend/requirements.txt backend/app/core/config.py backend/.env.example frontend/.env.example
git commit -m "chore(auth): add auth deps + config fields"
```

---

## Task 2: User model + Campaign.user_id column

**Files:**
- Create: `backend/app/models/user.py`
- Modify: `backend/app/models/__init__.py`
- Modify: `backend/app/models/campaign.py`
- Test: `backend/tests/test_user_model.py`

- [ ] **Step 1: Write the failing test**

Create `backend/tests/test_user_model.py`:

```python
from sqlalchemy import create_engine
from sqlalchemy.orm import sessionmaker
from sqlalchemy.pool import StaticPool

from app.db.base import Base
import app.models  # noqa: F401
from app.models.user import User
from app.models.campaign import Campaign


def _session():
    engine = create_engine("sqlite:///:memory:", connect_args={"check_same_thread": False}, poolclass=StaticPool)
    Base.metadata.create_all(bind=engine)
    return sessionmaker(bind=engine)()


def test_user_row_roundtrips():
    db = _session()
    u = User(email="a@b.com", google_id="g123", auth_provider="google", display_name="A")
    db.add(u)
    db.commit()
    got = db.query(User).filter_by(email="a@b.com").one()
    assert got.id is not None
    assert got.google_id == "g123"
    assert got.password_hash is None


def test_campaign_has_user_id_column():
    db = _session()
    u = User(email="c@d.com", auth_provider="password", password_hash="x", display_name="C")
    db.add(u)
    db.commit()
    c = Campaign(
        name="T", seed=1, starting_year=2026, starting_quarter=1,
        current_year=2026, current_quarter=1, difficulty="realistic",
        objectives_json=[], budget_cr=45000, user_id=u.id,
    )
    db.add(c)
    db.commit()
    assert db.query(Campaign).one().user_id == u.id
```

- [ ] **Step 2: Run test to verify it fails**

Run: `python -m pytest tests/test_user_model.py -v`
Expected: FAIL — `ModuleNotFoundError: app.models.user` / `Campaign has no attribute user_id`.

- [ ] **Step 3: Create the User model**

Create `backend/app/models/user.py`:

```python
from datetime import datetime, UTC
from sqlalchemy import String, Integer, DateTime
from sqlalchemy.orm import Mapped, mapped_column

from app.db.base import Base


class User(Base):
    __tablename__ = "users"

    id: Mapped[int] = mapped_column(primary_key=True)
    email: Mapped[str] = mapped_column(String(320), unique=True, index=True)
    google_id: Mapped[str | None] = mapped_column(String(255), unique=True, nullable=True)
    password_hash: Mapped[str | None] = mapped_column(String(512), nullable=True)
    auth_provider: Mapped[str] = mapped_column(String(20), default="password")
    display_name: Mapped[str] = mapped_column(String(200), default="")
    avatar_url: Mapped[str | None] = mapped_column(String(1024), nullable=True)
    created_at: Mapped[datetime] = mapped_column(DateTime, default=lambda: datetime.now(UTC))
```

- [ ] **Step 4: Register the model**

Add to `backend/app/models/__init__.py` (match the existing import style in that file):

```python
from app.models.user import User  # noqa: F401
```

- [ ] **Step 5: Add user_id to Campaign**

In `backend/app/models/campaign.py`, add the import and column. Add to the imports line: `ForeignKey`:

```python
from sqlalchemy import String, Integer, JSON, DateTime, Boolean, ForeignKey
```

Add this column to `Campaign` (after `id`, nullable so `create_all` can add it to the existing SQLite file; enforced at app layer):

```python
    user_id: Mapped[int | None] = mapped_column(ForeignKey("users.id"), index=True, nullable=True)
```

- [ ] **Step 6: Run tests to verify they pass**

Run: `python -m pytest tests/test_user_model.py -v`
Expected: PASS (2 tests).

- [ ] **Step 7: Commit**

```bash
git add backend/app/models/user.py backend/app/models/__init__.py backend/app/models/campaign.py backend/tests/test_user_model.py
git commit -m "feat(auth): User model + Campaign.user_id column"
```

---

## Task 3: Security primitives (tokens, password hashing, Google verify)

**Files:**
- Create: `backend/app/auth/__init__.py`
- Create: `backend/app/auth/security.py`
- Test: `backend/tests/test_auth_security.py`

- [ ] **Step 1: Write the failing test**

Create `backend/tests/test_auth_security.py`:

```python
import pytest

from app.auth import security


def test_password_hash_and_verify():
    h = security.hash_password("hunter2")
    assert h != "hunter2"
    assert security.verify_password("hunter2", h) is True
    assert security.verify_password("wrong", h) is False


def test_access_token_roundtrip():
    tok = security.create_access_token(subject="42")
    payload = security.decode_token(tok)
    assert payload["sub"] == "42"
    assert payload["type"] == "access"


def test_refresh_token_has_type():
    tok = security.create_refresh_token(subject="7")
    payload = security.decode_token(tok)
    assert payload["type"] == "refresh"


def test_decode_rejects_garbage():
    assert security.decode_token("not-a-jwt") is None


def test_verify_google_id_token_mocked(monkeypatch):
    def fake_verify(token, request, audience):
        assert audience == security.settings.google_client_id
        return {"sub": "google-sub-1", "email": "x@y.com", "name": "X", "picture": "http://p"}

    monkeypatch.setattr(security, "_google_verify", fake_verify)
    info = security.verify_google_id_token("dummy")
    assert info["sub"] == "google-sub-1"
    assert info["email"] == "x@y.com"
```

- [ ] **Step 2: Run test to verify it fails**

Run: `python -m pytest tests/test_auth_security.py -v`
Expected: FAIL — `ModuleNotFoundError: app.auth`.

- [ ] **Step 3: Create the package + security module**

Create `backend/app/auth/__init__.py` (empty file).

Create `backend/app/auth/security.py`:

```python
"""Auth primitives: JWT issue/verify, password hashing, Google ID-token verify."""
from datetime import datetime, timedelta, UTC

import jwt
from passlib.hash import argon2
from google.oauth2 import id_token as _google_id_token
from google.auth.transport import requests as _google_requests

from app.core.config import settings


def hash_password(plain: str) -> str:
    return argon2.hash(plain)


def verify_password(plain: str, hashed: str) -> bool:
    try:
        return argon2.verify(plain, hashed)
    except (ValueError, TypeError):
        return False


def _encode(subject: str, token_type: str, expires_minutes: int) -> str:
    now = datetime.now(UTC)
    payload = {
        "sub": str(subject),
        "type": token_type,
        "iat": now,
        "exp": now + timedelta(minutes=expires_minutes),
    }
    return jwt.encode(payload, settings.jwt_secret_key, algorithm=settings.jwt_algorithm)


def create_access_token(subject: str) -> str:
    return _encode(subject, "access", settings.access_token_expire_minutes)


def create_refresh_token(subject: str) -> str:
    return _encode(subject, "refresh", settings.refresh_token_expire_minutes)


def decode_token(token: str) -> dict | None:
    try:
        return jwt.decode(token, settings.jwt_secret_key, algorithms=[settings.jwt_algorithm])
    except jwt.PyJWTError:
        return None


def _google_verify(token: str, request, audience: str) -> dict:
    """Seam for monkeypatching in tests."""
    return _google_id_token.verify_oauth2_token(token, request, audience)


def verify_google_id_token(token: str) -> dict:
    """Returns the verified Google claims dict, or raises ValueError on failure."""
    info = _google_verify(token, _google_requests.Request(), settings.google_client_id)
    if not info.get("email"):
        raise ValueError("Google token missing email")
    return info
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `python -m pytest tests/test_auth_security.py -v`
Expected: PASS (5 tests).

- [ ] **Step 5: Commit**

```bash
git add backend/app/auth/__init__.py backend/app/auth/security.py backend/tests/test_auth_security.py
git commit -m "feat(auth): security primitives (jwt, argon2, google verify)"
```

---

## Task 4: Auth service (find-or-create, signup, authenticate)

**Files:**
- Create: `backend/app/auth/service.py`
- Test: `backend/tests/test_auth_service.py`

- [ ] **Step 1: Write the failing test**

Create `backend/tests/test_auth_service.py`:

```python
import pytest
from sqlalchemy import create_engine
from sqlalchemy.orm import sessionmaker
from sqlalchemy.pool import StaticPool

from app.db.base import Base
import app.models  # noqa: F401
from app.auth import service


def _session():
    engine = create_engine("sqlite:///:memory:", connect_args={"check_same_thread": False}, poolclass=StaticPool)
    Base.metadata.create_all(bind=engine)
    return sessionmaker(bind=engine)()


def test_signup_creates_user():
    db = _session()
    u = service.signup_user(db, email="a@b.com", password="pw123456", display_name="A")
    assert u.id is not None
    assert u.auth_provider == "password"
    assert u.password_hash is not None


def test_signup_duplicate_raises():
    db = _session()
    service.signup_user(db, email="a@b.com", password="pw123456", display_name="A")
    with pytest.raises(service.EmailTakenError):
        service.signup_user(db, email="a@b.com", password="other123", display_name="B")


def test_authenticate_ok_and_bad():
    db = _session()
    service.signup_user(db, email="a@b.com", password="pw123456", display_name="A")
    assert service.authenticate_user(db, "a@b.com", "pw123456") is not None
    assert service.authenticate_user(db, "a@b.com", "wrong") is None
    assert service.authenticate_user(db, "missing@b.com", "x") is None


def test_authenticate_google_only_user_returns_none():
    db = _session()
    service.get_or_create_google_user(db, {"sub": "g1", "email": "g@b.com", "name": "G", "picture": None})
    assert service.authenticate_user(db, "g@b.com", "anything") is None


def test_get_or_create_google_links_by_sub_then_email():
    db = _session()
    u1 = service.get_or_create_google_user(db, {"sub": "g1", "email": "g@b.com", "name": "G", "picture": None})
    u2 = service.get_or_create_google_user(db, {"sub": "g1", "email": "g@b.com", "name": "G2", "picture": None})
    assert u1.id == u2.id  # same sub -> same user

    # pre-existing password user, same email, gets google_id linked
    pw = service.signup_user(db, email="p@b.com", password="pw123456", display_name="P")
    linked = service.get_or_create_google_user(db, {"sub": "g2", "email": "p@b.com", "name": "P", "picture": None})
    assert linked.id == pw.id
    assert linked.google_id == "g2"
```

- [ ] **Step 2: Run test to verify it fails**

Run: `python -m pytest tests/test_auth_service.py -v`
Expected: FAIL — `ModuleNotFoundError: app.auth.service`.

- [ ] **Step 3: Implement the service**

Create `backend/app/auth/service.py`:

```python
"""User find-or-create + credential authentication."""
from sqlalchemy.orm import Session

from app.models.user import User
from app.auth.security import hash_password, verify_password


class EmailTakenError(Exception):
    pass


def get_user_by_id(db: Session, user_id: int | str) -> User | None:
    try:
        uid = int(user_id)
    except (TypeError, ValueError):
        return None
    return db.query(User).filter(User.id == uid).first()


def get_user_by_email(db: Session, email: str) -> User | None:
    return db.query(User).filter(User.email == email).first()


def signup_user(db: Session, *, email: str, password: str, display_name: str = "") -> User:
    if get_user_by_email(db, email):
        raise EmailTakenError(email)
    user = User(
        email=email,
        password_hash=hash_password(password),
        auth_provider="password",
        display_name=display_name or email.split("@")[0],
    )
    db.add(user)
    db.commit()
    db.refresh(user)
    return user


def authenticate_user(db: Session, email: str, password: str) -> User | None:
    user = get_user_by_email(db, email)
    if user is None or not user.password_hash:
        return None
    if not verify_password(password, user.password_hash):
        return None
    return user


def get_or_create_google_user(db: Session, claims: dict) -> User:
    sub = claims.get("sub")
    email = claims["email"]
    user = db.query(User).filter(User.google_id == sub).first()
    if user is None:
        user = get_user_by_email(db, email)
    if user is None:
        user = User(
            email=email,
            google_id=sub,
            auth_provider="google",
            display_name=claims.get("name") or email.split("@")[0],
            avatar_url=claims.get("picture"),
        )
        db.add(user)
    else:
        # link google identity + refresh profile
        user.google_id = sub
        if claims.get("name"):
            user.display_name = claims["name"]
        if claims.get("picture"):
            user.avatar_url = claims["picture"]
    db.commit()
    db.refresh(user)
    return user
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `python -m pytest tests/test_auth_service.py -v`
Expected: PASS (5 tests).

- [ ] **Step 5: Commit**

```bash
git add backend/app/auth/service.py backend/tests/test_auth_service.py
git commit -m "feat(auth): user service (signup/authenticate/google upsert)"
```

---

## Task 5: Auth dependencies (current user + campaign ownership guard)

**Files:**
- Create: `backend/app/auth/deps.py`
- Test: `backend/tests/test_auth_deps.py`

- [ ] **Step 1: Write the failing test**

Create `backend/tests/test_auth_deps.py`:

```python
import pytest
from fastapi import FastAPI, Depends
from fastapi.testclient import TestClient
from sqlalchemy import create_engine
from sqlalchemy.orm import sessionmaker
from sqlalchemy.pool import StaticPool

from app.db.base import Base
import app.models  # noqa: F401
from app.models.user import User
from app.models.campaign import Campaign
from app.api.deps import get_db
from app.auth.deps import get_current_user, require_owned_campaign
from app.auth.security import create_access_token, create_refresh_token


@pytest.fixture
def app_client():
    engine = create_engine("sqlite:///:memory:", connect_args={"check_same_thread": False}, poolclass=StaticPool)
    SessionLocal = sessionmaker(bind=engine)
    Base.metadata.create_all(bind=engine)

    db = SessionLocal()
    u = User(email="a@b.com", auth_provider="password", password_hash="x", display_name="A")
    db.add(u)
    db.commit()
    c = Campaign(name="T", seed=1, starting_year=2026, starting_quarter=1, current_year=2026,
                 current_quarter=1, difficulty="realistic", objectives_json=[], budget_cr=45000, user_id=u.id)
    db.add(c)
    db.commit()
    user_id, camp_id = u.id, c.id
    db.close()

    app = FastAPI()

    def override_db():
        s = SessionLocal()
        try:
            yield s
        finally:
            s.close()

    app.dependency_overrides[get_db] = override_db

    @app.get("/me")
    def me(user: User = Depends(get_current_user)):
        return {"id": user.id}

    @app.get("/c/{campaign_id}")
    def owned(campaign_id: int, camp: Campaign = Depends(require_owned_campaign)):
        return {"id": camp.id}

    return TestClient(app), user_id, camp_id


def test_no_token_401(app_client):
    client, _, camp_id = app_client
    assert client.get("/me").status_code == 401
    assert client.get(f"/c/{camp_id}").status_code == 401


def test_valid_token_ok(app_client):
    client, user_id, camp_id = app_client
    h = {"Authorization": f"Bearer {create_access_token(str(user_id))}"}
    assert client.get("/me", headers=h).json() == {"id": user_id}
    assert client.get(f"/c/{camp_id}", headers=h).status_code == 200


def test_refresh_token_rejected_as_access(app_client):
    client, user_id, _ = app_client
    h = {"Authorization": f"Bearer {create_refresh_token(str(user_id))}"}
    assert client.get("/me", headers=h).status_code == 401


def test_other_users_campaign_404(app_client):
    client, user_id, camp_id = app_client
    # token for a non-owner user id
    h = {"Authorization": f"Bearer {create_access_token(str(user_id + 999))}"}
    # get_current_user will 401 because that user doesn't exist
    assert client.get(f"/c/{camp_id}", headers=h).status_code == 401


def test_owned_campaign_missing_404(app_client):
    client, user_id, _ = app_client
    h = {"Authorization": f"Bearer {create_access_token(str(user_id))}"}
    assert client.get("/c/999999", headers=h).status_code == 404
```

- [ ] **Step 2: Run test to verify it fails**

Run: `python -m pytest tests/test_auth_deps.py -v`
Expected: FAIL — `ModuleNotFoundError: app.auth.deps`.

- [ ] **Step 3: Implement the dependencies**

Create `backend/app/auth/deps.py`:

```python
"""FastAPI auth dependencies."""
from fastapi import Depends, HTTPException, status
from fastapi.security import HTTPBearer, HTTPAuthorizationCredentials
from sqlalchemy.orm import Session

from app.api.deps import get_db
from app.auth.security import decode_token
from app.auth.service import get_user_by_id
from app.models.user import User
from app.models.campaign import Campaign

_bearer = HTTPBearer(auto_error=False)


def get_current_user(
    creds: HTTPAuthorizationCredentials | None = Depends(_bearer),
    db: Session = Depends(get_db),
) -> User:
    if creds is None:
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Not authenticated")
    payload = decode_token(creds.credentials)
    if not payload or payload.get("type") != "access":
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Invalid token")
    user = get_user_by_id(db, payload.get("sub"))
    if user is None:
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="User not found")
    return user


def require_owned_campaign(
    campaign_id: int,
    user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
) -> Campaign:
    """Loads the campaign and 404s if it doesn't exist OR isn't owned by the caller
    (404 not 403 so campaign IDs don't leak existence)."""
    camp = db.query(Campaign).filter(Campaign.id == campaign_id).first()
    if camp is None or camp.user_id != user.id:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Campaign not found")
    return camp
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `python -m pytest tests/test_auth_deps.py -v`
Expected: PASS (5 tests).

- [ ] **Step 5: Commit**

```bash
git add backend/app/auth/deps.py backend/tests/test_auth_deps.py
git commit -m "feat(auth): get_current_user + require_owned_campaign deps"
```

---

## Task 6: Auth API router

**Files:**
- Create: `backend/app/schemas/auth.py`
- Create: `backend/app/api/auth.py`
- Modify: `backend/main.py`
- Test: `backend/tests/test_auth_api.py`

- [ ] **Step 1: Write the failing test**

Create `backend/tests/test_auth_api.py`:

```python
import pytest
from fastapi.testclient import TestClient
from sqlalchemy import create_engine
from sqlalchemy.orm import sessionmaker
from sqlalchemy.pool import StaticPool

from app.db.base import Base
import app.models  # noqa: F401
from app.api.deps import get_db
from app.auth import security
from main import app


@pytest.fixture
def client():
    engine = create_engine("sqlite:///:memory:", connect_args={"check_same_thread": False}, poolclass=StaticPool)
    SessionLocal = sessionmaker(bind=engine)
    Base.metadata.create_all(bind=engine)

    def override_db():
        s = SessionLocal()
        try:
            yield s
        finally:
            s.close()

    app.dependency_overrides[get_db] = override_db
    yield TestClient(app)
    app.dependency_overrides.clear()
    Base.metadata.drop_all(bind=engine)


def test_signup_then_me(client):
    r = client.post("/api/auth/signup", json={"email": "a@b.com", "password": "pw123456", "display_name": "A"})
    assert r.status_code == 201
    body = r.json()
    assert body["token_type"] == "bearer"
    assert body["user"]["email"] == "a@b.com"
    h = {"Authorization": f"Bearer {body['access_token']}"}
    me = client.get("/api/auth/me", headers=h)
    assert me.status_code == 200
    assert me.json()["email"] == "a@b.com"


def test_signup_duplicate_409(client):
    client.post("/api/auth/signup", json={"email": "a@b.com", "password": "pw123456"})
    r = client.post("/api/auth/signup", json={"email": "a@b.com", "password": "pw999999"})
    assert r.status_code == 409


def test_login_ok_and_bad(client):
    client.post("/api/auth/signup", json={"email": "a@b.com", "password": "pw123456"})
    assert client.post("/api/auth/login", json={"email": "a@b.com", "password": "pw123456"}).status_code == 200
    assert client.post("/api/auth/login", json={"email": "a@b.com", "password": "wrong"}).status_code == 401


def test_refresh_flow(client):
    s = client.post("/api/auth/signup", json={"email": "a@b.com", "password": "pw123456"}).json()
    r = client.post("/api/auth/refresh", json={"refresh_token": s["refresh_token"]})
    assert r.status_code == 200
    assert r.json()["access_token"]
    # an access token is not a valid refresh token
    assert client.post("/api/auth/refresh", json={"refresh_token": s["access_token"]}).status_code == 401


def test_google_login(client, monkeypatch):
    monkeypatch.setattr(
        security, "_google_verify",
        lambda token, request, audience: {"sub": "g1", "email": "g@b.com", "name": "G", "picture": None},
    )
    r = client.post("/api/auth/google", json={"id_token": "dummy"})
    assert r.status_code == 200
    assert r.json()["user"]["email"] == "g@b.com"
```

- [ ] **Step 2: Run test to verify it fails**

Run: `python -m pytest tests/test_auth_api.py -v`
Expected: FAIL — 404s (router not registered) / import error.

- [ ] **Step 3: Create the schemas**

Create `backend/app/schemas/auth.py`:

```python
from pydantic import BaseModel, EmailStr


class SignupRequest(BaseModel):
    email: EmailStr
    password: str
    display_name: str | None = None


class LoginRequest(BaseModel):
    email: EmailStr
    password: str


class GoogleLoginRequest(BaseModel):
    id_token: str


class RefreshRequest(BaseModel):
    refresh_token: str


class UserRead(BaseModel):
    id: int
    email: str
    display_name: str
    avatar_url: str | None = None
    auth_provider: str

    model_config = {"from_attributes": True}


class TokenResponse(BaseModel):
    access_token: str
    refresh_token: str
    token_type: str = "bearer"
    user: UserRead
```

> **Note:** `EmailStr` requires `email-validator`. Add `email-validator==2.2.0` to `backend/requirements.txt` and `pip install` it as part of this step.

- [ ] **Step 4: Create the router**

Create `backend/app/api/auth.py`:

```python
from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy.orm import Session

from app.api.deps import get_db
from app.auth import security, service
from app.auth.deps import get_current_user
from app.models.user import User
from app.schemas.auth import (
    SignupRequest, LoginRequest, GoogleLoginRequest, RefreshRequest,
    TokenResponse, UserRead,
)

router = APIRouter(prefix="/api/auth", tags=["auth"])


def _tokens_for(user: User) -> TokenResponse:
    return TokenResponse(
        access_token=security.create_access_token(str(user.id)),
        refresh_token=security.create_refresh_token(str(user.id)),
        user=UserRead.model_validate(user),
    )


@router.post("/signup", response_model=TokenResponse, status_code=status.HTTP_201_CREATED)
def signup(payload: SignupRequest, db: Session = Depends(get_db)):
    try:
        user = service.signup_user(
            db, email=payload.email, password=payload.password,
            display_name=payload.display_name or "",
        )
    except service.EmailTakenError:
        raise HTTPException(status_code=409, detail="Email already registered")
    return _tokens_for(user)


@router.post("/login", response_model=TokenResponse)
def login(payload: LoginRequest, db: Session = Depends(get_db)):
    user = service.authenticate_user(db, payload.email, payload.password)
    if user is None:
        existing = service.get_user_by_email(db, payload.email)
        if existing and not existing.password_hash:
            raise HTTPException(status_code=401, detail="This account uses Google Sign-In")
        raise HTTPException(status_code=401, detail="Invalid email or password")
    return _tokens_for(user)


@router.post("/google", response_model=TokenResponse)
def google_login(payload: GoogleLoginRequest, db: Session = Depends(get_db)):
    try:
        claims = security.verify_google_id_token(payload.id_token)
    except ValueError:
        raise HTTPException(status_code=401, detail="Invalid Google token")
    user = service.get_or_create_google_user(db, claims)
    return _tokens_for(user)


@router.post("/refresh", response_model=TokenResponse)
def refresh(payload: RefreshRequest, db: Session = Depends(get_db)):
    decoded = security.decode_token(payload.refresh_token)
    if not decoded or decoded.get("type") != "refresh":
        raise HTTPException(status_code=401, detail="Invalid refresh token")
    user = service.get_user_by_id(db, decoded.get("sub"))
    if user is None:
        raise HTTPException(status_code=401, detail="User not found")
    return _tokens_for(user)


@router.get("/me", response_model=UserRead)
def me(user: User = Depends(get_current_user)):
    return UserRead.model_validate(user)
```

- [ ] **Step 5: Register the router**

In `backend/main.py`, add the import next to the other router imports:

```python
from app.api.auth import router as auth_router
```

And register it (before the campaigns router is fine):

```python
app.include_router(auth_router)
```

- [ ] **Step 6: Run tests to verify they pass**

Run: `python -m pytest tests/test_auth_api.py -v`
Expected: PASS (5 tests).

- [ ] **Step 7: Commit**

```bash
git add backend/app/schemas/auth.py backend/app/api/auth.py backend/main.py backend/requirements.txt backend/tests/test_auth_api.py
git commit -m "feat(auth): /api/auth router (google, signup, login, refresh, me)"
```

---

## Task 7: Test-suite auth override (keep existing tests green under protection)

**Why:** Tasks 8–9 add `require_owned_campaign` to every campaign route. Without a default authenticated user, all ~589 existing tests would 401. This task adds a shared `conftest.py` that overrides `get_current_user` to a fixed dummy user (id=1) for the whole suite. Because campaigns get stamped with `current_user.id` (Task 8) and the dummy user is id=1, ownership checks pass. SQLite in tests does not enforce FKs, so no `users` row is needed.

**Files:**
- Create: `backend/tests/conftest.py`

- [ ] **Step 1: Create conftest with an autouse override**

Create `backend/tests/conftest.py`:

```python
"""Shared test config: authenticate every request as a fixed dummy user so the
campaign-ownership guard (require_owned_campaign) passes in existing tests.

Tests that need to exercise real auth (multi-user isolation, 401 paths) should
pop this override — see test_campaign_isolation.py.
"""
import pytest

from main import app
from app.auth.deps import get_current_user
from app.models.user import User

TEST_USER_ID = 1


def _dummy_user() -> User:
    return User(id=TEST_USER_ID, email="tester@example.com", auth_provider="password",
                display_name="Tester")


@pytest.fixture(autouse=True)
def _auth_override():
    app.dependency_overrides[get_current_user] = _dummy_user
    yield
    app.dependency_overrides.pop(get_current_user, None)
```

- [ ] **Step 2: Run the full backend suite**

Run from `backend/`: `python -m pytest -q`
Expected: PASS — the new override is harmless before protection is wired (no route depends on `get_current_user` yet except `/api/auth/me`, which the auth tests don't route through this override because they don't request it... they do—`me` will now return the dummy user when no explicit token logic runs). 

> **Check:** `test_auth_api.py::test_signup_then_me` and `test_google_login` assert specific emails. With the autouse override, `GET /api/auth/me` returns the dummy user, breaking those asserts. Fix: in `test_auth_api.py`, add a fixture that pops the override for that file:
> ```python
> @pytest.fixture(autouse=True)
> def _no_auth_override():
>     from app.auth.deps import get_current_user as _gcu
>     app.dependency_overrides.pop(_gcu, None)
>     yield
> ```
> Add this to `test_auth_api.py` and `test_auth_deps.py` (the latter builds its own app, so it's unaffected, but add for safety). Re-run both files to confirm green.

- [ ] **Step 3: Commit**

```bash
git add backend/tests/conftest.py backend/tests/test_auth_api.py
git commit -m "test(auth): suite-wide get_current_user override for protected routes"
```

---

## Task 8: Protect campaigns + campaign_export routers (per-route)

**Files:**
- Modify: `backend/app/api/campaigns.py`
- Modify: `backend/app/crud/campaign.py`
- Modify: `backend/app/api/campaign_export.py`
- Test: `backend/tests/test_campaign_isolation.py`

- [ ] **Step 1: Write the failing isolation test**

Create `backend/tests/test_campaign_isolation.py`:

```python
import pytest
from fastapi.testclient import TestClient
from sqlalchemy import create_engine
from sqlalchemy.orm import sessionmaker
from sqlalchemy.pool import StaticPool

from app.db.base import Base
import app.models  # noqa: F401
from app.api.deps import get_db
from app.auth.deps import get_current_user
from main import app


@pytest.fixture
def client():
    # This file exercises REAL auth — disable the suite-wide dummy override.
    app.dependency_overrides.pop(get_current_user, None)
    engine = create_engine("sqlite:///:memory:", connect_args={"check_same_thread": False}, poolclass=StaticPool)
    SessionLocal = sessionmaker(bind=engine)
    Base.metadata.create_all(bind=engine)

    def override_db():
        s = SessionLocal()
        try:
            yield s
        finally:
            s.close()

    app.dependency_overrides[get_db] = override_db
    yield TestClient(app)
    app.dependency_overrides.clear()
    Base.metadata.drop_all(bind=engine)


def _signup(client, email):
    body = client.post("/api/auth/signup", json={"email": email, "password": "pw123456"}).json()
    return {"Authorization": f"Bearer {body['access_token']}"}


def _create_campaign(client, headers):
    r = client.post("/api/campaigns", headers=headers, json={
        "name": "C", "difficulty": "realistic",
        "objectives": ["amca_operational_by_2035", "maintain_42_squadrons"],
    })
    assert r.status_code == 201
    return r.json()["id"]


def test_unauthenticated_create_401(client):
    r = client.post("/api/campaigns", json={"name": "X", "difficulty": "realistic", "objectives": []})
    assert r.status_code == 401


def test_list_is_scoped_to_owner(client):
    ha = _signup(client, "a@b.com")
    hb = _signup(client, "b@b.com")
    _create_campaign(client, ha)
    a_list = client.get("/api/campaigns", headers=ha).json()["campaigns"]
    b_list = client.get("/api/campaigns", headers=hb).json()["campaigns"]
    assert len(a_list) == 1
    assert len(b_list) == 0


def test_cannot_read_or_advance_or_delete_others_campaign(client):
    ha = _signup(client, "a@b.com")
    hb = _signup(client, "b@b.com")
    cid = _create_campaign(client, ha)
    assert client.get(f"/api/campaigns/{cid}", headers=hb).status_code == 404
    assert client.post(f"/api/campaigns/{cid}/advance", headers=hb).status_code == 404
    assert client.delete(f"/api/campaigns/{cid}", headers=hb).status_code == 404
    # owner still can
    assert client.get(f"/api/campaigns/{cid}", headers=ha).status_code == 200
```

- [ ] **Step 2: Run test to verify it fails**

Run: `python -m pytest tests/test_campaign_isolation.py -v`
Expected: FAIL — create returns 201 without auth, list not scoped, cross-user reads succeed.

- [ ] **Step 3: Stamp user_id in create_campaign**

In `backend/app/crud/campaign.py`, change the `create_campaign` signature to accept a `user_id` and set it on the new `Campaign`. Find the `create_campaign(db, payload)` definition and:

- Update signature to `def create_campaign(db: Session, payload, user_id: int):`
- In the `Campaign(...)` constructor add `user_id=user_id,`.

- [ ] **Step 4: Protect the campaigns router**

Rewrite the route handlers in `backend/app/api/campaigns.py` to require auth. Add imports:

```python
from app.auth.deps import get_current_user, require_owned_campaign
from app.models.user import User
```

Change the four campaign-scoped handlers + create + list:

```python
@router.post("", response_model=CampaignRead, status_code=status.HTTP_201_CREATED)
def create_campaign_endpoint(payload: CampaignCreate, db: Session = Depends(get_db),
                             user: User = Depends(get_current_user)):
    return create_campaign(db, payload, user_id=user.id)


@router.get("", response_model=CampaignListResponse)
def list_campaigns_endpoint(db: Session = Depends(get_db), user: User = Depends(get_current_user)):
    campaigns = (db.query(Campaign)
                 .filter(Campaign.user_id == user.id)
                 .order_by(Campaign.updated_at.desc()).all())
    return CampaignListResponse(campaigns=[CampaignListItem.model_validate(c) for c in campaigns])
```

For `delete_campaign_endpoint`, `get_turn_report`, `get_campaign_endpoint`, `advance_turn_endpoint`: add `camp: Campaign = Depends(require_owned_campaign)` to each signature (keep `campaign_id: int` — FastAPI resolves both). The guard runs first and 404s non-owners. Inside each handler you may keep using `campaign_id` for queries; the existing `get_campaign` lookups are now redundant but harmless — leave them, or replace the local lookup with the injected `camp`. Minimal change: just add the dependency parameter.

Example for advance:

```python
@router.post("/{campaign_id}/advance", response_model=CampaignRead)
def advance_turn_endpoint(campaign_id: int, db: Session = Depends(get_db),
                          camp: Campaign = Depends(require_owned_campaign)):
    from app.api.campaign_lifecycle import require_active_campaign
    require_active_campaign(camp)
    return advance_turn(db, camp)
```

- [ ] **Step 5: Protect campaign_export**

In `backend/app/api/campaign_export.py`:
- `export_campaign`: add `camp: Campaign = Depends(require_owned_campaign)` (import it + `Campaign`).
- `import_campaign`: add `user: User = Depends(get_current_user)` and stamp the imported campaign's `user_id = user.id` before persisting. (Find where the imported `Campaign` is constructed/added and set `user_id`.)

- [ ] **Step 6: Run isolation tests**

Run: `python -m pytest tests/test_campaign_isolation.py -v`
Expected: PASS (4 tests).

- [ ] **Step 7: Run full suite (existing campaign tests must still pass via the conftest override)**

Run: `python -m pytest -q`
Expected: PASS. If any existing test that calls `create_campaign(db, payload)` directly (CRUD, not API) fails on the new required `user_id`, update those call sites to pass `user_id=1`.

- [ ] **Step 8: Commit**

```bash
git add backend/app/api/campaigns.py backend/app/crud/campaign.py backend/app/api/campaign_export.py backend/tests/test_campaign_isolation.py
git commit -m "feat(auth): scope campaigns + export/import to owning user"
```

---

## Task 9: Protect all other campaign-scoped routers

**Files:**
- Modify: `backend/main.py`
- Test: `backend/tests/test_router_protection_sweep.py`

- [ ] **Step 1: Write the failing sweep test**

Create `backend/tests/test_router_protection_sweep.py`:

```python
import pytest
from fastapi.testclient import TestClient
from sqlalchemy import create_engine
from sqlalchemy.orm import sessionmaker
from sqlalchemy.pool import StaticPool

from app.db.base import Base
import app.models  # noqa: F401
from app.api.deps import get_db
from app.auth.deps import get_current_user
from main import app

# One representative GET endpoint per campaign-scoped router.
SAMPLE_PATHS = [
    "/api/campaigns/{cid}/budget",
    "/api/campaigns/{cid}/rd",
    "/api/campaigns/{cid}/acquisitions",
    "/api/campaigns/{cid}/intel",
    "/api/campaigns/{cid}/adversary",
    "/api/campaigns/{cid}/vignettes/pending",
    "/api/campaigns/{cid}/bases",
    "/api/campaigns/{cid}/summary",
    "/api/campaigns/{cid}/hangar",
    "/api/campaigns/{cid}/armory/unlocks",
    "/api/campaigns/{cid}/performance",
    "/api/campaigns/{cid}/missile-stocks",
    "/api/campaigns/{cid}/notifications",
    "/api/campaigns/{cid}/adversary-bases",
    "/api/campaigns/{cid}/diplomacy",
    "/api/campaigns/{cid}/posture",
]


@pytest.fixture
def client():
    app.dependency_overrides.pop(get_current_user, None)  # exercise real auth
    engine = create_engine("sqlite:///:memory:", connect_args={"check_same_thread": False}, poolclass=StaticPool)
    SessionLocal = sessionmaker(bind=engine)
    Base.metadata.create_all(bind=engine)

    def override_db():
        s = SessionLocal()
        try:
            yield s
        finally:
            s.close()

    app.dependency_overrides[get_db] = override_db
    yield TestClient(app)
    app.dependency_overrides.clear()
    Base.metadata.drop_all(bind=engine)


@pytest.mark.parametrize("path", SAMPLE_PATHS)
def test_unauthenticated_is_401(client, path):
    assert client.get(path.format(cid=1)).status_code == 401


@pytest.mark.parametrize("path", SAMPLE_PATHS)
def test_cross_user_is_404(client, path):
    ha = {"Authorization": f"Bearer {client.post('/api/auth/signup', json={'email':'a@b.com','password':'pw123456'}).json()['access_token']}"}
    hb = {"Authorization": f"Bearer {client.post('/api/auth/signup', json={'email':'b@b.com','password':'pw123456'}).json()['access_token']}"}
    cid = client.post("/api/campaigns", headers=ha, json={
        "name": "C", "difficulty": "realistic",
        "objectives": ["amca_operational_by_2035", "maintain_42_squadrons"]}).json()["id"]
    # user B is authenticated but does not own campaign `cid` -> guard 404 (not 401, not 200)
    assert client.get(path.format(cid=cid), headers=hb).status_code == 404
```

- [ ] **Step 2: Run test to verify it fails**

Run: `python -m pytest tests/test_router_protection_sweep.py -v`
Expected: FAIL — unauthenticated/cross-user requests currently reach handlers (200/422/500), not 401/404.

- [ ] **Step 3: Attach the guard at include_router level**

In `backend/main.py`, add the import:

```python
from app.auth.deps import require_owned_campaign
from fastapi import Depends
```

Replace each campaign-scoped `app.include_router(...)` line (every one EXCEPT `auth_router`, `campaigns_router`, `campaign_export_router`, and `content_router`) with the dependency form. The full block becomes:

```python
app.include_router(auth_router)
app.include_router(campaigns_router)          # protected per-route (Task 8)
app.include_router(campaign_export_router)    # protected per-route (Task 8)
app.include_router(content_router)            # public catalogs — intentionally unguarded

_guard = [Depends(require_owned_campaign)]
app.include_router(budget_router, dependencies=_guard)
app.include_router(rd_router, dependencies=_guard)
app.include_router(acquisitions_router, dependencies=_guard)
app.include_router(intel_router, dependencies=_guard)
app.include_router(adversary_router, dependencies=_guard)
app.include_router(vignettes_router, dependencies=_guard)
app.include_router(narratives_router, dependencies=_guard)
app.include_router(bases_router, dependencies=_guard)
app.include_router(summary_router, dependencies=_guard)
app.include_router(base_upgrade_router, dependencies=_guard)
app.include_router(squadrons_router, dependencies=_guard)
app.include_router(armory_router, dependencies=_guard)
app.include_router(hangar_router, dependencies=_guard)
app.include_router(performance_router, dependencies=_guard)
app.include_router(missile_stocks_router, dependencies=_guard)
app.include_router(notifications_router, dependencies=_guard)
app.include_router(adversary_bases_router, dependencies=_guard)
app.include_router(offensive_router, dependencies=_guard)
app.include_router(diplomacy_router, dependencies=_guard)
app.include_router(posture_router, dependencies=_guard)
```

- [ ] **Step 4: Run sweep + full suite**

Run: `python -m pytest tests/test_router_protection_sweep.py -v`
Expected: PASS (32 parametrized cases).

Run: `python -m pytest -q`
Expected: PASS — existing per-router tests pass via the conftest dummy-user override (campaigns they create are owned by user id=1, and the override makes `require_owned_campaign` see user id=1).

> **If existing tests now 404:** their fixtures create a campaign via `POST /api/campaigns` (now stamped user_id=1 by the override) — the guard sees user id=1 and matches. If a test seeds a Campaign directly via the DB without `user_id`, set `user_id=1` on that seed. Fix such seeds as found.

- [ ] **Step 5: Commit**

```bash
git add backend/main.py backend/tests/test_router_protection_sweep.py
git commit -m "feat(auth): guard all campaign-scoped routers with ownership check"
```

---

## Task 10: Existing-data migration (assign orphan campaigns to owner)

**Files:**
- Create: `backend/app/auth/bootstrap.py`
- Modify: `backend/main.py`
- Test: `backend/tests/test_auth_bootstrap.py`

- [ ] **Step 1: Write the failing test**

Create `backend/tests/test_auth_bootstrap.py`:

```python
from sqlalchemy import create_engine
from sqlalchemy.orm import sessionmaker
from sqlalchemy.pool import StaticPool

from app.db.base import Base
import app.models  # noqa: F401
from app.models.user import User
from app.models.campaign import Campaign
from app.auth.bootstrap import ensure_owner_and_backfill


def _session():
    engine = create_engine("sqlite:///:memory:", connect_args={"check_same_thread": False}, poolclass=StaticPool)
    Base.metadata.create_all(bind=engine)
    return sessionmaker(bind=engine)()


def test_creates_owner_and_backfills_null_campaigns():
    db = _session()
    db.add(Campaign(name="orphan", seed=1, starting_year=2026, starting_quarter=1, current_year=2026,
                    current_quarter=1, difficulty="realistic", objectives_json=[], budget_cr=45000, user_id=None))
    db.commit()

    ensure_owner_and_backfill(db, owner_email="owner@x.com")

    owner = db.query(User).filter_by(email="owner@x.com").one()
    assert owner.auth_provider == "google"
    assert db.query(Campaign).one().user_id == owner.id


def test_idempotent():
    db = _session()
    ensure_owner_and_backfill(db, owner_email="owner@x.com")
    ensure_owner_and_backfill(db, owner_email="owner@x.com")
    assert db.query(User).filter_by(email="owner@x.com").count() == 1
```

- [ ] **Step 2: Run test to verify it fails**

Run: `python -m pytest tests/test_auth_bootstrap.py -v`
Expected: FAIL — `ModuleNotFoundError: app.auth.bootstrap`.

- [ ] **Step 3: Implement bootstrap**

Create `backend/app/auth/bootstrap.py`:

```python
"""One-time, idempotent migration: ensure an owner user exists and adopt any
campaigns that predate auth (user_id IS NULL)."""
import logging

from sqlalchemy.orm import Session

from app.models.user import User
from app.models.campaign import Campaign

logger = logging.getLogger(__name__)


def ensure_owner_and_backfill(db: Session, owner_email: str) -> None:
    owner = db.query(User).filter(User.email == owner_email).first()
    if owner is None:
        owner = User(email=owner_email, auth_provider="google",
                     display_name=owner_email.split("@")[0])
        db.add(owner)
        db.commit()
        db.refresh(owner)
        logger.info("created owner user %s", owner_email)

    orphans = db.query(Campaign).filter(Campaign.user_id.is_(None)).all()
    if orphans:
        for c in orphans:
            c.user_id = owner.id
        db.commit()
        logger.info("backfilled %d orphan campaigns to owner", len(orphans))
```

- [ ] **Step 4: Call it at startup**

In `backend/main.py`, after `Base.metadata.create_all(bind=engine)` (inside or after the existing try block), add:

```python
from app.db.session import SessionLocal
from app.auth.bootstrap import ensure_owner_and_backfill

try:
    _db = SessionLocal()
    ensure_owner_and_backfill(_db, settings.owner_email)
    _db.close()
except Exception as exc:  # noqa: BLE001
    logger.warning("owner backfill skipped at startup: %s", exc)
```

- [ ] **Step 5: Run tests**

Run: `python -m pytest tests/test_auth_bootstrap.py -v`
Expected: PASS (2 tests).

Run: `python -m pytest -q`
Expected: PASS (full suite).

- [ ] **Step 6: Commit**

```bash
git add backend/app/auth/bootstrap.py backend/main.py backend/tests/test_auth_bootstrap.py
git commit -m "feat(auth): startup migration assigns orphan campaigns to owner"
```

---

## Task 11: SQLite concurrency hardening (WAL + busy_timeout)

**Files:**
- Modify: `backend/app/db/session.py`
- Test: `backend/tests/test_sqlite_pragmas.py`

- [ ] **Step 1: Write the failing test**

Create `backend/tests/test_sqlite_pragmas.py`:

```python
from sqlalchemy import text

from app.db.session import engine


def test_wal_and_busy_timeout_set():
    # File-based SQLite reports 'wal'; in-memory may report 'memory'. The prod
    # engine is file-based, so assert the connect event applied WAL + timeout.
    with engine.connect() as conn:
        jm = conn.execute(text("PRAGMA journal_mode")).scalar()
        bt = conn.execute(text("PRAGMA busy_timeout")).scalar()
    assert str(jm).lower() in ("wal", "memory")
    assert int(bt) >= 5000
```

- [ ] **Step 2: Run test to verify it fails**

Run: `python -m pytest tests/test_sqlite_pragmas.py -v`
Expected: FAIL — `busy_timeout` is 0 by default.

- [ ] **Step 3: Add a connect event**

Replace `backend/app/db/session.py` with:

```python
from sqlalchemy import create_engine, event
from sqlalchemy.orm import sessionmaker

from app.core.config import settings

_is_sqlite = settings.database_url.startswith("sqlite")

engine = create_engine(
    settings.database_url,
    connect_args={"check_same_thread": False} if _is_sqlite else {},
)

if _is_sqlite:
    @event.listens_for(engine, "connect")
    def _set_sqlite_pragmas(dbapi_conn, _record):  # noqa: ANN001
        cur = dbapi_conn.cursor()
        cur.execute("PRAGMA journal_mode=WAL;")
        cur.execute("PRAGMA busy_timeout=5000;")
        cur.close()

SessionLocal = sessionmaker(autocommit=False, autoflush=False, bind=engine)
```

- [ ] **Step 4: Run tests**

Run: `python -m pytest tests/test_sqlite_pragmas.py -v`
Expected: PASS. (WAL is silently ignored by `:memory:`, which reports `memory`; the prod file DB will report `wal`.)

Run: `python -m pytest -q`
Expected: PASS (full suite).

- [ ] **Step 5: Commit**

```bash
git add backend/app/db/session.py backend/tests/test_sqlite_pragmas.py
git commit -m "feat: SQLite WAL + busy_timeout for concurrent users"
```

---

## Task 12: LLM cost guardrails

**Files:**
- Create: `backend/app/llm/guardrails.py`
- Modify: `backend/app/api/narratives.py`
- Test: `backend/tests/test_llm_guardrails.py`

> **Context for implementer:** Read `backend/app/api/narratives.py` and `backend/app/llm/cache.py` first. The narratives router has a `_wrap` helper and the generate endpoints. `LLMCache` rows have a `created_at` timestamp and a token count column — confirm the exact column names before writing the global-ceiling query (the test below mocks the counters so it does not depend on those names, but the implementation must use them).

- [ ] **Step 1: Write the failing test**

Create `backend/tests/test_llm_guardrails.py`:

```python
import pytest

from app.llm import guardrails


class _Counter:
    def __init__(self, n):
        self.n = n


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
```

- [ ] **Step 2: Run test to verify it fails**

Run: `python -m pytest tests/test_llm_guardrails.py -v`
Expected: FAIL — `ModuleNotFoundError: app.llm.guardrails`.

- [ ] **Step 3: Implement guardrails**

Create `backend/app/llm/guardrails.py`. Implement `_user_generations_today` and `_tokens_today` against the real models — `CampaignNarrative` (joined to `Campaign.user_id`) for per-user counts, and `LLMCache` for token sums — using each row's `created_at` date == today (UTC). Confirm the actual column names when you write these two helpers.

```python
"""Per-user daily generation cap + global daily token ceiling for LLM calls."""
from datetime import datetime, UTC

from sqlalchemy.orm import Session


class RateLimitedError(Exception):
    """Raised when a daily LLM limit is exceeded; API maps to HTTP 429."""


def _today_start():
    now = datetime.now(UTC)
    return datetime(now.year, now.month, now.day, tzinfo=UTC)


def _user_generations_today(db: Session, user_id: int) -> int:
    from app.models.campaign_narrative import CampaignNarrative
    from app.models.campaign import Campaign
    return (db.query(CampaignNarrative)
              .join(Campaign, Campaign.id == CampaignNarrative.campaign_id)
              .filter(Campaign.user_id == user_id,
                      CampaignNarrative.created_at >= _today_start())
              .count())


def _tokens_today(db: Session) -> int:
    from sqlalchemy import func
    from app.models.llm_cache import LLMCache  # confirm module path + token column
    total = (db.query(func.coalesce(func.sum(LLMCache.total_tokens), 0))
               .filter(LLMCache.created_at >= _today_start())
               .scalar())
    return int(total or 0)


def check_user_daily_cap(db: Session, user_id: int, cap: int) -> None:
    if _user_generations_today(db, user_id) >= cap:
        raise RateLimitedError("daily narrative limit reached")


def check_global_token_ceiling(db: Session, ceiling: int) -> None:
    if _tokens_today(db) >= ceiling:
        raise RateLimitedError("narrative generation paused for today")
```

> Confirm `app/models/llm_cache.py` module path, the token column name (`total_tokens` vs `tokens` vs `token_count`), and `created_at` existence. Adjust the import + column reference to match. If `LLMCache` has no usable timestamp/token column, fall back to counting cache rows created today × an estimated tokens-per-row constant (document the estimate).

- [ ] **Step 4: Wire into the narratives endpoints**

In `backend/app/api/narratives.py`, import the guardrails + `get_current_user`, and at the top of each *generate* endpoint (the ones that may call OpenRouter), before generation:

```python
from app.llm.guardrails import check_user_daily_cap, check_global_token_ceiling, RateLimitedError
from app.auth.deps import get_current_user
from app.core.config import settings
from app.models.user import User
```

In each generate handler add `user: User = Depends(get_current_user)` (note: these routers are already include-guarded by `require_owned_campaign`, so `campaign_id` ownership is enforced; this just gets the user id), and:

```python
    try:
        check_user_daily_cap(db, user.id, settings.llm_daily_user_cap)
        check_global_token_ceiling(db, settings.llm_daily_token_ceiling)
    except RateLimitedError as exc:
        raise HTTPException(status_code=429, detail=str(exc))
```

Place this BEFORE the cache-miss → OpenRouter path. (A cache *hit* costs nothing; if you want cache hits to bypass the cap, run the checks only on the miss path — acceptable either way. Simpler: check before. Document the choice in the commit.)

- [ ] **Step 5: Run tests**

Run: `python -m pytest tests/test_llm_guardrails.py -v`
Expected: PASS (4 tests).

Run: `python -m pytest -q`
Expected: PASS (full suite). If narratives API tests now need a user, they pass via the conftest dummy override.

- [ ] **Step 6: Commit**

```bash
git add backend/app/llm/guardrails.py backend/app/api/narratives.py backend/tests/test_llm_guardrails.py
git commit -m "feat: LLM per-user daily cap + global token ceiling (429 on limit)"
```

---

## Task 13: CORS tightening

**Files:**
- Modify: `backend/main.py`

- [ ] **Step 1: Narrow allowed methods**

In `backend/main.py`, change the CORS middleware `allow_methods` from `["*"]` to the explicit set:

```python
app.add_middleware(
    CORSMiddleware,
    allow_origins=settings.cors_origins,
    allow_credentials=True,
    allow_methods=["GET", "POST", "DELETE", "OPTIONS"],
    allow_headers=["*"],
)
```

(Leave `allow_origins` as the explicit list. Keep `allow_headers=["*"]` so `Authorization` passes.)

- [ ] **Step 2: Sanity-check the app boots**

Run from `backend/`: `python -c "import main; print('ok')"`
Expected: `ok`.

Run: `python -m pytest -q`
Expected: PASS (full suite).

- [ ] **Step 3: Commit**

```bash
git add backend/main.py
git commit -m "chore(security): restrict CORS methods to those in use"
```

---

## Task 14: Frontend auth types + store

**Files:**
- Modify: `frontend/src/lib/types.ts`
- Create: `frontend/src/store/authStore.ts`
- Test: `frontend/src/store/__tests__/authStore.test.ts`

- [ ] **Step 1: Add types**

Append to `frontend/src/lib/types.ts`:

```typescript
export interface AuthUser {
  id: number;
  email: string;
  display_name: string;
  avatar_url: string | null;
  auth_provider: string;
}

export interface TokenResponse {
  access_token: string;
  refresh_token: string;
  token_type: string;
  user: AuthUser;
}
```

- [ ] **Step 2: Write the failing test**

Create `frontend/src/store/__tests__/authStore.test.ts`:

```typescript
import { describe, it, expect, beforeEach } from "vitest";
import { useAuthStore } from "../authStore";
import type { TokenResponse } from "../../lib/types";

const sample: TokenResponse = {
  access_token: "acc", refresh_token: "ref", token_type: "bearer",
  user: { id: 1, email: "a@b.com", display_name: "A", avatar_url: null, auth_provider: "password" },
};

describe("authStore", () => {
  beforeEach(() => {
    localStorage.clear();
    useAuthStore.getState().logout();
  });

  it("starts unauthenticated", () => {
    expect(useAuthStore.getState().isAuthenticated).toBe(false);
    expect(useAuthStore.getState().accessToken).toBeNull();
  });

  it("setAuth populates user + tokens and persists", () => {
    useAuthStore.getState().setAuth(sample);
    const s = useAuthStore.getState();
    expect(s.isAuthenticated).toBe(true);
    expect(s.accessToken).toBe("acc");
    expect(s.user?.email).toBe("a@b.com");
    expect(localStorage.getItem("ss_tokens")).toContain("acc");
  });

  it("logout clears state + storage", () => {
    useAuthStore.getState().setAuth(sample);
    useAuthStore.getState().logout();
    expect(useAuthStore.getState().isAuthenticated).toBe(false);
    expect(localStorage.getItem("ss_tokens")).toBeNull();
  });

  it("hydrates from localStorage on init via loadFromStorage", () => {
    localStorage.setItem("ss_tokens", JSON.stringify({ access_token: "x", refresh_token: "y" }));
    localStorage.setItem("ss_user", JSON.stringify(sample.user));
    useAuthStore.getState().loadFromStorage();
    expect(useAuthStore.getState().accessToken).toBe("x");
    expect(useAuthStore.getState().isAuthenticated).toBe(true);
  });
});
```

- [ ] **Step 3: Run test to verify it fails**

Run from `frontend/`: `npm test -- authStore`
Expected: FAIL — module not found.

- [ ] **Step 4: Implement the store**

Create `frontend/src/store/authStore.ts`:

```typescript
import { create } from "zustand";
import type { AuthUser, TokenResponse } from "../lib/types";

const TOKENS_KEY = "ss_tokens";
const USER_KEY = "ss_user";

interface AuthState {
  user: AuthUser | null;
  accessToken: string | null;
  refreshToken: string | null;
  isAuthenticated: boolean;
  setAuth: (resp: TokenResponse) => void;
  setTokens: (access: string, refresh: string) => void;
  logout: () => void;
  loadFromStorage: () => void;
}

export const useAuthStore = create<AuthState>((set) => ({
  user: null,
  accessToken: null,
  refreshToken: null,
  isAuthenticated: false,

  setAuth: (resp) => {
    localStorage.setItem(TOKENS_KEY, JSON.stringify({
      access_token: resp.access_token, refresh_token: resp.refresh_token,
    }));
    localStorage.setItem(USER_KEY, JSON.stringify(resp.user));
    set({ user: resp.user, accessToken: resp.access_token, refreshToken: resp.refresh_token, isAuthenticated: true });
  },

  setTokens: (access, refresh) => {
    localStorage.setItem(TOKENS_KEY, JSON.stringify({ access_token: access, refresh_token: refresh }));
    set({ accessToken: access, refreshToken: refresh, isAuthenticated: true });
  },

  logout: () => {
    localStorage.removeItem(TOKENS_KEY);
    localStorage.removeItem(USER_KEY);
    set({ user: null, accessToken: null, refreshToken: null, isAuthenticated: false });
  },

  loadFromStorage: () => {
    try {
      const t = localStorage.getItem(TOKENS_KEY);
      const u = localStorage.getItem(USER_KEY);
      if (!t) return;
      const tokens = JSON.parse(t);
      const user = u ? JSON.parse(u) : null;
      set({
        accessToken: tokens.access_token ?? null,
        refreshToken: tokens.refresh_token ?? null,
        user,
        isAuthenticated: Boolean(tokens.access_token),
      });
    } catch {
      /* ignore corrupt storage */
    }
  },
}));
```

- [ ] **Step 5: Run tests**

Run from `frontend/`: `npm test -- authStore`
Expected: PASS (4 tests).

- [ ] **Step 6: Commit**

```bash
git add frontend/src/lib/types.ts frontend/src/store/authStore.ts frontend/src/store/__tests__/authStore.test.ts
git commit -m "feat(auth): frontend auth types + Zustand authStore"
```

---

## Task 15: Frontend API methods + axios interceptors

**Files:**
- Modify: `frontend/src/lib/api.ts`
- Test: `frontend/src/lib/__tests__/authApi.test.ts`

- [ ] **Step 1: Write the failing test**

Create `frontend/src/lib/__tests__/authApi.test.ts`:

```typescript
import { describe, it, expect, beforeEach, vi } from "vitest";
import { http, api } from "../api";
import { useAuthStore } from "../../store/authStore";

describe("auth api + interceptors", () => {
  beforeEach(() => {
    localStorage.clear();
    useAuthStore.getState().logout();
    vi.restoreAllMocks();
  });

  it("signup posts and returns tokens", async () => {
    vi.spyOn(http, "post").mockResolvedValueOnce({
      data: { access_token: "a", refresh_token: "r", token_type: "bearer",
              user: { id: 1, email: "a@b.com", display_name: "A", avatar_url: null, auth_provider: "password" } },
    } as never);
    const res = await api.signup("a@b.com", "pw123456", "A");
    expect(res.access_token).toBe("a");
  });

  it("request interceptor attaches bearer when authenticated", () => {
    useAuthStore.getState().setTokens("tok123", "ref123");
    const cfg = { headers: {} as Record<string, string> };
    // Invoke the interceptor handler directly:
    const handler = (http.interceptors.request as unknown as { handlers: { fulfilled: (c: typeof cfg) => typeof cfg }[] }).handlers[0].fulfilled;
    const out = handler(cfg);
    expect(out.headers.Authorization).toBe("Bearer tok123");
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run from `frontend/`: `npm test -- authApi`
Expected: FAIL — `api.signup` not a function / no interceptor.

- [ ] **Step 3: Add interceptors + auth methods**

In `frontend/src/lib/api.ts`, after `export const http = axios.create({ baseURL, timeout: 10_000 });`, add interceptors. Import the store lazily inside handlers to avoid a circular import at module load:

```typescript
import type { TokenResponse } from "./types";

// Attach bearer token on every request.
http.interceptors.request.use((config) => {
  // Lazy import avoids circular dep (authStore imports nothing from api).
  const token = localStorage.getItem("ss_tokens");
  if (token) {
    try {
      const { access_token } = JSON.parse(token);
      if (access_token) config.headers.Authorization = `Bearer ${access_token}`;
    } catch { /* ignore */ }
  }
  return config;
});

// On 401, try one refresh then retry; otherwise clear session.
let refreshing: Promise<string | null> | null = null;

async function tryRefresh(): Promise<string | null> {
  const raw = localStorage.getItem("ss_tokens");
  if (!raw) return null;
  let refresh_token: string | undefined;
  try { refresh_token = JSON.parse(raw).refresh_token; } catch { return null; }
  if (!refresh_token) return null;
  try {
    const { data } = await axios.post<TokenResponse>(`${baseURL}/api/auth/refresh`, { refresh_token });
    localStorage.setItem("ss_tokens", JSON.stringify({
      access_token: data.access_token, refresh_token: data.refresh_token,
    }));
    return data.access_token;
  } catch {
    return null;
  }
}

http.interceptors.response.use(
  (r) => r,
  async (error) => {
    const original = error.config;
    if (error.response?.status === 401 && original && !original._retried) {
      original._retried = true;
      refreshing = refreshing ?? tryRefresh();
      const newToken = await refreshing;
      refreshing = null;
      if (newToken) {
        original.headers.Authorization = `Bearer ${newToken}`;
        return http(original);
      }
      // refresh failed -> clear session + redirect to login
      localStorage.removeItem("ss_tokens");
      localStorage.removeItem("ss_user");
      if (typeof window !== "undefined" && window.location.pathname !== "/login") {
        window.location.assign("/login");
      }
    }
    return Promise.reject(error);
  },
);
```

Add the auth methods to the `api` object:

```typescript
  async signup(email: string, password: string, display_name?: string): Promise<TokenResponse> {
    const { data } = await http.post<TokenResponse>("/api/auth/signup", { email, password, display_name });
    return data;
  },
  async login(email: string, password: string): Promise<TokenResponse> {
    const { data } = await http.post<TokenResponse>("/api/auth/login", { email, password });
    return data;
  },
  async loginGoogle(idToken: string): Promise<TokenResponse> {
    const { data } = await http.post<TokenResponse>("/api/auth/google", { id_token: idToken });
    return data;
  },
  async getMe(): Promise<TokenResponse["user"]> {
    const { data } = await http.get<TokenResponse["user"]>("/api/auth/me");
    return data;
  },
```

> Note: the request interceptor reads the token from localStorage (not the store) so it stays decoupled and testable. The `_retried` flag on the axios config prevents infinite refresh loops.

- [ ] **Step 4: Run tests**

Run from `frontend/`: `npm test -- authApi`
Expected: PASS (2 tests).

Run from `frontend/`: `npm test`
Expected: PASS (no regressions in existing suites).

- [ ] **Step 5: Commit**

```bash
git add frontend/src/lib/api.ts frontend/src/lib/__tests__/authApi.test.ts
git commit -m "feat(auth): axios bearer + 401-refresh interceptors, auth api methods"
```

---

## Task 16: Login page, route guard, header logout, Google script

**Files:**
- Create: `frontend/src/pages/Login.tsx`
- Create: `frontend/src/components/auth/GoogleSignInButton.tsx`
- Create: `frontend/src/components/auth/ProtectedRoute.tsx`
- Modify: `frontend/src/App.tsx`
- Modify: `frontend/src/main.tsx`
- Modify: `frontend/index.html`
- Modify: `frontend/src/pages/CampaignMapView.tsx` (header logout)
- Test: `frontend/src/pages/__tests__/Login.test.tsx`, `frontend/src/components/auth/__tests__/ProtectedRoute.test.tsx`

- [ ] **Step 1: Write the failing tests**

Create `frontend/src/components/auth/__tests__/ProtectedRoute.test.tsx`:

```typescript
import { describe, it, expect, beforeEach } from "vitest";
import { render, screen } from "@testing-library/react";
import { MemoryRouter, Routes, Route } from "react-router-dom";
import { ProtectedRoute } from "../ProtectedRoute";
import { useAuthStore } from "../../../store/authStore";

function tree(initial: string) {
  return (
    <MemoryRouter initialEntries={[initial]}>
      <Routes>
        <Route element={<ProtectedRoute />}>
          <Route path="/secret" element={<div>SECRET</div>} />
        </Route>
        <Route path="/login" element={<div>LOGIN PAGE</div>} />
      </Routes>
    </MemoryRouter>
  );
}

describe("ProtectedRoute", () => {
  beforeEach(() => { localStorage.clear(); useAuthStore.getState().logout(); });

  it("redirects to /login when unauthenticated", () => {
    render(tree("/secret"));
    expect(screen.getByText("LOGIN PAGE")).toBeInTheDocument();
  });

  it("renders child when authenticated", () => {
    useAuthStore.getState().setTokens("a", "r");
    render(tree("/secret"));
    expect(screen.getByText("SECRET")).toBeInTheDocument();
  });
});
```

Create `frontend/src/pages/__tests__/Login.test.tsx`:

```typescript
import { describe, it, expect, beforeEach, vi } from "vitest";
import { render, screen, fireEvent, waitFor } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { Login } from "../Login";
import { api } from "../../lib/api";
import { useAuthStore } from "../../store/authStore";

describe("Login", () => {
  beforeEach(() => { localStorage.clear(); useAuthStore.getState().logout(); vi.restoreAllMocks(); });

  it("renders email + password fields and a Google button container", () => {
    render(<MemoryRouter><Login /></MemoryRouter>);
    expect(screen.getByLabelText(/email/i)).toBeInTheDocument();
    expect(screen.getByLabelText(/password/i)).toBeInTheDocument();
  });

  it("logs in via email/password and stores auth", async () => {
    vi.spyOn(api, "login").mockResolvedValueOnce({
      access_token: "a", refresh_token: "r", token_type: "bearer",
      user: { id: 1, email: "a@b.com", display_name: "A", avatar_url: null, auth_provider: "password" },
    });
    render(<MemoryRouter><Login /></MemoryRouter>);
    fireEvent.change(screen.getByLabelText(/email/i), { target: { value: "a@b.com" } });
    fireEvent.change(screen.getByLabelText(/password/i), { target: { value: "pw123456" } });
    fireEvent.click(screen.getByRole("button", { name: /sign in/i }));
    await waitFor(() => expect(useAuthStore.getState().isAuthenticated).toBe(true));
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run from `frontend/`: `npm test -- ProtectedRoute Login`
Expected: FAIL — modules not found.

- [ ] **Step 3: Implement ProtectedRoute**

Create `frontend/src/components/auth/ProtectedRoute.tsx`:

```typescript
import { Navigate, Outlet } from "react-router-dom";
import { useAuthStore } from "../../store/authStore";

export function ProtectedRoute() {
  const isAuthenticated = useAuthStore((s) => s.isAuthenticated);
  if (!isAuthenticated) return <Navigate to="/login" replace />;
  return <Outlet />;
}
```

- [ ] **Step 4: Implement the Google button**

Create `frontend/src/components/auth/GoogleSignInButton.tsx`:

```typescript
import { useEffect, useRef } from "react";

interface Props {
  onCredential: (idToken: string) => void;
}

// Renders the Google Identity Services button. Requires the GSI script
// (loaded in index.html) and VITE_GOOGLE_CLIENT_ID.
export function GoogleSignInButton({ onCredential }: Props) {
  const ref = useRef<HTMLDivElement>(null);
  const clientId = import.meta.env.VITE_GOOGLE_CLIENT_ID as string | undefined;

  useEffect(() => {
    const g = (window as unknown as { google?: any }).google;
    if (!g || !clientId || !ref.current) return;
    g.accounts.id.initialize({
      client_id: clientId,
      callback: (resp: { credential?: string }) => {
        if (resp.credential) onCredential(resp.credential);
      },
    });
    g.accounts.id.renderButton(ref.current, {
      type: "standard", theme: "outline", size: "large", text: "continue_with", width: 280,
    });
  }, [clientId, onCredential]);

  if (!clientId) {
    return <p className="text-xs text-slate-400">Google Sign-In unavailable (no client ID configured).</p>;
  }
  return <div ref={ref} />;
}
```

- [ ] **Step 5: Implement the Login page**

Create `frontend/src/pages/Login.tsx`:

```typescript
import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { api } from "../lib/api";
import { useAuthStore } from "../store/authStore";
import { GoogleSignInButton } from "../components/auth/GoogleSignInButton";

export function Login() {
  const navigate = useNavigate();
  const setAuth = useAuthStore((s) => s.setAuth);
  const [mode, setMode] = useState<"login" | "signup">("login");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [displayName, setDisplayName] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setBusy(true);
    try {
      const resp = mode === "login"
        ? await api.login(email, password)
        : await api.signup(email, password, displayName || undefined);
      setAuth(resp);
      navigate("/");
    } catch (err: any) {
      setError(err?.response?.data?.detail ?? "Something went wrong");
    } finally {
      setBusy(false);
    }
  }

  async function onGoogle(idToken: string) {
    setError(null);
    try {
      const resp = await api.loginGoogle(idToken);
      setAuth(resp);
      navigate("/");
    } catch (err: any) {
      setError(err?.response?.data?.detail ?? "Google sign-in failed");
    }
  }

  return (
    <div className="min-h-screen flex items-center justify-center bg-slate-950 px-4">
      <div className="w-full max-w-sm space-y-6 rounded-xl border border-slate-800 bg-slate-900 p-6">
        <div>
          <h1 className="text-xl font-bold text-slate-100">Sovereign Shield</h1>
          <p className="text-sm text-slate-400">
            {mode === "login" ? "Sign in to continue" : "Create your account"}
          </p>
        </div>

        <GoogleSignInButton onCredential={onGoogle} />

        <div className="flex items-center gap-2 text-xs text-slate-500">
          <span className="h-px flex-1 bg-slate-800" /> or <span className="h-px flex-1 bg-slate-800" />
        </div>

        <form onSubmit={submit} className="space-y-3">
          {mode === "signup" && (
            <div>
              <label htmlFor="dn" className="block text-xs text-slate-400">Display name</label>
              <input id="dn" value={displayName} onChange={(e) => setDisplayName(e.target.value)}
                     className="mt-1 w-full rounded bg-slate-800 px-3 py-2 text-slate-100" />
            </div>
          )}
          <div>
            <label htmlFor="email" className="block text-xs text-slate-400">Email</label>
            <input id="email" type="email" required value={email} onChange={(e) => setEmail(e.target.value)}
                   className="mt-1 w-full rounded bg-slate-800 px-3 py-2 text-slate-100" />
          </div>
          <div>
            <label htmlFor="password" className="block text-xs text-slate-400">Password</label>
            <input id="password" type="password" required value={password} onChange={(e) => setPassword(e.target.value)}
                   className="mt-1 w-full rounded bg-slate-800 px-3 py-2 text-slate-100" />
          </div>
          {error && <p className="text-sm text-red-400">{error}</p>}
          <button type="submit" disabled={busy}
                  className="w-full rounded bg-amber-500 py-2 font-semibold text-slate-950 disabled:opacity-50">
            {mode === "login" ? "Sign in" : "Create account"}
          </button>
        </form>

        <button onClick={() => { setMode(mode === "login" ? "signup" : "login"); setError(null); }}
                className="w-full text-xs text-slate-400 underline">
          {mode === "login" ? "Need an account? Sign up" : "Already have an account? Sign in"}
        </button>
      </div>
    </div>
  );
}
```

- [ ] **Step 6: Load the GSI script**

In `frontend/index.html`, add inside `<head>`:

```html
<script src="https://accounts.google.com/gsi/client" async defer></script>
```

- [ ] **Step 7: Hydrate auth on app boot**

In `frontend/src/main.tsx`, before rendering, call `loadFromStorage()` once. Add:

```typescript
import { useAuthStore } from "./store/authStore";
useAuthStore.getState().loadFromStorage();
```

(Place after imports, before `createRoot(...)`.)

- [ ] **Step 8: Wire routes + guard**

In `frontend/src/App.tsx`, import the new pieces and wrap all campaign routes with `ProtectedRoute`, add the `/login` route:

```typescript
import { Login } from "./pages/Login";
import { ProtectedRoute } from "./components/auth/ProtectedRoute";
```

Restructure `<Routes>`:

```typescript
<Routes>
  <Route path="/login" element={<Login />} />
  <Route element={<ProtectedRoute />}>
    <Route path="/" element={<Landing />} />
    <Route path="/campaign/:id" element={<CampaignMapView />} />
    {/* ...all existing campaign routes unchanged... */}
    <Route path="/campaign/:id/raw" element={<CampaignConsoleRaw />} />
  </Route>
  <Route path="*" element={<Navigate to="/" replace />} />
</Routes>
```

- [ ] **Step 9: Add logout to the header**

In `frontend/src/pages/CampaignMapView.tsx`, import `useAuthStore` and `useNavigate` (if not present). Add a logout control to the header menu (find the existing header nav / hamburger menu block and add):

```typescript
// near other hooks:
const logout = useAuthStore((s) => s.logout);
const user = useAuthStore((s) => s.user);
// in the menu JSX:
<button onClick={() => { logout(); navigate("/login"); }}
        className="text-left text-sm text-slate-300 hover:text-white">
  Sign out{user ? ` (${user.display_name})` : ""}
</button>
```

(Place it alongside the existing nav links in the menu. Import `useAuthStore` from `../store/authStore`.)

- [ ] **Step 10: Run tests**

Run from `frontend/`: `npm test -- ProtectedRoute Login`
Expected: PASS (4 tests).

Run from `frontend/`: `npm test`
Expected: PASS (full suite, no regressions).

- [ ] **Step 11: Commit**

```bash
git add frontend/src/pages/Login.tsx frontend/src/components/auth/ frontend/src/App.tsx frontend/src/main.tsx frontend/index.html frontend/src/pages/CampaignMapView.tsx frontend/src/pages/__tests__/Login.test.tsx frontend/src/components/auth/__tests__/ProtectedRoute.test.tsx
git commit -m "feat(auth): Login page, Google button, route guard, header logout"
```

---

## Task 17: Docs, deploy config, and status updates

**Files:**
- Modify: `docs/DEPLOYMENT.md`
- Modify: `deploy.sh`
- Modify: `CLAUDE.md`
- Modify: `docs/superpowers/plans/ROADMAP.md`

- [ ] **Step 1: Document the Google Cloud Console setup + new env vars**

Add a section to `docs/DEPLOYMENT.md` titled "Auth setup (Google OAuth)" with these exact steps:

```markdown
## Auth setup (Google OAuth)

1. Google Cloud Console → APIs & Services → Credentials → Create Credentials → OAuth client ID.
2. Application type: **Web application**.
3. **Authorized JavaScript origins** (no redirect URI needed for the GIS button flow):
   - `http://localhost:5173`
   - `http://localhost:5174`
   - the production frontend URL (currently `https://pmc-tycoon.skdev.one`; update when the rename lands)
4. Copy the **Client ID**. Put it in BOTH:
   - `backend/.env` → `GOOGLE_CLIENT_ID=<client-id>`
   - `frontend/.env` (and Vercel project env) → `VITE_GOOGLE_CLIENT_ID=<client-id>`
5. Generate a strong `JWT_SECRET_KEY` (e.g. `openssl rand -hex 32`) and set it in `backend/.env`.
6. The same Client ID is used as both the frontend button's client id and the backend verification audience — they MUST match.

### New backend env vars
- `GOOGLE_CLIENT_ID` — required for Google sign-in.
- `JWT_SECRET_KEY` — required; sign-in tokens are invalid if this changes.
- Optional: `ACCESS_TOKEN_EXPIRE_MINUTES` (default 120), `REFRESH_TOKEN_EXPIRE_MINUTES` (default 43200),
  `LLM_DAILY_USER_CAP` (default 40), `LLM_DAILY_TOKEN_CEILING` (default 2000000), `OWNER_EMAIL` (default thetinkerer018@gmail.com).
```

- [ ] **Step 2: Surface the new env vars in deploy.sh**

In `deploy.sh`, find where `--env-file .env` / OpenRouter key is documented and add a comment block noting `GOOGLE_CLIENT_ID` and `JWT_SECRET_KEY` must be present in the backend `.env` on the VM, and `VITE_GOOGLE_CLIENT_ID` must be set in the Vercel project env. (Do not hardcode secret values.)

- [ ] **Step 3: Update CLAUDE.md status block**

Add a "Plan 23 (Auth + Release Readiness)" bullet to the Current status section summarizing: Google + email/password auth (chillbill pattern), `User` model + `Campaign.user_id`, `require_owned_campaign` guard on all campaign routers, startup owner-backfill migration, SQLite WAL, LLM daily caps, CORS tightening, frontend Login + ProtectedRoute + authStore + axios refresh interceptors. Note new test counts after running the full suites. Add a carry-over note: "email verification + password reset deferred (no email infra); JWT in localStorage (XSS tradeoff accepted); user_id enforced at app layer not DB (SQLite create_all limitation)."

- [ ] **Step 4: Update ROADMAP.md**

Add a `| 23 | Auth + Release Readiness | 🟢 done | 2026-06-20-auth-release-readiness-plan.md |` row to the Current Status Summary table and bump "Last updated".

- [ ] **Step 5: Run both full suites one last time**

Run from `backend/`: `python -m pytest -q` — Expected: PASS.
Run from `frontend/`: `npm test` — Expected: PASS.

- [ ] **Step 6: Commit**

```bash
git add docs/DEPLOYMENT.md deploy.sh CLAUDE.md docs/superpowers/plans/ROADMAP.md
git commit -m "docs(auth): Google OAuth setup, env vars, plan 23 status"
```

---

## Final review checklist (controller runs after all tasks)

- [ ] Full backend suite green (`python -m pytest -q`); note count vs prior 589 baseline.
- [ ] Full frontend suite green (`npm test`); note count vs prior 192 baseline.
- [ ] Spot-check: every router in `main.py` is either auth_router, content_router (public), campaigns/export (per-route guarded), or in the `_guard` list. No campaign router is unguarded.
- [ ] `superpowers:code-reviewer` pass — this plan adds new DB writes (User), new auth surface, and touches the request path for every endpoint. Do NOT skip review.
- [ ] Manual smoke (local): set `GOOGLE_CLIENT_ID` + `VITE_GOOGLE_CLIENT_ID`, sign up with email/password, create a campaign, sign out, sign in as a second user, confirm the first user's campaign is not visible.

---

## Spec coverage self-check

- Data model (User + Campaign.user_id) → Task 2 ✓
- Backend auth module (security/service/deps/router) → Tasks 3–6 ✓
- Endpoint protection across ~22 routers + campaigns/export → Tasks 8–9 ✓
- Existing-data migration → Task 10 ✓
- SQLite WAL hardening → Task 11 ✓
- LLM guardrails (per-user cap + global ceiling) → Task 12 ✓
- CORS tightening → Task 13 ✓
- Frontend authStore / interceptors / Login / ProtectedRoute / logout → Tasks 14–16 ✓
- Config/env + Google setup docs → Tasks 1, 17 ✓
- Out of scope (email verify, password reset) → not built, noted in Task 17 carry-over ✓
- Test-suite survival under new auth → Task 7 ✓
