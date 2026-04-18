import { create } from "zustand";

export type MapLayerKey = "ad_coverage" | "intel_contacts";

const STORAGE_KEY = "sovereign-shield-map-layers";

function loadLayers(): Record<MapLayerKey, boolean> {
  try {
    const stored = localStorage.getItem(STORAGE_KEY);
    if (stored) return JSON.parse(stored);
  } catch { /* ignore */ }
  return { ad_coverage: false, intel_contacts: false };
}

interface MapState {
  selectedBaseId: number | null;
  activeLayers: Record<MapLayerKey, boolean>;
  setSelectedBase: (id: number | null) => void;
  toggleLayer: (key: MapLayerKey) => void;
}

export const useMapStore = create<MapState>((set) => ({
  selectedBaseId: null,
  activeLayers: loadLayers(),
  setSelectedBase: (id) => set({ selectedBaseId: id }),
  toggleLayer: (key) => set((s) => {
    const next = { ...s.activeLayers, [key]: !s.activeLayers[key] };
    try { localStorage.setItem(STORAGE_KEY, JSON.stringify(next)); } catch { /* ignore */ }
    return { activeLayers: next };
  }),
}));
