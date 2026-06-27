import { describe, it, expect, vi, afterEach } from "vitest";
import { api, http } from "../api";

afterEach(() => vi.restoreAllMocks());

describe("api.getObjectiveProgress", () => {
  it("GETs the objectives endpoint and returns the list", async () => {
    const spy = vi.spyOn(http, "get").mockResolvedValue({
      data: { objectives: [{ id: "maintain_42_squadrons", name: "Maintain 42+", status: "in_progress", progress: 0.5, detail: "21/42 squadrons" }] },
    } as never);
    const res = await api.getObjectiveProgress(7);
    expect(spy).toHaveBeenCalledWith("/api/campaigns/7/objectives");
    expect(res.objectives[0].status).toBe("in_progress");
  });
});
