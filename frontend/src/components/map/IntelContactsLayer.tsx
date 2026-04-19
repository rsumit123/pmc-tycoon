import { useState } from "react";
import type { Map as MLMap } from "maplibre-gl";

export interface IntelContact {
  id: string;
  lng: number;
  lat: number;
  confidence: number;
  source_type: string;
  headline?: string;
  faction?: string;
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
  const [selected, setSelected] = useState<IntelContact | null>(null);

  if (!map) return null;

  return (
    <>
      <svg className="absolute inset-0 w-full h-full pointer-events-none">
        {contacts.map((c) => {
          const p = map.project([c.lng, c.lat]);
          const color = SOURCE_COLOR[c.source_type] ?? "#94a3b8";
          return (
            <g key={c.id} opacity={0.5 + c.confidence * 0.5}>
              <circle cx={p.x} cy={p.y} r={4} fill={color} className="pointer-events-auto cursor-pointer"
                      onClick={() => setSelected(c)} />
              <circle cx={p.x} cy={p.y} r={10 + (1 - c.confidence) * 6}
                      fill="none" stroke={color} strokeWidth={0.8} />
            </g>
          );
        })}
      </svg>
      {selected && (
        <div
          className="absolute top-3 right-3 z-20 max-w-[min(90vw,320px)] bg-slate-900/95 border border-slate-700 rounded-lg p-3 shadow-lg"
          onClick={(e) => e.stopPropagation()}
        >
          <div className="flex items-start justify-between gap-2 mb-1">
            <div className="flex items-center gap-1.5">
              <span
                className="text-[10px] uppercase font-bold px-1.5 py-0.5 rounded"
                style={{ backgroundColor: SOURCE_COLOR[selected.source_type] ?? "#94a3b8", color: "#0f172a" }}
              >{selected.source_type}</span>
              {selected.faction && (
                <span className="text-[10px] opacity-70">{selected.faction}</span>
              )}
            </div>
            <button
              onClick={() => setSelected(null)}
              aria-label="close"
              className="text-slate-400 hover:text-slate-200 text-sm leading-none"
            >✕</button>
          </div>
          {selected.headline && (
            <p className="text-xs text-slate-200 mb-1">{selected.headline}</p>
          )}
          <p className="text-[10px] opacity-70">
            Confidence: {Math.round(selected.confidence * 100)}%
          </p>
          <p className="text-[10px] opacity-50 italic mt-1">
            Estimated position (intel fog — ±{Math.round((1 - selected.confidence) * 200)}km uncertainty)
          </p>
        </div>
      )}
    </>
  );
}
