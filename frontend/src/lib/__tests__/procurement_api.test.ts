import { describe, it, expect, vi, beforeEach } from "vitest";
import { http, api } from "../api";
import type {
  RDProgramSpecListResponse, RDProgramStateListResponse,
  AcquisitionListResponse, Campaign, RDProgramState, AcquisitionOrder,
} from "../types";

describe("procurement api methods", () => {
  const getSpy = vi.spyOn(http, "get");
  const postSpy = vi.spyOn(http, "post");

  beforeEach(() => {
    getSpy.mockReset();
    postSpy.mockReset();
  });

  it("getRdCatalog hits /api/content/rd-programs", async () => {
    const body: RDProgramSpecListResponse = { programs: [] };
    getSpy.mockResolvedValueOnce({ data: body } as any);
    const out = await api.getRdCatalog();
    expect(out.programs).toEqual([]);
    expect(getSpy).toHaveBeenCalledWith("/api/content/rd-programs");
  });

  it("getRdActive hits /api/campaigns/:id/rd", async () => {
    const body: RDProgramStateListResponse = { programs: [] };
    getSpy.mockResolvedValueOnce({ data: body } as any);
    await api.getRdActive(42);
    expect(getSpy).toHaveBeenCalledWith("/api/campaigns/42/rd");
  });

  it("getAcquisitions hits /api/campaigns/:id/acquisitions", async () => {
    const body: AcquisitionListResponse = { orders: [] };
    getSpy.mockResolvedValueOnce({ data: body } as any);
    await api.getAcquisitions(42);
    expect(getSpy).toHaveBeenCalledWith("/api/campaigns/42/acquisitions");
  });

  it("setBudget POSTs to /api/campaigns/:id/budget", async () => {
    const campaign = { id: 42 } as Campaign;
    postSpy.mockResolvedValueOnce({ data: campaign } as any);
    await api.setBudget(42, {
      rd: 50000, acquisition: 60000, om: 30000, spares: 15000, infrastructure: 5000,
    });
    expect(postSpy).toHaveBeenCalledWith(
      "/api/campaigns/42/budget",
      { allocation: { rd: 50000, acquisition: 60000, om: 30000, spares: 15000, infrastructure: 5000 } },
    );
  });

  it("startRdProgram POSTs to /api/campaigns/:id/rd", async () => {
    const state = { program_id: "ghatak_ucav" } as RDProgramState;
    postSpy.mockResolvedValueOnce({ data: state } as any);
    await api.startRdProgram(42, "ghatak_ucav", "accelerated");
    expect(postSpy).toHaveBeenCalledWith(
      "/api/campaigns/42/rd",
      { program_id: "ghatak_ucav", funding_level: "accelerated" },
    );
  });

  it("updateRdProgram POSTs to /api/campaigns/:id/rd/:programId", async () => {
    const state = { program_id: "ghatak_ucav" } as RDProgramState;
    postSpy.mockResolvedValueOnce({ data: state } as any);
    await api.updateRdProgram(42, "ghatak_ucav", { status: "cancelled" });
    expect(postSpy).toHaveBeenCalledWith(
      "/api/campaigns/42/rd/ghatak_ucav",
      { status: "cancelled" },
    );
  });

  it("createAcquisition POSTs to /api/campaigns/:id/acquisitions", async () => {
    const order = { id: 1 } as AcquisitionOrder;
    postSpy.mockResolvedValueOnce({ data: order } as any);
    await api.createAcquisition(42, {
      platform_id: "tejas_mk1a", quantity: 16,
      first_delivery_year: 2028, first_delivery_quarter: 1,
      foc_year: 2030, foc_quarter: 4, total_cost_cr: 8000,
    });
    expect(postSpy).toHaveBeenCalledWith(
      "/api/campaigns/42/acquisitions",
      expect.objectContaining({ platform_id: "tejas_mk1a", quantity: 16 }),
    );
  });
});
