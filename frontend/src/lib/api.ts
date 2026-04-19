import axios from "axios";
import type {
  Campaign,
  CampaignCreatePayload,
  PlatformListResponse,
  BaseListResponse,
  BaseUpgradeResponse,
  RDProgramSpecListResponse,
  RDProgramStateListResponse,
  RDProgramState,
  RDFundingLevel,
  RDUpdatePayload,
  AcquisitionListResponse,
  AcquisitionOrder,
  AcquisitionCreatePayload,
  BudgetAllocation,
  VignetteListResponse,
  Vignette,
  VignetteCommitPayload,
  IntelListResponse,
  CampaignNarrativeListResponse,
  GenerateNarrativeResponse,
  NarrativeKind,
  CampaignSummary,
  ObjectiveListResponse,
  CampaignListResponse,
  TurnReportResponse,
  UnlocksResponse,
  LoadoutUpgrade,
  ADBattery,
  HangarResponse,
} from "./types";

const baseURL = import.meta.env.VITE_API_URL ?? "http://localhost:8010";

export const http = axios.create({ baseURL, timeout: 10_000 });

export const api = {
  async createCampaign(payload: CampaignCreatePayload): Promise<Campaign> {
    const { data } = await http.post<Campaign>("/api/campaigns", payload);
    return data;
  },

  async getCampaign(id: number): Promise<Campaign> {
    const { data } = await http.get<Campaign>(`/api/campaigns/${id}`);
    return data;
  },

  async advanceTurn(id: number): Promise<Campaign> {
    const { data } = await http.post<Campaign>(`/api/campaigns/${id}/advance`);
    return data;
  },

  async getPlatforms(): Promise<PlatformListResponse> {
    const { data } = await http.get<PlatformListResponse>("/api/content/platforms");
    return data;
  },

  async getBases(campaignId: number): Promise<BaseListResponse> {
    const { data } = await http.get<BaseListResponse>(
      `/api/campaigns/${campaignId}/bases`,
    );
    return data;
  },

  async getRdCatalog(): Promise<RDProgramSpecListResponse> {
    const { data } = await http.get<RDProgramSpecListResponse>("/api/content/rd-programs");
    return data;
  },

  async getRdActive(campaignId: number): Promise<RDProgramStateListResponse> {
    const { data } = await http.get<RDProgramStateListResponse>(
      `/api/campaigns/${campaignId}/rd`,
    );
    return data;
  },

  async getAcquisitions(campaignId: number): Promise<AcquisitionListResponse> {
    const { data } = await http.get<AcquisitionListResponse>(
      `/api/campaigns/${campaignId}/acquisitions`,
    );
    return data;
  },

  async setBudget(campaignId: number, allocation: BudgetAllocation): Promise<Campaign> {
    const { data } = await http.post<Campaign>(
      `/api/campaigns/${campaignId}/budget`,
      { allocation },
    );
    return data;
  },

  async startRdProgram(
    campaignId: number,
    programId: string,
    fundingLevel: RDFundingLevel,
  ): Promise<RDProgramState> {
    const { data } = await http.post<RDProgramState>(
      `/api/campaigns/${campaignId}/rd`,
      { program_id: programId, funding_level: fundingLevel },
    );
    return data;
  },

  async updateRdProgram(
    campaignId: number,
    programId: string,
    payload: RDUpdatePayload,
  ): Promise<RDProgramState> {
    const { data } = await http.post<RDProgramState>(
      `/api/campaigns/${campaignId}/rd/${programId}`,
      payload,
    );
    return data;
  },

  async createAcquisition(
    campaignId: number,
    payload: AcquisitionCreatePayload,
  ): Promise<AcquisitionOrder> {
    const { data } = await http.post<AcquisitionOrder>(
      `/api/campaigns/${campaignId}/acquisitions`,
      payload,
    );
    return data;
  },

  async getVignettesPending(campaignId: number): Promise<VignetteListResponse> {
    const { data } = await http.get<VignetteListResponse>(
      `/api/campaigns/${campaignId}/vignettes/pending`,
    );
    return data;
  },

  async getVignette(campaignId: number, vignetteId: number): Promise<Vignette> {
    const { data } = await http.get<Vignette>(
      `/api/campaigns/${campaignId}/vignettes/${vignetteId}`,
    );
    return data;
  },

  async commitVignette(
    campaignId: number,
    vignetteId: number,
    payload: VignetteCommitPayload,
  ): Promise<Vignette> {
    const { data } = await http.post<Vignette>(
      `/api/campaigns/${campaignId}/vignettes/${vignetteId}/commit`,
      payload,
    );
    return data;
  },

  async getIntel(
    campaignId: number,
    filter: { year?: number; quarter?: number } = {},
  ): Promise<IntelListResponse> {
    const params: Record<string, number> = {};
    if (filter.year != null) params.year = filter.year;
    if (filter.quarter != null) params.quarter = filter.quarter;
    const { data } = await http.get<IntelListResponse>(
      `/api/campaigns/${campaignId}/intel`,
      { params },
    );
    return data;
  },

  async listNarratives(
    campaignId: number,
    kind?: NarrativeKind,
  ): Promise<CampaignNarrativeListResponse> {
    const params = kind ? { kind } : {};
    const { data } = await http.get<CampaignNarrativeListResponse>(
      `/api/campaigns/${campaignId}/narratives`,
      { params },
    );
    return data;
  },

  async generateAAR(campaignId: number, vignetteId: number): Promise<GenerateNarrativeResponse> {
    const { data } = await http.post<GenerateNarrativeResponse>(
      `/api/campaigns/${campaignId}/vignettes/${vignetteId}/aar`,
    );
    return data;
  },

  async generateIntelBrief(campaignId: number): Promise<GenerateNarrativeResponse> {
    const { data } = await http.post<GenerateNarrativeResponse>(
      `/api/campaigns/${campaignId}/intel-briefs/generate`,
    );
    return data;
  },

  async getCampaignSummary(campaignId: number): Promise<CampaignSummary> {
    const { data } = await http.get<CampaignSummary>(
      `/api/campaigns/${campaignId}/summary`,
    );
    return data;
  },

  async generateYearRecap(
    campaignId: number,
    year: number,
  ): Promise<GenerateNarrativeResponse> {
    const { data } = await http.post<GenerateNarrativeResponse>(
      `/api/campaigns/${campaignId}/year-recap/generate`,
      null,
      { params: { year } },
    );
    return data;
  },

  async generateRetrospective(campaignId: number): Promise<GenerateNarrativeResponse> {
    const { data } = await http.post<GenerateNarrativeResponse>(
      `/api/campaigns/${campaignId}/retrospective`,
    );
    return data;
  },

  async upgradeBase(
    campaignId: number,
    baseTemplateId: string,
    upgradeType: string,
  ): Promise<BaseUpgradeResponse> {
    const { data } = await http.post<BaseUpgradeResponse>(
      `/api/campaigns/${campaignId}/bases/${baseTemplateId}/upgrade`,
      { upgrade_type: upgradeType },
    );
    return data;
  },

  exportCampaign: (campaignId: number) =>
    http.get(`/api/campaigns/${campaignId}/export`).then((r) => r.data),

  async deleteCampaign(campaignId: number): Promise<void> {
    await http.delete(`/api/campaigns/${campaignId}`);
  },

  importCampaign: (data: Record<string, unknown>) =>
    http.post<{ id: number }>("/api/campaigns/import", data).then((r) => r.data),

  async rebaseSquadron(
    campaignId: number,
    squadronId: number,
    targetBaseId: number,
  ): Promise<{ id: number; base_id: number }> {
    const { data } = await http.post(
      `/api/campaigns/${campaignId}/squadrons/${squadronId}/rebase`,
      { target_base_id: targetBaseId },
    );
    return data;
  },

  async getObjectives(): Promise<ObjectiveListResponse> {
    const { data } = await http.get<ObjectiveListResponse>("/api/content/objectives");
    return data;
  },

  async listCampaigns(): Promise<CampaignListResponse> {
    const { data } = await http.get<CampaignListResponse>("/api/campaigns");
    return data;
  },

  async getTurnReport(campaignId: number, year: number, quarter: number): Promise<TurnReportResponse> {
    const { data } = await http.get<TurnReportResponse>(
      `/api/campaigns/${campaignId}/turn-report/${year}/${quarter}`
    );
    return data;
  },

  async getArmoryUnlocks(campaignId: number): Promise<UnlocksResponse> {
    const { data } = await http.get<UnlocksResponse>(
      `/api/campaigns/${campaignId}/armory/unlocks`
    );
    return data;
  },

  async equipMissile(
    campaignId: number,
    missileId: string,
    squadronId: number,
  ): Promise<LoadoutUpgrade> {
    const { data } = await http.post<LoadoutUpgrade>(
      `/api/campaigns/${campaignId}/armory/missiles/${missileId}/equip`,
      { squadron_id: squadronId },
    );
    return data;
  },

  async installADSystem(
    campaignId: number,
    systemId: string,
    baseId: number,
  ): Promise<ADBattery> {
    const { data } = await http.post<ADBattery>(
      `/api/campaigns/${campaignId}/armory/ad-systems/${systemId}/install`,
      { base_id: baseId },
    );
    return data;
  },

  async getHangar(campaignId: number): Promise<HangarResponse> {
    const { data } = await http.get<HangarResponse>(
      `/api/campaigns/${campaignId}/hangar`
    );
    return data;
  },
};
