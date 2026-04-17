import { create } from "zustand";
import type {
  Campaign, CampaignCreatePayload, BaseMarker, Platform,
  RDProgramSpec, RDProgramState, AcquisitionOrder,
  BudgetAllocation, RDFundingLevel, RDUpdatePayload, AcquisitionCreatePayload,
} from "../lib/types";
import { api } from "../lib/api";

interface CampaignState {
  campaign: Campaign | null;
  bases: BaseMarker[];
  platformsById: Record<string, Platform>;
  rdCatalog: RDProgramSpec[];
  rdActive: RDProgramState[];
  acquisitions: AcquisitionOrder[];
  loading: boolean;
  error: string | null;

  createCampaign: (payload: CampaignCreatePayload) => Promise<void>;
  loadCampaign: (id: number) => Promise<void>;
  advanceTurn: () => Promise<void>;
  loadBases: (id: number) => Promise<void>;
  loadPlatforms: () => Promise<void>;
  loadRdCatalog: () => Promise<void>;
  loadRdActive: (id: number) => Promise<void>;
  loadAcquisitions: (id: number) => Promise<void>;
  setBudget: (allocation: BudgetAllocation) => Promise<void>;
  startRdProgram: (programId: string, fundingLevel: RDFundingLevel) => Promise<void>;
  updateRdProgram: (programId: string, payload: RDUpdatePayload) => Promise<void>;
  createAcquisition: (payload: AcquisitionCreatePayload) => Promise<void>;
  reset: () => void;
}

export const useCampaignStore = create<CampaignState>((set, get) => ({
  campaign: null,
  bases: [],
  platformsById: {},
  rdCatalog: [],
  rdActive: [],
  acquisitions: [],
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
      const cid = campaign.id;
      void get().loadBases(cid);
      void get().loadRdActive(cid);
      void get().loadAcquisitions(cid);
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

  loadRdCatalog: async () => {
    if (get().rdCatalog.length > 0) return;
    try {
      const { programs } = await api.getRdCatalog();
      set({ rdCatalog: programs });
    } catch (e) {
      set({ error: (e as Error).message });
    }
  },

  loadRdActive: async (id) => {
    try {
      const { programs } = await api.getRdActive(id);
      set({ rdActive: programs });
    } catch (e) {
      set({ error: (e as Error).message });
    }
  },

  loadAcquisitions: async (id) => {
    try {
      const { orders } = await api.getAcquisitions(id);
      set({ acquisitions: orders });
    } catch (e) {
      set({ error: (e as Error).message });
    }
  },

  setBudget: async (allocation) => {
    const current = get().campaign;
    if (!current) return;
    set({ loading: true, error: null });
    try {
      const campaign = await api.setBudget(current.id, allocation);
      set({ campaign, loading: false });
    } catch (e) {
      set({ error: (e as Error).message, loading: false });
    }
  },

  startRdProgram: async (programId, fundingLevel) => {
    const current = get().campaign;
    if (!current) return;
    set({ loading: true, error: null });
    try {
      await api.startRdProgram(current.id, programId, fundingLevel);
      await get().loadRdActive(current.id);
      set({ loading: false });
    } catch (e) {
      set({ error: (e as Error).message, loading: false });
    }
  },

  updateRdProgram: async (programId, payload) => {
    const current = get().campaign;
    if (!current) return;
    set({ loading: true, error: null });
    try {
      await api.updateRdProgram(current.id, programId, payload);
      await get().loadRdActive(current.id);
      set({ loading: false });
    } catch (e) {
      set({ error: (e as Error).message, loading: false });
    }
  },

  createAcquisition: async (payload) => {
    const current = get().campaign;
    if (!current) return;
    set({ loading: true, error: null });
    try {
      await api.createAcquisition(current.id, payload);
      await get().loadAcquisitions(current.id);
      set({ loading: false });
    } catch (e) {
      set({ error: (e as Error).message, loading: false });
    }
  },

  reset: () => set({
    campaign: null, bases: [], platformsById: {},
    rdCatalog: [], rdActive: [], acquisitions: [],
    loading: false, error: null,
  }),
}));
