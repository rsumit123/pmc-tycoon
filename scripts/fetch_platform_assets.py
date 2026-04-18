#!/usr/bin/env python3
"""Download platform hero images per asset_manifest.yaml.

Usage:
  python3 scripts/fetch_platform_assets.py            # fetch all
  python3 scripts/fetch_platform_assets.py rafale_f4  # fetch one

Output:
  frontend/public/platforms/{id}/hero.jpg
  frontend/public/platforms/{id}/attribution.json
"""
from __future__ import annotations

import json
import sys
from pathlib import Path

import httpx
import yaml


REPO_ROOT = Path(__file__).resolve().parent.parent
MANIFEST = REPO_ROOT / "backend" / "content" / "asset_manifest.yaml"
OUT_DIR = REPO_ROOT / "frontend" / "public" / "platforms"


def load_manifest() -> list[dict]:
    with MANIFEST.open("r", encoding="utf-8") as f:
        data = yaml.safe_load(f)
    return data.get("platforms", [])


def fetch_one(entry: dict) -> bool:
    pid = entry["id"]
    url = entry["hero_url"]
    dest = OUT_DIR / pid
    dest.mkdir(parents=True, exist_ok=True)
    hero = dest / "hero.jpg"
    attr = dest / "attribution.json"

    print(f"[{pid}] {url}")
    try:
        with httpx.Client(
            follow_redirects=True,
            timeout=30.0,
            headers={"User-Agent": "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36"},
        ) as client:
            r = client.get(url)
            r.raise_for_status()
    except httpx.HTTPError as e:
        print(f"  FAILED: {e}")
        return False

    hero.write_bytes(r.content)
    attr.write_text(json.dumps({
        "platform_id": pid,
        "source_url": url,
        "license": entry.get("license", "unknown"),
        "attribution": entry.get("attribution", ""),
    }, indent=2), encoding="utf-8")
    print(f"  saved {hero.relative_to(REPO_ROOT)} ({len(r.content):,} bytes)")
    return True


def main(argv: list[str]) -> int:
    manifest = load_manifest()
    if argv:
        wanted = set(argv)
        manifest = [e for e in manifest if e["id"] in wanted]
        missing = wanted - {e["id"] for e in manifest}
        if missing:
            print(f"unknown platforms in manifest: {sorted(missing)}")
            return 2
    ok = sum(fetch_one(e) for e in manifest)
    print(f"\n{ok}/{len(manifest)} fetched successfully.")
    return 0 if ok == len(manifest) else 1


if __name__ == "__main__":
    sys.exit(main(sys.argv[1:]))
