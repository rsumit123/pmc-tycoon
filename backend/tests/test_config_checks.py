import logging

import pytest
from sqlalchemy import create_engine, text
from sqlalchemy.pool import StaticPool

from app.core import checks


class _FakeSettings:
    def __init__(self, database_url, jwt_secret_key):
        self.database_url = database_url
        self.jwt_secret_key = jwt_secret_key


def test_is_production_like():
    assert checks.is_production_like("sqlite:////app/data/sovereign_shield.db") is True
    assert checks.is_production_like("sqlite:///./sovereign_shield.db") is False
    assert checks.is_production_like("sqlite:///:memory:") is False


def test_assert_production_secrets_raises_on_prod_default():
    s = _FakeSettings("sqlite:////app/data/sovereign_shield.db", checks.INSECURE_JWT_DEFAULT)
    with pytest.raises(RuntimeError):
        checks.assert_production_secrets(s)


def test_assert_production_secrets_ok_for_prod_with_real_secret():
    s = _FakeSettings("sqlite:////app/data/sovereign_shield.db", "a-real-long-secret")
    checks.assert_production_secrets(s)  # no raise


def test_assert_production_secrets_allows_dev_default():
    s = _FakeSettings("sqlite:///./sovereign_shield.db", checks.INSECURE_JWT_DEFAULT)
    checks.assert_production_secrets(s)  # no raise (local dev)


def test_verify_user_id_migration_logs_error_when_missing(caplog):
    engine = create_engine("sqlite:///:memory:", connect_args={"check_same_thread": False}, poolclass=StaticPool)
    with engine.begin() as conn:
        conn.execute(text("CREATE TABLE campaigns (id INTEGER PRIMARY KEY, name TEXT)"))
    with caplog.at_level(logging.ERROR):
        checks.verify_user_id_migration(engine)
    assert any("user_id" in r.message and r.levelno == logging.ERROR for r in caplog.records)


def test_verify_user_id_migration_silent_when_present(caplog):
    engine = create_engine("sqlite:///:memory:", connect_args={"check_same_thread": False}, poolclass=StaticPool)
    with engine.begin() as conn:
        conn.execute(text("CREATE TABLE campaigns (id INTEGER PRIMARY KEY, user_id INTEGER)"))
    with caplog.at_level(logging.ERROR):
        checks.verify_user_id_migration(engine)
    assert not [r for r in caplog.records if r.levelno == logging.ERROR]
