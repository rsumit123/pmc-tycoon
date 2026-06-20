"""Shared test config.

Authenticate every request as a fixed dummy user so the campaign-ownership
guard (require_owned_campaign) passes in existing tests.

Tests that need to exercise real auth (multi-user isolation, 401 paths) should
pop this override -- see test_campaign_isolation.py / test_auth_api.py.
"""
import pytest
from sqlalchemy import create_engine
from sqlalchemy.orm import sessionmaker

from app.db.base import Base
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


@pytest.fixture
def db():
    engine = create_engine("sqlite:///:memory:", connect_args={"check_same_thread": False})
    TestingSessionLocal = sessionmaker(autocommit=False, autoflush=False, bind=engine)

    # Import all models so Base.metadata knows about them
    import app.models  # noqa: F401

    Base.metadata.create_all(bind=engine)
    session = TestingSessionLocal()
    try:
        yield session
    finally:
        session.close()
        Base.metadata.drop_all(bind=engine)
        engine.dispose()
