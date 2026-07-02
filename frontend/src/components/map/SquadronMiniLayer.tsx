import { useEffect } from "react";
import type { CustomLayerInterface, CustomRenderMethodInput, Map as MLMap } from "maplibre-gl";
import type { BaseMarker } from "../../lib/types";
import { miniModelFor } from "../../lib/models3d";
import { apronSlots, type ApronSlot } from "./apronLayout";
import { mercatorX, mercatorY, metersToMercator } from "./domeGeometry";

export interface SquadronMiniLayerProps {
  map: MLMap | null;
  bases: BaseMarker[];
}

const LAYER_ID = "squadron-minis-3d";
const MIN_ZOOM = 7.5;

interface CachedModel {
  scene: import("three").Group;
  maxDim: number;
}

// Decoded model cache: one GLTF scene per platform id for the whole session.
// Module scope so it survives effect re-runs (bases changing shouldn't force
// a re-decode of models already loaded).
let modelCache: Map<string, Promise<CachedModel>> | null = null;

function loadModel(
  THREE: typeof import("three"),
  loader: import("three/examples/jsm/loaders/GLTFLoader.js").GLTFLoader,
  id: string,
): Promise<CachedModel> {
  if (!modelCache) modelCache = new Map();
  let entry = modelCache.get(id);
  if (!entry) {
    entry = loader.loadAsync(`/models3d/${id}.glb`).then((gltf) => {
      const scene = gltf.scene;
      const box = new THREE.Box3().setFromObject(scene);
      const size = new THREE.Vector3();
      box.getSize(size);
      const maxDim = Math.max(size.x, size.y, size.z, 0.001);
      return { scene, maxDim };
    });
    modelCache.set(id, entry);
  }
  return entry;
}

/** Zoom-gated 3D squadron miniatures parked around friendly bases (terrain3d mode only).
 * Mirrors ADDomeLayer's three.js/MapLibre custom-layer bridge. */
export function SquadronMiniLayer({ map, bases }: SquadronMiniLayerProps) {
  useEffect(() => {
    if (!map) return;
    let cancelled = false;
    let layer: CustomLayerInterface | null = null;
    let idleHandler: (() => void) | null = null;

    (async () => {
      const THREE = await import("three");
      const { GLTFLoader } = await import("three/examples/jsm/loaders/GLTFLoader.js");
      const { DRACOLoader } = await import("three/examples/jsm/loaders/DRACOLoader.js");
      if (cancelled || !map.getCanvas()) return;

      const draco = new DRACOLoader();
      draco.setDecoderPath("/draco/");
      const loader = new GLTFLoader();
      loader.setDRACOLoader(draco);

      // Per-base arc of distinct minis. miniModelFor() runs first so variants
      // of the same airframe (e.g. tejas_mk1 / tejas_mk1a) collapse to one
      // parked mini before apronSlots() dedupes.
      const slotsByBase = bases.map((base) => {
        const modelIds = base.squadrons
          .map((s) => miniModelFor(s.platform_id))
          .filter((x): x is string => !!x);
        return apronSlots(base.lon, base.lat, modelIds);
      });
      const allSlots: ApronSlot[] = slotsByBase.flat();
      if (allSlots.length === 0) return;

      const camera = new THREE.Camera();
      const scene = new THREE.Scene();
      scene.add(new THREE.AmbientLight(0xffffff, 2.2));
      const sun = new THREE.DirectionalLight(0xfde8c0, 2.0);
      sun.position.set(0.5, -1, 1);
      scene.add(sun);

      let renderer: import("three").WebGLRenderer | null = null;
      let built = false;

      const buildMeshes = async () => {
        if (cancelled) return;
        const needed = [...new Set(allSlots.map((s) => s.platformId))];
        const models = await Promise.all(needed.map((id) => loadModel(THREE, loader, id)));
        if (cancelled) return;
        const modelById = new Map(needed.map((id, i) => [id, models[i]]));

        for (const slot of allSlots) {
          const cached = modelById.get(slot.platformId);
          if (!cached) continue;
          const elev = map.queryTerrainElevation?.([slot.lon, slot.lat]) ?? 0;
          const clone = cached.scene.clone(true);
          const box = new THREE.Box3().setFromObject(clone);
          const center = new THREE.Vector3();
          box.getCenter(center);
          clone.position.sub(center);

          const wrapper = new THREE.Group();
          wrapper.add(clone);
          wrapper.matrixAutoUpdate = false;

          const scaleFactor = (slot.spanM * metersToMercator(slot.lat)) / cached.maxDim;
          const liftM = slot.spanM * 0.06;
          const translate = new THREE.Matrix4().makeTranslation(
            mercatorX(slot.lon),
            mercatorY(slot.lat),
            (elev + liftM) * metersToMercator(slot.lat),
          );
          const scale = new THREE.Matrix4().makeScale(scaleFactor, scaleFactor, scaleFactor);
          const rotZ = new THREE.Matrix4().makeRotationZ((-slot.yawDeg * Math.PI) / 180);
          const rotX = new THREE.Matrix4().makeRotationX(Math.PI / 2);
          wrapper.matrix = translate.multiply(scale).multiply(rotZ).multiply(rotX);
          scene.add(wrapper);
        }
        built = true;
        map.triggerRepaint();
      };

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
          if (!renderer || !built) return;
          if (map.getZoom() < MIN_ZOOM) return;
          // maplibre-gl v5: defaultProjectionData.mainMatrix is the matrix that
          // actually maps mercator-world space to clip space for custom layers
          // (modelViewProjectionMatrix type-checks but renders nothing).
          camera.projectionMatrix = new THREE.Matrix4().fromArray(
            options.defaultProjectionData.mainMatrix as unknown as number[],
          );
          renderer.resetState();
          renderer.render(scene, camera);
        },
      };
      try {
        if (!map.getLayer(LAYER_ID)) map.addLayer(layer);
      } catch { /* custom layer unsupported */ }

      idleHandler = () => { buildMeshes(); };
      map.once("idle", idleHandler);
    })();

    return () => {
      cancelled = true;
      if (idleHandler) {
        try { map.off("idle", idleHandler); } catch { /* map already torn down */ }
        idleHandler = null;
      }
      try {
        if (map.getLayer(LAYER_ID)) map.removeLayer(LAYER_ID);
      } catch { /* map already torn down */ }
      layer = null;
    };
  }, [map, bases]);

  return null;
}
