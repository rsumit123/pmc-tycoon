import { create } from "zustand";
import type {
  Campaign, CampaignCreatePayload, BaseMarker, Platform,
} from "../lib/types";
import { api } from "../lib/api";

interface CampaignState {
  campaign: Campaign | null;
  bases: BaseMarker[];
  platformsById: Record<string, Platform>;
  loading: boolean;
  error: string | null;

  createCampaign: (payload: CampaignCreatePayload) => Promise<void>;
  loadCampaign: (id: number) => Promise<void>;
  advanceTurn: () => Promise<void>;
  loadBases: (id: number) => Promise<void>;
  loadPlatforms: () => Promise<void>;
  reset: () => void;
}

export const useCampaignStore = create<CampaignState>((set, get) => ({
  campaign: null,
  bases: [],
  platformsById: {},
  loading: false,
  error: null,

  createCampaign: async (payload) => {
    set({ loading: true, error: null });
    try {
      const campaign = await api.createCampaign(payload);
      set({ campaign, loading: false });
    } catch (e) {
      set({ error: (e as Error).message, loading: false });
    }
  },

  loadCampaign: async (id) => {
    set({ loading: true, error: null });
    try {
      const campaign = await api.getCampaign(id);
      set({ campaign, loading: false });
    } catch (e) {
      set({ error: (e as Error).message, loading: false });
    }
  },

  advanceTurn: async () => {
    const current = get().campaign;
    if (!current) return;
    set({ loading: true, error: null });
    try {
      const campaign = await api.advanceTurn(current.id);
      set({ campaign, loading: false });
      void get().loadBases(campaign.id);
    } catch (e) {
      set({ error: (e as Error).message, loading: false });
    }
  },

  loadBases: async (id) => {
    try {
      const { bases } = await api.getBases(id);
      set({ bases });
    } catch (e) {
      set({ error: (e as Error).message });
    }
  },

  loadPlatforms: async () => {
    if (Object.keys(get().platformsById).length > 0) return;
    try {
      const { platforms } = await api.getPlatforms();
      const byId = Object.fromEntries(platforms.map((p) => [p.id, p]));
      set({ platformsById: byId });
    } catch (e) {
      set({ error: (e as Error).message });
    }
  },

  reset: () => set({
    campaign: null, bases: [], platformsById: {},
    loading: false, error: null,
  }),
}));
