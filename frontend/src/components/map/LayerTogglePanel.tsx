import { useMapStore, type MapLayerKey } from "../../store/mapStore";

const LABELS: Record<MapLayerKey, string> = {
  ad_coverage: "AD coverage",
  intel_contacts: "Intel contacts",
  drone_orbits: "Drone orbits",
  adversary_bases: "Adversary bases",
};

export function LayerTogglePanel() {
  const active = useMapStore((s) => s.activeLayers);
  const toggle = useMapStore((s) => s.toggleLayer);
  const terrain3d = useMapStore((s) => s.terrain3d);
  const toggleTerrain3d = useMapStore((s) => s.toggleTerrain3d);

  return (
    <div className="absolute top-3 right-3 bg-slate-900/85 backdrop-blur rounded-lg border border-slate-800 p-2 space-y-1 z-10">
      <button
        onClick={toggleTerrain3d}
        className={[
          "flex items-center w-full text-left text-xs px-2 py-2.5 min-h-[40px] rounded border-b border-slate-800 mb-1",
          terrain3d ? "bg-cyan-700 text-slate-50 font-semibold" : "text-slate-300 hover:bg-slate-800",
        ].join(" ")}
      >
        {terrain3d ? "◆" : "◇"} 3D terrain
      </button>
      {(Object.keys(active) as MapLayerKey[]).map((k) => (
        <button
          key={k}
          onClick={() => toggle(k)}
          className={[
            "flex items-center w-full text-left text-xs px-2 py-2.5 min-h-[40px] rounded",
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
