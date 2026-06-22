#!/usr/bin/env python3
"""Download platform hero images per asset_manifest.yaml.

Usage:
  python3 scripts/fetch_platform_assets.py            # fetch all
  python3 scripts/fetch_platform_assets.py rafale_f4  # fetch one

Output:
  frontend/public/platforms/{id}/hero.webp
  frontend/public/platforms/{id}/attribution.json
  frontend/public/platforms/attributions.json
"""
from __future__ import annotations

import io
import json
import sys
import time
from pathlib import Path

import httpx
import yaml
from PIL import Image


REPO_ROOT = Path(__file__).resolve().parent.parent
MANIFEST = REPO_ROOT / "backend" / "content" / "asset_manifest.yaml"
OUT_DIR = REPO_ROOT / "frontend" / "public" / "platforms"

MAX_WIDTH = 800
# Wikimedia's robot policy requires a descriptive UA with contact info; a
# browser UA gets throttled (HTTP 429). https://w.wiki/4wJS
UA = "ChakravyuhGame/1.0 (https://chakravyuh.skdev.one; thetinkerer018@gmail.com) python-httpx"
REQUEST_DELAY_S = 1.5  # be polite between requests
RETRY_429_BACKOFF_S = (6, 12)  # waits before retrying a 429


def load_manifest() -> list[dict]:
    with MANIFEST.open("r", encoding="utf-8") as f:
        data = yaml.safe_load(f)
    return data.get("platforms", [])


def _to_webp(raw: bytes, dest: Path) -> None:
    img = Image.open(io.BytesIO(raw)).convert("RGB")
    if img.width > MAX_WIDTH:
        h = round(img.height * MAX_WIDTH / img.width)
        img = img.resize((MAX_WIDTH, h), Image.LANCZOS)
    img.save(dest, "WEBP", quality=80, method=6)


def fetch_one(entry: dict) -> bool:
    pid = entry["id"]
    url = entry["hero_url"]
    dest = OUT_DIR / pid
    dest.mkdir(parents=True, exist_ok=True)
    hero = dest / "hero.webp"
    attr = dest / "attribution.json"

    print(f"[{pid}] {url}")
    try:
        with httpx.Client(follow_redirects=True, timeout=30.0, headers={"User-Agent": UA}) as client:
            r = client.get(url)
            for backoff in RETRY_429_BACKOFF_S:
                if r.status_code != 429:
                    break
                print(f"  429 throttled — waiting {backoff}s then retrying")
                time.sleep(backoff)
                r = client.get(url)
            r.raise_for_status()
    except httpx.HTTPError as e:
        print(f"  FAILED: {e}")
        return False
    try:
        _to_webp(r.content, hero)
    except Exception as e:  # noqa: BLE001
        print(f"  IMAGE ERROR: {e}")
        return False

    attr.write_text(json.dumps({
        "platform_id": pid,
        "attribution": entry.get("attribution", ""),
        "author": entry.get("author", ""),
        "license": entry.get("license", "unknown"),
        "source_url": entry.get("source_url", url),
    }, indent=2), encoding="utf-8")
    print(f"  saved {hero.relative_to(REPO_ROOT)} ({hero.stat().st_size:,} bytes)")
    return True


def write_aggregate() -> None:
    full = load_manifest()
    rows = [
        {k: e.get(k, "") for k in ("id", "attribution", "author", "license", "source_url")}
        for e in full
        if (OUT_DIR / e["id"] / "hero.webp").exists()
    ]
    (OUT_DIR / "attributions.json").write_text(json.dumps(rows, indent=2), encoding="utf-8")
    print(f"wrote attributions.json ({len(rows)} images)")


def main(argv: list[str]) -> int:
    manifest = load_manifest()
    if argv:
        wanted = set(argv)
        manifest = [e for e in manifest if e["id"] in wanted]
        missing = wanted - {e["id"] for e in manifest}
        if missing:
            print(f"unknown platforms in manifest: {sorted(missing)}")
            return 2
    ok = 0
    for i, e in enumerate(manifest):
        if i:
            time.sleep(REQUEST_DELAY_S)
        ok += fetch_one(e)
    print(f"\n{ok}/{len(manifest)} fetched successfully.")
    write_aggregate()
    return 0 if ok == len(manifest) else 1


if __name__ == "__main__":
    sys.exit(main(sys.argv[1:]))
