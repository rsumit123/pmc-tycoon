"""Generate 3D platform models: OpenRouter concept image -> Tripo image-to-3D -> GLB.

Part of the 3D roadmap (docs/superpowers/specs/2026-07-02-3d-roadmap-design.md, Phase C pipeline).

Usage:
    OPENROUTER_API_KEY=... TRIPO_API_KEY=... python3 scripts/generate_platform_models.py [platform_id ...]

With no args, runs the full curated batch below. Resumable: skips any platform whose
original.glb already exists under assets3d/<id>/. Stops when the Tripo balance drops
below RESERVE (keeps buffer for retries).

Outputs per platform (assets3d/<id>/):
    concept.png   - AI concept render fed to Tripo (regenerable, gitignored)
    original.glb  - raw Tripo output (~7 MB, gitignored)
    hero.glb      - produced by the separate optimize step (scripts/optimize_models.sh)

Costs (observed 2026-07-02): concept image ~cents via OpenRouter; image_to_model = 30
Tripo credits. Free wallet expires 2026-07-16.
"""
import base64
import json
import mimetypes
import os
import sys
import time
import urllib.error
import urllib.request
import uuid

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
OUT_ROOT = os.path.join(ROOT, "assets3d")
RESERVE = int(os.environ.get("TRIPO_RESERVE", "30"))  # stop when balance would drop below this

OPENROUTER_KEY = os.environ.get("OPENROUTER_API_KEY", "")
TRIPO_KEY = os.environ.get("TRIPO_API_KEY", "")

STYLE = (
    "The entire vehicle fully in frame with margin around it, three-quarter front-left view "
    "from slightly above, plain uniform light grey seamless background, soft even studio "
    "lighting, no background shadows, photorealistic, sharp high detail."
)
AIRCRAFT_STYLE = "Landing gear retracted, no weapons pylons visible. " + STYLE

# Curated batch: highest gameplay visibility first. Variants reuse a sibling's model
# (rafale_f5 -> rafale_f4, j20s -> j20a, ...) via the manifest, not extra generations.
PLATFORMS = {
    "rafale_f4": "Studio product photograph of a Dassault Rafale twin-engine delta-canard multirole fighter jet in Indian Air Force grey livery with IAF roundels. " + AIRCRAFT_STYLE,
    "su30_mki": "Studio product photograph of a Sukhoi Su-30MKI heavy twin-engine fighter with canards and twin vertical tails, Indian Air Force blue-grey camouflage with IAF roundels. " + AIRCRAFT_STYLE,
    "tejas_mk1a": "Studio product photograph of a HAL Tejas Mk1A light single-engine compound-delta-wing fighter, small and agile, Indian Air Force grey livery with IAF roundels. " + AIRCRAFT_STYLE,
    "mig29_upg": "Studio product photograph of a MiG-29UPG twin-engine fighter with twin vertical tails and widely spaced engine nacelles, Indian Air Force grey camouflage. " + AIRCRAFT_STYLE,
    "mirage2000": "Studio product photograph of a Dassault Mirage 2000 single-engine pure delta-wing fighter with no horizontal tail, Indian Air Force grey livery. " + AIRCRAFT_STYLE,
    "jaguar_darin3": "Studio product photograph of a SEPECAT Jaguar deep-strike attack aircraft, slender fuselage, shoulder-mounted swept wings, twin engines, Indian Air Force green-grey camouflage. " + AIRCRAFT_STYLE,
    "mig21_bison": "Studio product photograph of a MiG-21 Bison delta-wing supersonic interceptor with nose air intake and shock cone, silver-grey Indian Air Force livery. " + AIRCRAFT_STYLE,
    "netra_aewc": "Studio product photograph of a DRDO Netra AEW&C aircraft: an Embraer ERJ-145 regional jet with a long dorsal AESA radar antenna bar on top of the fuselage, Indian Air Force livery. " + AIRCRAFT_STYLE,
    "il78_tanker": "Studio product photograph of an Ilyushin IL-78MKI four-engine aerial refueling tanker aircraft, high T-tail, Indian Air Force grey livery. " + AIRCRAFT_STYLE,
    "ghatak_ucav": "Studio product photograph of the Ghatak stealth flying-wing UCAV drone, tailless blended wing body like a small B-2, dark grey radar-absorbent coating. " + AIRCRAFT_STYLE,
    "mq9b_seaguardian": "Studio product photograph of an MQ-9B SeaGuardian long-endurance drone: slender fuselage, bulbous sensor nose, long straight thin wings, V-tail, rear pusher propeller, white-grey livery. " + AIRCRAFT_STYLE,
    "j20a": "Studio product photograph of a Chengdu J-20 stealth fighter: long chined fuselage, delta wings with canards, twin outward-canted all-moving tails, dark grey PLAAF livery. " + AIRCRAFT_STYLE,
    "j35e": "Studio product photograph of a Shenyang J-35 twin-engine stealth fighter with trapezoidal wings and twin canted tails, similar planform to an F-35 but twin-engine, grey Pakistan Air Force livery. " + AIRCRAFT_STYLE,
    "j10c": "Studio product photograph of a Chengdu J-10C single-engine delta-canard fighter with chin-mounted air intake, PLAAF grey livery. " + AIRCRAFT_STYLE,
    "jf17_blk3": "Studio product photograph of a PAC JF-17 Thunder Block 3 lightweight single-engine multirole fighter, Pakistan Air Force grey livery. " + AIRCRAFT_STYLE,
    "f16_blk52": "Studio product photograph of an F-16 Block 52 single-engine fighter with bubble canopy and single vertical tail, Pakistan Air Force grey livery. " + AIRCRAFT_STYLE,
    "h6kj": "Studio product photograph of a Xian H-6K jet bomber (Tu-16 derivative): cigar-shaped fuselage, swept wings with two large engine nacelles at the wing roots, PLAAF dark grey. " + AIRCRAFT_STYLE,
    # Bonus (run only if credits remain): missiles / AD prove-outs
    "s400_battery": "Studio product photograph of an S-400 Triumf air defence launcher vehicle: 8x8 military truck with four large vertical missile launch tubes erected, olive-green Russian air defence system. " + STYLE,
    "brahmos_ng": "Studio product photograph of a BrahMos-NG supersonic cruise missile: sleek white-and-grey cylindrical missile with pointed nose cone, small cruciform fins at mid-body and tail. " + STYLE,
}

TRIPO_BASE = "https://api.tripo3d.ai/v2/openapi"


def http_json(url, body=None, headers=None, raw=None):
    h = headers or {}
    data = raw
    if body is not None:
        data = json.dumps(body).encode()
        h["Content-Type"] = "application/json"
    req = urllib.request.Request(url, data=data, headers=h)
    with urllib.request.urlopen(req, timeout=180) as r:
        return json.load(r)


def openrouter_image(prompt: str, out_path: str) -> None:
    resp = http_json(
        "https://openrouter.ai/api/v1/chat/completions",
        body={
            "model": "google/gemini-2.5-flash-image",
            "messages": [{"role": "user", "content": prompt}],
            "modalities": ["image", "text"],
        },
        headers={"Authorization": f"Bearer {OPENROUTER_KEY}"},
    )
    images = resp["choices"][0]["message"].get("images") or []
    if not images:
        raise RuntimeError("no image in OpenRouter response")
    b64 = images[0]["image_url"]["url"].split(",", 1)[1]
    with open(out_path, "wb") as f:
        f.write(base64.b64decode(b64))


def tripo(path, body=None, raw=None, headers=None):
    h = {"Authorization": f"Bearer {TRIPO_KEY}"}
    if headers:
        h.update(headers)
    return http_json(TRIPO_BASE + path, body=body, raw=raw, headers=h)


def tripo_balance() -> int:
    return tripo("/user/balance")["data"]["balance"]


def tripo_upload(image_path: str) -> str:
    boundary = uuid.uuid4().hex
    with open(image_path, "rb") as f:
        img = f.read()
    ctype = mimetypes.guess_type(image_path)[0] or "image/png"
    part = (
        f"--{boundary}\r\n"
        f'Content-Disposition: form-data; name="file"; filename="{os.path.basename(image_path)}"\r\n'
        f"Content-Type: {ctype}\r\n\r\n"
    ).encode() + img + f"\r\n--{boundary}--\r\n".encode()
    up = tripo("/upload/sts", raw=part, headers={"Content-Type": f"multipart/form-data; boundary={boundary}"})
    return up["data"]["image_token"]


def tripo_generate(image_token: str, out_glb: str) -> None:
    task = tripo("/task", body={"type": "image_to_model", "file": {"type": "png", "file_token": image_token}})
    tid = task["data"]["task_id"]
    for _ in range(120):
        time.sleep(10)
        d = tripo(f"/task/{tid}")["data"]
        status = d.get("status")
        if status == "success":
            out = d.get("output") or {}
            url = out.get("pbr_model") or out.get("model")
            if not url:
                raise RuntimeError(f"no model url: {json.dumps(d)[:400]}")
            urllib.request.urlretrieve(url, out_glb)
            return
        if status in ("failed", "cancelled", "banned", "expired"):
            raise RuntimeError(f"task {status}: {json.dumps(d)[:400]}")
    raise RuntimeError("task timed out")


def main() -> None:
    if not OPENROUTER_KEY or not TRIPO_KEY:
        sys.exit("set OPENROUTER_API_KEY and TRIPO_API_KEY")
    targets = sys.argv[1:] or list(PLATFORMS)
    results = {}
    for pid in targets:
        prompt = PLATFORMS.get(pid)
        if not prompt:
            print(f"!! unknown platform {pid}, skipping", flush=True)
            continue
        pdir = os.path.join(OUT_ROOT, pid)
        os.makedirs(pdir, exist_ok=True)
        glb = os.path.join(pdir, "original.glb")
        if os.path.exists(glb):
            print(f"== {pid}: original.glb exists, skipping", flush=True)
            results[pid] = "cached"
            continue
        bal = tripo_balance()
        if bal < RESERVE + 30:
            print(f"!! balance {bal} too low (reserve {RESERVE}), stopping", flush=True)
            break
        try:
            concept = os.path.join(pdir, "concept.png")
            if not os.path.exists(concept):
                print(f"-- {pid}: generating concept image...", flush=True)
                openrouter_image(prompt, concept)
            print(f"-- {pid}: uploading + generating 3D (balance {bal})...", flush=True)
            token = tripo_upload(concept)
            tripo_generate(token, glb)
            print(f"OK {pid}: {os.path.getsize(glb) // 1024} KB", flush=True)
            results[pid] = "ok"
        except Exception as e:  # keep batch moving; failed ones retried by re-run
            print(f"XX {pid}: {str(e)[:300]}", flush=True)
            results[pid] = f"failed: {str(e)[:120]}"
    print("\n=== batch summary ===", flush=True)
    for pid, r in results.items():
        print(f"  {pid:20} {r}", flush=True)
    try:
        print("balance remaining:", tripo_balance(), flush=True)
    except Exception:
        pass


if __name__ == "__main__":
    main()
