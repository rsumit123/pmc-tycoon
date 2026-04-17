import { create } from "zustand";

export type MapLayerKey = "ad_coverage" | "intel_contacts";

interface MapState {
  selectedBaseId: number | null;
  activeLayers: Record<MapLayerKey, boolean>;
  setSelectedBase: (id: number | null) => void;
  toggleLayer: (key: MapLayerKey) => void;
}

export const useMapStore = create<MapState>((set) => ({
  selectedBaseId: null,
  activeLayers: { ad_coverage: false, intel_contacts: false },
  setSelectedBase: (id) => set({ selectedBaseId: id }),
  toggleLayer: (key) => set((s) => ({
    activeLayers: { ...s.activeLayers, [key]: !s.activeLayers[key] },
  })),
}));
