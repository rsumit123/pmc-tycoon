import type { Map as MLMap } from "maplibre-gl";
import type { AdversaryBase } from "../../lib/types";

export interface AdversaryBaseLayerProps {
  map: MLMap | null;
  bases: AdversaryBase[];
  onSelect: (base: AdversaryBase) => void;
  projectionVersion: number;
  /** When true, renders only bases currently covered by a friendly drone. */
  filterCovered?: boolean;
}

const FACTION_COLOR: Record<string, string> = {
  PAF: "#dc2626",    // red-600
  PLAAF: "#ea580c",  // orange-600
  PLAN: "#d97706",   // amber-600
};

export function AdversaryBaseLayer({
  map, bases, onSelect, projectionVersion, filterCovered = true,
}: AdversaryBaseLayerProps) {
  void projectionVersion;
  if (!map) return null;
  const visible = filterCovered ? bases.filter((b) => b.is_covered) : bases;

  return (
    <svg className="absolute inset-0 w-full h-full pointer-events-none">
      {visible.map((b) => {
        const p = map.project([b.lon, b.lat]);
        const color = FACTION_COLOR[b.faction] ?? "#dc2626";
        return (
          <g
            key={b.id}
            transform={`translate(${p.x}, ${p.y})`}
            className="pointer-events-auto cursor-pointer"
            onClick={() => onSelect(b)}
            aria-label={b.name}
          >
            <circle r={14} fill="transparent" />
            <circle r={6} fill={color} fillOpacity={0.85} stroke="#1e293b" strokeWidth={1} />
            <circle r={10} fill="none" stroke={color} strokeOpacity={0.5} strokeWidth={1} strokeDasharray="2 2" />
          </g>
        );
      })}
    </svg>
  );
}
