import { describe, it, expect, vi, beforeEach } from "vitest";
import { api, http } from "../api";

describe("vignettes + intel + narratives api", () => {
  beforeEach(() => vi.restoreAllMocks());

  it("getVignettesPending GETs pending endpoint", async () => {
    const spy = vi.spyOn(http, "get").mockResolvedValue({ data: { vignettes: [] } });
    const r = await api.getVignettesPending(7);
    expect(spy).toHaveBeenCalledWith("/api/campaigns/7/vignettes/pending");
    expect(r.vignettes).toEqual([]);
  });

  it("getVignette GETs single vignette", async () => {
    const spy = vi.spyOn(http, "get").mockResolvedValue({ data: { id: 3 } });
    await api.getVignette(7, 3);
    expect(spy).toHaveBeenCalledWith("/api/campaigns/7/vignettes/3");
  });

  it("commitVignette POSTs payload", async () => {
    const spy = vi.spyOn(http, "post").mockResolvedValue({ data: { id: 3, status: "resolved" } });
    const payload = { squadrons: [{ squadron_id: 1, airframes: 8 }], support: { awacs: true, tanker: false, sead_package: false }, roe: "weapons_free" as const };
    await api.commitVignette(7, 3, payload);
    expect(spy).toHaveBeenCalledWith("/api/campaigns/7/vignettes/3/commit", payload);
  });

  it("getIntel GETs with year+quarter filter", async () => {
    const spy = vi.spyOn(http, "get").mockResolvedValue({ data: { total: 0, cards: [] } });
    await api.getIntel(7, { year: 2027, quarter: 2 });
    expect(spy).toHaveBeenCalledWith("/api/campaigns/7/intel", { params: { year: 2027, quarter: 2 } });
  });

  it("generateAAR POSTs aar endpoint", async () => {
    const spy = vi.spyOn(http, "post").mockResolvedValue({ data: { text: "…", cached: false, kind: "aar", subject_id: "vig-3" } });
    await api.generateAAR(7, 3);
    expect(spy).toHaveBeenCalledWith("/api/campaigns/7/vignettes/3/aar");
  });

  it("generateIntelBrief POSTs brief endpoint", async () => {
    const spy = vi.spyOn(http, "post").mockResolvedValue({ data: { text: "…", cached: false, kind: "intel_brief", subject_id: "2027-Q2" } });
    await api.generateIntelBrief(7);
    expect(spy).toHaveBeenCalledWith("/api/campaigns/7/intel-briefs/generate");
  });

  it("listNarratives GETs with kind filter", async () => {
    const spy = vi.spyOn(http, "get").mockResolvedValue({ data: { narratives: [] } });
    await api.listNarratives(7, "intel_brief");
    expect(spy).toHaveBeenCalledWith("/api/campaigns/7/narratives", { params: { kind: "intel_brief" } });
  });
});
