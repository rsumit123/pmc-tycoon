#!/bin/bash
# Build decimated "mini" GLBs for the Living Airbase map layer (IAF platforms only)
# from the raw Tripo originals in assets3d/. Output: frontend/public/models3d/<id>.glb
set -e
cd "$(dirname "$0")/.."
IAF="amca_mk1 rafale_f4 su30_mki tejas_mk1a mig29_upg mirage2000 jaguar_darin3 mig21_bison netra_aewc il78_tanker ghatak_ucav mq9b_seaguardian"
for id in $IAF; do
    src="assets3d/$id/original.glb"
    out="frontend/public/models3d/$id.glb"
    [ -f "$src" ] || { echo "!! missing $src"; continue; }
    if [ -f "$out" ] && [ "$out" -nt "$src" ]; then echo "== $id up to date"; continue; fi
    npx -y @gltf-transform/cli optimize "$src" "$out" \
        --texture-compress webp --texture-size 256 --compress draco --simplify-error 0.001 >/dev/null
    echo "OK $id: $(du -k "$out" | cut -f1) KB"
done
