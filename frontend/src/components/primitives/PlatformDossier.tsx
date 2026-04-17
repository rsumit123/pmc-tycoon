import { useState } from "react";
import type { Platform } from "../../lib/types";
import { RadarChart } from "./RadarChart";
import { PlatformSilhouette } from "./PlatformSilhouette";

export interface PlatformDossierProps {
  platform: Platform;
  open: boolean;
  onClose: () => void;
}

const RCS_ORDER: Record<string, number> = {
  VLO: 1.0, LO: 0.8, reduced: 0.55, conventional: 0.3, large: 0.1,
};

function statAxes(p: Platform) {
  return [
    { label: "Radius",  value: Math.min(1, p.combat_radius_km / 2500) },
    { label: "Payload", value: Math.min(1, p.payload_kg / 12000) },
    { label: "Radar",   value: Math.min(1, p.radar_range_km / 300) },
    { label: "Cost",    value: Math.max(0, 1 - p.cost_cr / 8000) },
    { label: "Era",     value: Math.min(1, Math.max(0, (p.intro_year - 2000) / 40)) },
    { label: "Stealth", value: RCS_ORDER[p.rcs_band] ?? 0.3 },
  ];
}

export function PlatformDossier({ platform, open, onClose }: PlatformDossierProps) {
  const [imgBroken, setImgBroken] = useState(false);
  if (!open) return null;

  return (
    <div
      role="dialog"
      aria-label={`${platform.name} dossier`}
      className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-950/80"
      onClick={onClose}
    >
      <div
        className="relative w-full max-w-lg rounded-2xl bg-slate-900 border border-slate-800 p-6 space-y-4"
        onClick={(e) => e.stopPropagation()}
      >
        <button
          onClick={onClose}
          aria-label="close dossier"
          className="absolute top-3 right-3 w-8 h-8 rounded-full bg-slate-800 hover:bg-slate-700 text-slate-200"
        >
          ×
        </button>

        <div className="flex items-center gap-4">
          {imgBroken ? (
            <PlatformSilhouette />
          ) : (
            <img
              src={`/platforms/${platform.id}/hero.jpg`}
              alt={platform.name}
              onError={() => setImgBroken(true)}
              className="w-40 h-24 object-cover rounded-lg bg-slate-800"
            />
          )}
          <div>
            <h2 className="text-xl font-bold">{platform.name}</h2>
            <p className="text-xs opacity-70">
              {platform.origin} • {platform.role} • gen {platform.generation}
            </p>
          </div>
        </div>

        <div className="flex justify-center">
          <RadarChart axes={statAxes(platform)} size={260} />
        </div>

        <dl className="grid grid-cols-2 gap-2 text-xs">
          <div><dt className="opacity-60">Combat radius</dt>
               <dd>{platform.combat_radius_km.toLocaleString()} km</dd></div>
          <div><dt className="opacity-60">Payload</dt>
               <dd>{platform.payload_kg.toLocaleString()} kg</dd></div>
          <div><dt className="opacity-60">Radar range</dt>
               <dd>{platform.radar_range_km} km</dd></div>
          <div><dt className="opacity-60">RCS band</dt>
               <dd>{platform.rcs_band}</dd></div>
          <div><dt className="opacity-60">Unit cost</dt>
               <dd>₹{platform.cost_cr.toLocaleString()} cr</dd></div>
          <div><dt className="opacity-60">Introduced</dt>
               <dd>{platform.intro_year}</dd></div>
        </dl>
      </div>
    </div>
  );
}
