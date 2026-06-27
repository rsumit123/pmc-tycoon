import { describe, it, expect } from "vitest";
import { buildRestockOrders } from "../restock";

const weaponsById = { meteor: { unit_cost_cr: 18 }, astra_mk1: { unit_cost_cr: 7 } } as never;

const lowStock = {
  id: "low_stock:3:meteor", kind: "low_stock", severity: "warning",
  title: "Meteor low at Ambala", body: "reorder",
  action_url: "/campaign/1/procurement?tab=acquisitions&view=offers&offer=missiles&missile=meteor&base=3&qty=40",
  created_at: null,
} as never;
const infoNote = { id: "x", kind: "rd_completed", severity: "info", title: "X", body: "", action_url: "/x", created_at: null } as never;

describe("buildRestockOrders", () => {
  it("builds a missile_batch order per stock warning with correct qty/cost/base", () => {
    const orders = buildRestockOrders([lowStock, infoNote], weaponsById, 2027, 2);
    expect(orders).toHaveLength(1);
    const o = orders[0];
    expect(o.kind).toBe("missile_batch");
    expect(o.platform_id).toBe("meteor");
    expect(o.quantity).toBe(40);
    expect(o.preferred_base_id).toBe(3);
    expect(o.total_cost_cr).toBe(40 * 18);
    expect([o.first_delivery_year, o.first_delivery_quarter]).toEqual([2027, 4]);
    expect([o.foc_year, o.foc_quarter]).toEqual([2028, 2]);
  });

  it("skips notifications whose action_url lacks missile/base/qty", () => {
    const bad = { id: "low_stock:bad", kind: "low_stock", severity: "warning", title: "t", body: "", action_url: "/campaign/1/procurement", created_at: null } as never;
    expect(buildRestockOrders([bad], weaponsById, 2027, 2)).toHaveLength(0);
  });
});
