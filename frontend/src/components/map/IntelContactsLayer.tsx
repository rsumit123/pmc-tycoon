import type { Map as MLMap } from "maplibre-gl";

export interface IntelContact {
  id: string;
  lng: number;
  lat: number;
  confidence: number;
  source_type: string;
}

export interface IntelContactsLayerProps {
  map: MLMap | null;
  contacts: IntelContact[];
  projectionVersion: number;
}

const SOURCE_COLOR: Record<string, string> = {
  HUMINT: "#a78bfa",
  SIGINT: "#34d399",
  IMINT:  "#60a5fa",
  OSINT:  "#fbbf24",
  ELINT:  "#f472b6",
};

export function IntelContactsLayer({ map, contacts, projectionVersion }: IntelContactsLayerProps) {
  void projectionVersion;
  if (!map) return null;
  return (
    <svg className="pointer-events-none absolute inset-0 w-full h-full">
      {contacts.map((c) => {
        const p = map.project([c.lng, c.lat]);
        const color = SOURCE_COLOR[c.source_type] ?? "#94a3b8";
        return (
          <g key={c.id} opacity={0.5 + c.confidence * 0.5}>
            <circle cx={p.x} cy={p.y} r={4} fill={color} />
            <circle cx={p.x} cy={p.y} r={10 + (1 - c.confidence) * 6}
                    fill="none" stroke={color} strokeWidth={0.8} />
          </g>
        );
      })}
    </svg>
  );
}
