import { create } from "zustand";
import type {
  Campaign, CampaignCreatePayload, BaseMarker, Platform,
  RDProgramSpec, RDProgramState, AcquisitionOrder,
  BudgetAllocation, RDFundingLevel, RDUpdatePayload, AcquisitionCreatePayload,
  Vignette, VignetteCommitPayload,
  IntelCard,
  GenerateNarrativeResponse,
  CampaignSummary,
  CampaignListItem,
  ObjectiveSpec,
  TurnReportResponse,
  Toast,
  ToastVariant,
  HangarResponse,
} from "../lib/types";
import { api } from "../lib/api";

interface CampaignState {
  campaign: Campaign | null;
  bases: BaseMarker[];
  platformsById: Record<string, Platform>;
  rdCatalog: RDProgramSpec[];
  rdActive: RDProgramState[];
  acquisitions: AcquisitionOrder[];
  pendingVignettes: Vignette[];
  vignetteById: Record<number, Vignette>;
  intelCards: IntelCard[];
  intelFilter: { year: number; quarter: number } | null;
  narrativeCache: Record<string, GenerateNarrativeResponse>;
  campaignSummary: CampaignSummary | null;
  yearRecapToast: string | null;
  campaignList: CampaignListItem[];
  objectivesCatalog: ObjectiveSpec[];
  turnReport: TurnReportResponse | null;
  hangar: HangarResponse | null;
  toasts: Toast[];
  rdLoading: Record<string, boolean>;
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
  loadPendingVignettes: (campaignId: number) => Promise<void>;
  loadVignette: (campaignId: number, vignetteId: number) => Promise<Vignette | null>;
  commitVignette: (campaignId: number, vignetteId: number, payload: VignetteCommitPayload) => Promise<Vignette>;
  loadIntel: (campaignId: number, filter?: { year: number; quarter: number }) => Promise<void>;
  generateAAR: (campaignId: number, vignetteId: number) => Promise<GenerateNarrativeResponse>;
  generateIntelBrief: (campaignId: number) => Promise<GenerateNarrativeResponse>;
  loadCampaignSummary: (campaignId: number) => Promise<void>;
  generateYearRecap: (campaignId: number, year: number) => Promise<GenerateNarrativeResponse>;
  generateRetrospective: (campaignId: number) => Promise<GenerateNarrativeResponse>;
  dismissYearRecapToast: () => void;
  rebaseSquadron: (squadronId: number, targetBaseId: number) => Promise<void>;
  pushToast: (variant: ToastVariant, message: string, duration?: number) => void;
  dismissToast: (id: string) => void;
  loadCampaignList: () => Promise<void>;
  loadObjectivesCatalog: () => Promise<void>;
  loadTurnReport: (campaignId: number, year: number, quarter: number) => Promise<void>;
  loadHangar: (campaignId: number) => Promise<void>;
  reset: () => void;
}

export const useCampaignStore = create<CampaignState>((set, get) => ({
  campaign: null,
  bases: [],
  platformsById: {},
  rdCatalog: [],
  rdActive: [],
  acquisitions: [],
  pendingVignettes: [],
  vignetteById: {},
  intelCards: [],
  intelFilter: null,
  narrativeCache: {},
  campaignSummary: null,
  yearRecapToast: null,
  campaignList: [],
  objectivesCatalog: [],
  turnReport: null,
  hangar: null,
  toasts: [],
  rdLoading: {},
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
      // Fire year-recap toast on Q4→Q1 rollover
      if (current.current_quarter === 4 && campaign.current_quarter === 1) {
        const closedYear = current.current_year;
        const msg = `Year ${closedYear} complete — review in White Paper`;
        set({ yearRecapToast: msg });
        get().pushToast("info", msg, 8000);
        api.generateYearRecap(campaign.id, closedYear)
          .then((resp) => {
            set({ yearRecapToast: resp.text });
          })
          .catch(() => {});
      }
      const cid = campaign.id;
      void get().loadBases(cid);
      void get().loadRdActive(cid);
      void get().loadAcquisitions(cid);
      void get().loadPendingVignettes(cid);
      void get().loadIntel(cid, { year: campaign.current_year, quarter: campaign.current_quarter });
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
      get().pushToast("success", "Budget allocation updated");
    } catch (e) {
      set({ error: (e as Error).message, loading: false });
      get().pushToast("error", "Budget update failed");
      throw e;
    }
  },

  startRdProgram: async (programId, fundingLevel) => {
    const current = get().campaign;
    if (!current) return;
    set((s) => ({ rdLoading: { ...s.rdLoading, [programId]: true }, error: null }));
    try {
      await api.startRdProgram(current.id, programId, fundingLevel);
      await get().loadRdActive(current.id);
      get().pushToast("success", `R&D started: ${programId}`);
    } catch (e) {
      set({ error: (e as Error).message });
      get().pushToast("error", "Failed to start R&D program");
      throw e;
    } finally {
      set((s) => {
        const next = { ...s.rdLoading };
        delete next[programId];
        return { rdLoading: next };
      });
    }
  },

  updateRdProgram: async (programId, payload) => {
    const current = get().campaign;
    if (!current) return;
    set((s) => ({ rdLoading: { ...s.rdLoading, [programId]: true }, error: null }));
    try {
      await api.updateRdProgram(current.id, programId, payload);
      await get().loadRdActive(current.id);
      if (payload.funding_level) {
        get().pushToast("success", `Funding changed to ${payload.funding_level}`);
      } else if (payload.status === "cancelled") {
        get().pushToast("info", "Program cancelled");
      }
    } catch (e) {
      set({ error: (e as Error).message });
      get().pushToast("error", "R&D update failed");
      throw e;
    } finally {
      set((s) => {
        const next = { ...s.rdLoading };
        delete next[programId];
        return { rdLoading: next };
      });
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
      get().pushToast("success", `Order signed: ${payload.platform_id}`);
    } catch (e) {
      set({ error: (e as Error).message, loading: false });
      get().pushToast("error", "Order failed");
      throw e;
    }
  },

  loadPendingVignettes: async (campaignId) => {
    try {
      const { vignettes } = await api.getVignettesPending(campaignId);
      set({ pendingVignettes: vignettes });
    } catch (e) {
      set({ error: (e as Error).message });
    }
  },

  loadVignette: async (campaignId, vignetteId) => {
    try {
      const v = await api.getVignette(campaignId, vignetteId);
      set((s) => ({ vignetteById: { ...s.vignetteById, [v.id]: v } }));
      return v;
    } catch (e) {
      set({ error: (e as Error).message });
      return null;
    }
  },

  commitVignette: async (campaignId, vignetteId, payload) => {
    set({ loading: true, error: null });
    try {
      const v = await api.commitVignette(campaignId, vignetteId, payload);
      set((s) => ({
        vignetteById: { ...s.vignetteById, [v.id]: v },
        pendingVignettes: s.pendingVignettes.filter((pv) => pv.id !== v.id),
        loading: false,
      }));
      return v;
    } catch (e) {
      set({ loading: false, error: (e as Error).message });
      throw e;
    }
  },

  loadIntel: async (campaignId, filter) => {
    try {
      const { cards } = await api.getIntel(campaignId, filter ?? {});
      set({ intelCards: cards, intelFilter: filter ?? null });
    } catch (e) {
      set({ error: (e as Error).message });
    }
  },

  generateAAR: async (campaignId, vignetteId) => {
    const key = `aar:vig-${vignetteId}`;
    const cached = get().narrativeCache[key];
    if (cached) return cached;
    const resp = await api.generateAAR(campaignId, vignetteId);
    set((s) => ({ narrativeCache: { ...s.narrativeCache, [key]: resp } }));
    return resp;
  },

  loadCampaignSummary: async (campaignId) => {
    try {
      const summary = await api.getCampaignSummary(campaignId);
      set({ campaignSummary: summary });
    } catch (e) {
      set({ error: (e as Error).message });
    }
  },

  generateYearRecap: async (campaignId, year) => {
    const key = `year_recap:${year}`;
    const cached = get().narrativeCache[key];
    if (cached) return cached;
    const resp = await api.generateYearRecap(campaignId, year);
    set((s) => ({ narrativeCache: { ...s.narrativeCache, [key]: resp } }));
    return resp;
  },

  generateRetrospective: async (campaignId) => {
    const key = "retrospective:campaign";
    const cached = get().narrativeCache[key];
    if (cached) return cached;
    const resp = await api.generateRetrospective(campaignId);
    set((s) => ({ narrativeCache: { ...s.narrativeCache, [key]: resp } }));
    return resp;
  },

  dismissYearRecapToast: () => set({ yearRecapToast: null }),

  rebaseSquadron: async (squadronId, targetBaseId) => {
    const c = get().campaign;
    if (!c) return;
    set({ loading: true, error: null });
    try {
      const updated = await api.rebaseSquadron(c.id, squadronId, targetBaseId);
      await get().loadBases(c.id);
      const baseName = get().bases.find((b) => b.id === updated.base_id)?.name ?? "new base";
      get().pushToast("success", `Squadron rebased to ${baseName}`);
    } catch (e: any) {
      set({ error: e.message ?? "Rebase failed" });
      get().pushToast("error", "Rebase failed");
      throw e;
    } finally {
      set({ loading: false });
    }
  },

  pushToast: (variant, message, duration) => {
    const id = `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
    set((s) => ({ toasts: [...s.toasts, { id, variant, message, duration }] }));
  },

  dismissToast: (id) => {
    set((s) => ({ toasts: s.toasts.filter((t) => t.id !== id) }));
  },

  generateIntelBrief: async (campaignId) => {
    const c = get().campaign;
    const key = c ? `intel_brief:${c.current_year}-Q${c.current_quarter}` : "intel_brief:current";
    const cached = get().narrativeCache[key];
    if (cached) return cached;
    const resp = await api.generateIntelBrief(campaignId);
    set((s) => ({ narrativeCache: { ...s.narrativeCache, [key]: resp } }));
    return resp;
  },

  loadCampaignList: async () => {
    try {
      const resp = await api.listCampaigns();
      set({ campaignList: resp.campaigns });
    } catch (e) {
      set({ error: (e as Error).message });
    }
  },

  loadObjectivesCatalog: async () => {
    try {
      const resp = await api.getObjectives();
      set({ objectivesCatalog: resp.objectives });
    } catch (e) {
      set({ error: (e as Error).message });
    }
  },

  loadTurnReport: async (campaignId, year, quarter) => {
    const r = await api.getTurnReport(campaignId, year, quarter);
    set({ turnReport: r });
  },

  loadHangar: async (campaignId: number) => {
    try {
      const r = await api.getHangar(campaignId);
      set({ hangar: r });
    } catch {
      get().pushToast("error", "Failed to load hangar");
    }
  },

  reset: () => set({
    campaign: null, bases: [], platformsById: {},
    rdCatalog: [], rdActive: [], acquisitions: [],
    pendingVignettes: [], vignetteById: {},
    intelCards: [], intelFilter: null, narrativeCache: {},
    campaignSummary: null, yearRecapToast: null,
    campaignList: [], objectivesCatalog: [],
    turnReport: null,
    hangar: null,
    toasts: [], rdLoading: {},
    loading: false, error: null,
  }),
}));
