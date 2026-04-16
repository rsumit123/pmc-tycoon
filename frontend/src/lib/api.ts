import axios from "axios";
import type { Campaign, CampaignCreatePayload } from "./types";

const baseURL = import.meta.env.VITE_API_URL ?? "http://localhost:8010";

const http = axios.create({ baseURL, timeout: 10_000 });

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
};
