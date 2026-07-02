import { useEffect } from "react";
import type { CustomLayerInterface, CustomRenderMethodInput, Map as MLMap } from "maplibre-gl";
import type { ADBattery, BaseMarker } from "../../lib/types";
import { buildDomeSpecs } from "./adDomeSpecs";

export interface ADDomeLayerProps {
  map: MLMap | null;
  bases: BaseMarker[];
  batteries: ADBattery[];
}

const LAYER_ID = "ad-domes-3d";

/** Translucent 3D hemispheres over AD-covered bases (terrain3d mode only).
 * Uses MapLibre's custom-layer bridge to three.js; falls back silently if
 * three fails to load or WebGL misbehaves. */
export function ADDomeLayer({ map, bases, batteries }: ADDomeLayerProps) {
  useEffect(() => {
    if (!map) return;
    let cancelled = false;
    let layer: CustomLayerInterface | null = null;

    (async () => {
      const THREE = await import("three");
      if (cancelled || !map.getCanvas()) return;
      const specs = buildDomeSpecs(bases, batteries);
      if (specs.length === 0) return;

      const camera = new THREE.Camera();
      const scene = new THREE.Scene();
      const geo = new THREE.SphereGeometry(1, 24, 12, 0, Math.PI * 2, 0, Math.PI / 2);
      const fill = new THREE.MeshBasicMaterial({
        color: 0x38bdf8, transparent: true, opacity: 0.09, side: THREE.DoubleSide,
        depthWrite: false,
      });
      const rim = new THREE.MeshBasicMaterial({
        color: 0x38bdf8, transparent: true, opacity: 0.22, wireframe: true, depthWrite: false,
      });
      for (const s of specs) {
        for (const mat of [fill, rim]) {
          const mesh = new THREE.Mesh(geo, mat);
          mesh.matrixAutoUpdate = false;
          // Mercator: x east, y south, z up(scaled). Rotate hemisphere so its
          // flat face sits on the ground plane (three's Y-up -> mercator Z-up).
          const rot = new THREE.Matrix4().makeRotationX(Math.PI / 2);
          mesh.matrix = new THREE.Matrix4()
            .makeTranslation(s.x, s.y, 0)
            .multiply(new THREE.Matrix4().makeScale(s.scale, s.scale, s.scale))
            .multiply(rot);
          scene.add(mesh);
        }
      }

      let renderer: import("three").WebGLRenderer | null = null;
      layer = {
        id: LAYER_ID,
        type: "custom",
        renderingMode: "3d",
        onAdd(m, gl) {
          renderer = new THREE.WebGLRenderer({
            canvas: m.getCanvas(), context: gl, antialias: true,
          });
          renderer.autoClear = false;
        },
        onRemove() {
          renderer?.dispose();
          renderer = null;
        },
        render(_gl, options: CustomRenderMethodInput) {
          if (!renderer) return;
          // maplibre-gl v5's CustomRenderMethodInput exposes a ready-made
          // world-space -> clip-space matrix as `modelViewProjectionMatrix`
          // (v4 passed a raw matrix array as a second positional arg instead).
          camera.projectionMatrix = new THREE.Matrix4().fromArray(
            options.modelViewProjectionMatrix as unknown as number[],
          );
          renderer.resetState();
          renderer.render(scene, camera);
          // No triggerRepaint(): the domes are static, so rendering only on the
          // map's own repaints avoids a continuous 60fps loop (mobile battery).
        },
      };
      try {
        if (!map.getLayer(LAYER_ID)) map.addLayer(layer);
      } catch { /* custom layer unsupported — SVG fallback still available */ }
    })();

    return () => {
      cancelled = true;
      try {
        if (map.getLayer(LAYER_ID)) map.removeLayer(LAYER_ID);
      } catch { /* map already torn down */ }
    };
  }, [map, bases, batteries]);

  return null;
}
