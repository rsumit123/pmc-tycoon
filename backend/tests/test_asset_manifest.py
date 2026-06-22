from pathlib import Path
import yaml

ROOT = Path(__file__).resolve().parent.parent.parent
MANIFEST = ROOT / "backend" / "content" / "asset_manifest.yaml"
PLATFORMS = ROOT / "backend" / "content" / "platforms.yaml"

REQUIRED = {"id", "hero_url", "license", "author", "source_url", "attribution"}
# Permissive license tokens (substring match). Accepts CC-BY family, public
# domain, CC0, and GODL-India (free commercial use w/ attribution). Anything
# else (GFDL-only, CC BY-NC/ND, fair use) must be rejected.
ALLOWED_LICENSE_TOKENS = ("CC BY", "CC0", "Public domain", "public domain", "GODL")


def _platform_ids() -> set[str]:
    data = yaml.safe_load(PLATFORMS.read_text())
    return {p["id"] for p in data["platforms"]}


def test_manifest_entries_well_formed():
    entries = yaml.safe_load(MANIFEST.read_text())["platforms"]
    ids = _platform_ids()
    seen = set()
    assert entries, "manifest has no entries"
    for e in entries:
        missing = REQUIRED - e.keys()
        assert not missing, f"{e.get('id','?')} missing fields: {missing}"
        assert e["id"] in ids, f"manifest id not in platforms.yaml: {e['id']}"
        assert e["id"] not in seen, f"duplicate manifest id: {e['id']}"
        seen.add(e["id"])
        # reject explicitly non-commercial / no-derivatives even if they contain 'CC BY'
        assert "CC BY-NC" not in e["license"] and "CC BY-ND" not in e["license"], \
            f"{e['id']} has restrictive license: {e['license']}"
        assert any(tok in e["license"] for tok in ALLOWED_LICENSE_TOKENS), \
            f"{e['id']} has non-permissive license: {e['license']}"
        assert str(e["hero_url"]).startswith("http")
        assert str(e["source_url"]).startswith("http")
