#!/bin/bash
# Optimize raw Tripo GLBs into shippable hero models (3D roadmap Phase C pipeline).
# For each assets3d/<id>/original.glb produce assets3d/<id>/hero.glb
# (Draco mesh compression + WebP textures; observed ~7 MB -> ~550 KB).
set -e
cd "$(dirname "$0")/.."
for dir in assets3d/*/; do
    id=$(basename "$dir")
    src="$dir/original.glb"
    out="$dir/hero.glb"
    [ -f "$src" ] || continue
    if [ -f "$out" ] && [ "$out" -nt "$src" ]; then
        echo "== $id: hero.glb up to date"
        continue
    fi
    echo "-- $id: optimizing..."
    npx -y @gltf-transform/cli optimize "$src" "$out" --texture-compress webp --compress draco >/dev/null
    echo "OK $id: $(du -k "$out" | cut -f1) KB"
done
