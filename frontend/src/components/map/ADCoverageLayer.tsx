import type { Map as MLMap } from "maplibre-gl";
import type { BaseMarker } from "../../lib/types";

export interface ADCoverageLayerProps {
  map: MLMap | null;
  bases: BaseMarker[];
  projectionVersion: number;
}

const AD_RADIUS_KM_PER_SQUADRON = 40;

function kmToPixels(map: MLMap, centerLngLat: [number, number], km: number): number {
  const [lng, lat] = centerLngLat;
  const offset = lat + km / 110.574;
  const a = map.project([lng, lat]);
  const b = map.project([lng, offset]);
  return Math.max(4, Math.abs(b.y - a.y));
}

export function ADCoverageLayer({ map, bases, projectionVersion }: ADCoverageLayerProps) {
  void projectionVersion;
  if (!map) return null;
  return (
    <svg className="pointer-events-none absolute inset-0 w-full h-full">
      {bases.map((b) => {
        if (!b.squadrons.length) return null;
        const p = map.project([b.lon, b.lat]);
        const r = kmToPixels(map, [b.lon, b.lat],
          b.squadrons.length * AD_RADIUS_KM_PER_SQUADRON);
        return (
          <circle
            key={b.id}
            cx={p.x} cy={p.y} r={r}
            fill="rgba(251, 191, 36, 0.08)"
            stroke="rgba(251, 191, 36, 0.45)"
            strokeWidth={1}
          />
        );
      })}
    </svg>
  );
}
