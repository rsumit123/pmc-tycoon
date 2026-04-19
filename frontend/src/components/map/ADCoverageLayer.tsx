import { useState } from "react";
import type { Map as MLMap } from "maplibre-gl";
import type { BaseMarker, ADBattery } from "../../lib/types";

export interface ADCoverageLayerProps {
  map: MLMap | null;
  bases: BaseMarker[];
  batteries: ADBattery[];
  projectionVersion: number;
}

function kmToPixels(map: MLMap, centerLngLat: [number, number], km: number): number {
  const [lng, lat] = centerLngLat;
  const offset = lat + km / 110.574;
  const a = map.project([lng, lat]);
  const b = map.project([lng, offset]);
  return Math.max(4, Math.abs(b.y - a.y));
}

interface Selection { battery: ADBattery; base: BaseMarker; }

export function ADCoverageLayer({ map, bases, batteries, projectionVersion }: ADCoverageLayerProps) {
  void projectionVersion;
  const [sel, setSel] = useState<Selection | null>(null);

  if (!map) return null;

  const baseById = new Map(bases.map((b) => [b.id, b]));

  return (
    <>
      <svg className="absolute inset-0 w-full h-full pointer-events-none">
        {batteries.map((bat) => {
          const base = baseById.get(bat.base_id);
          if (!base) return null;
          const p = map.project([base.lon, base.lat]);
          const r = kmToPixels(map, [base.lon, base.lat], bat.coverage_km);
          return (
            <g key={bat.id}>
              <circle
                cx={p.x} cy={p.y} r={r}
                fill="rgba(251, 191, 36, 0.08)"
                stroke="rgba(251, 191, 36, 0.45)"
                strokeWidth={1}
              />
              <circle
                cx={p.x} cy={p.y} r={Math.max(8, Math.min(14, r * 0.15))}
                fill="rgba(251, 191, 36, 0.25)"
                stroke="rgba(251, 191, 36, 0.8)"
                strokeWidth={1.5}
                className="pointer-events-auto cursor-pointer"
                onClick={() => setSel({ battery: bat, base })}
              />
            </g>
          );
        })}
      </svg>

      {batteries.length === 0 && (
        <div className="absolute top-3 right-3 z-10 bg-slate-900/80 border border-slate-700 rounded-lg p-2 text-[10px] max-w-xs opacity-80">
          No AD batteries installed. Install one from Armory → AD tab after completing AD R&D (Akash-NG / QRSAM / VSHORADS / Long-Range SAM).
        </div>
      )}

      {sel && (
        <div
          className="absolute top-3 right-3 z-20 max-w-[min(90vw,320px)] bg-slate-900/95 border border-amber-700 rounded-lg p-3 shadow-lg"
          onClick={(e) => e.stopPropagation()}
        >
          <div className="flex items-start justify-between gap-2 mb-1">
            <div className="text-sm font-bold text-amber-300 uppercase tracking-wide">
              {sel.battery.system_id.replace(/_/g, " ")}
            </div>
            <button
              onClick={() => setSel(null)}
              aria-label="close"
              className="text-slate-400 hover:text-slate-200 text-sm leading-none"
            >✕</button>
          </div>
          <div className="text-xs space-y-1 opacity-90">
            <p>📍 Base: <span className="font-semibold">{sel.base.name}</span></p>
            <p>Coverage: <span className="font-mono">{sel.battery.coverage_km} km</span></p>
            <p className="opacity-70">
              Installed {sel.battery.installed_year} Q{sel.battery.installed_quarter}
            </p>
            <p className="text-[10px] opacity-60 italic mt-1">
              Engages adversary aircraft that enter the coverage bubble before BVR combat begins.
            </p>
          </div>
        </div>
      )}
    </>
  );
}
