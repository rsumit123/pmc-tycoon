import { useMapStore, type MapLayerKey } from "../../store/mapStore";

const LABELS: Record<MapLayerKey, string> = {
  ad_coverage: "AD coverage",
  intel_contacts: "Intel contacts",
};

export function LayerTogglePanel() {
  const active = useMapStore((s) => s.activeLayers);
  const toggle = useMapStore((s) => s.toggleLayer);

  return (
    <div className="absolute top-3 right-3 bg-slate-900/85 backdrop-blur rounded-lg border border-slate-800 p-2 space-y-1 z-10">
      {(Object.keys(active) as MapLayerKey[]).map((k) => (
        <button
          key={k}
          onClick={() => toggle(k)}
          className={[
            "block w-full text-left text-xs px-2 py-1 rounded",
            active[k] ? "bg-amber-600 text-slate-900 font-semibold"
                      : "text-slate-300 hover:bg-slate-800",
          ].join(" ")}
        >
          {active[k] ? "●" : "○"} {LABELS[k]}
        </button>
      ))}
    </div>
  );
}
