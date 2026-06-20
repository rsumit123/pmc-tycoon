from sqlalchemy import text

from app.db.session import engine


def test_wal_and_busy_timeout_set():
    with engine.connect() as conn:
        jm = conn.execute(text("PRAGMA journal_mode")).scalar()
        bt = conn.execute(text("PRAGMA busy_timeout")).scalar()
    assert str(jm).lower() in ("wal", "memory")
    assert int(bt) >= 5000
