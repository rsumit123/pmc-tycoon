import { useState } from "react";
import type { BaseMarker, Platform } from "../../lib/types";
import { SquadronCard } from "../primitives/SquadronCard";
import { PlatformDossier } from "../primitives/PlatformDossier";

export interface BaseSheetProps {
  base: BaseMarker | null;
  platforms: Record<string, Platform>;
  onClose: () => void;
}

export function BaseSheet({ base, platforms, onClose }: BaseSheetProps) {
  const [dossierFor, setDossierFor] = useState<Platform | null>(null);
  if (!base) return null;

  return (
    <>
      <div
        role="dialog"
        aria-label={`${base.name} squadron stack`}
        className="fixed inset-x-0 bottom-0 z-40 bg-slate-900 border-t border-slate-800 rounded-t-2xl p-4 max-h-[60vh] overflow-y-auto"
      >
        <div className="flex items-baseline justify-between pb-3">
          <div>
            <h3 className="text-lg font-bold">{base.name}</h3>
            <p className="text-xs opacity-60">
              {base.lat.toFixed(2)}°N, {base.lon.toFixed(2)}°E
              • {base.squadrons.length} squadron(s)
            </p>
          </div>
          <button
            onClick={onClose}
            aria-label="close base sheet"
            className="w-8 h-8 rounded-full bg-slate-800 hover:bg-slate-700 text-slate-200"
          >
            ×
          </button>
        </div>

        {base.squadrons.length === 0 ? (
          <p className="text-sm opacity-60 p-4">No squadrons stationed.</p>
        ) : (
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
            {base.squadrons.map((sq) => (
              <SquadronCard
                key={sq.id}
                squadron={sq}
                platform={platforms[sq.platform_id]}
                onLongPress={() => {
                  const p = platforms[sq.platform_id];
                  if (p) setDossierFor(p);
                }}
              />
            ))}
          </div>
        )}
      </div>

      {dossierFor && (
        <PlatformDossier
          platform={dossierFor}
          open={!!dossierFor}
          onClose={() => setDossierFor(null)}
        />
      )}
    </>
  );
}
