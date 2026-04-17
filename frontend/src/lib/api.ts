import axios from "axios";
import type {
  Campaign,
  CampaignCreatePayload,
  PlatformListResponse,
  BaseListResponse,
  RDProgramSpecListResponse,
  RDProgramStateListResponse,
  RDProgramState,
  RDFundingLevel,
  RDUpdatePayload,
  AcquisitionListResponse,
  AcquisitionOrder,
  AcquisitionCreatePayload,
  BudgetAllocation,
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
};
