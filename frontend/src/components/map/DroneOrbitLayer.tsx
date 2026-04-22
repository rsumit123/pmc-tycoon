import type { Map as MLMap } from "maplibre-gl";
import type { BaseMarker, HangarSquadron } from "../../lib/types";

// Mirrors backend ISR_ORBIT_RADIUS_KM_BY_PLATFORM (awacs_coverage.py).
const ORBIT_RADIUS_KM: Record<string, number> = {
  tapas_uav: 300,
  ghatak_ucav: 500,
  heron_tp: 1000,
  mq9b_seaguardian: 1800,
};

export interface DroneOrbitLayerProps {
  map: MLMap | null;
  squadrons: HangarSquadron[];
  bases: BaseMarker[];
  projectionVersion: number;
}

function kmToPixels(map: MLMap, centerLngLat: [number, number], km: number): number {
  const [lng, lat] = centerLngLat;
  const offset = lat + km / 110.574;
  const a = map.project([lng, lat]);
  const b = map.project([lng, offset]);
  return Math.max(4, Math.abs(b.y - a.y));
}

export function DroneOrbitLayer({ map, squadrons, bases, projectionVersion }: DroneOrbitLayerProps) {
  void projectionVersion;
  if (!map) return null;

  const baseById = new Map(bases.map((b) => [b.id, b]));
  const drones = squadrons.filter(
    (s) => s.platform_id in ORBIT_RADIUS_KM && s.strength > 0 && s.readiness_pct > 0,
  );

  return (
    <svg className="absolute inset-0 w-full h-full pointer-events-none">
      {drones.map((sq) => {
        const base = baseById.get(sq.base_id);
        if (!base) return null;
        const p = map.project([base.lon, base.lat]);
        const r = kmToPixels(map, [base.lon, base.lat], ORBIT_RADIUS_KM[sq.platform_id]);
        return (
          <circle
            key={sq.id}
            cx={p.x} cy={p.y} r={r}
            fill="rgba(6, 182, 212, 0.04)"
            stroke="rgba(34, 211, 238, 0.5)"
            strokeWidth={1}
            strokeDasharray="4 4"
          />
        );
      })}
    </svg>
  );
}
