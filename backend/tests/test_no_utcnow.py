"""Ensure no production code uses deprecated datetime.utcnow()."""
from pathlib import Path

BACKEND_ROOT = Path(__file__).parent.parent / "app"


def test_no_utcnow_in_app():
    """Guard: production code must use datetime.now(UTC), not deprecated utcnow()."""
    hits = []
    for py in BACKEND_ROOT.rglob("*.py"):
        text = py.read_text()
        if "utcnow" in text:
            hits.append(str(py.relative_to(BACKEND_ROOT.parent)))
    assert not hits, f"datetime.utcnow() found in: {hits}"
