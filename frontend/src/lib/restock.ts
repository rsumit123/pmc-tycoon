import type { Notification, AcquisitionCreatePayload, WeaponMeta } from "./types";

function addQuarters(year: number, quarter: number, n: number): [number, number] {
  const total = (quarter - 1) + n;            // quarter is 1..4
  return [year + Math.floor(total / 4), (total % 4) + 1];
}

function parseStockNotification(n: Notification): { weaponId: string; baseId: number; qty: number } | null {
  if (n.kind !== "low_stock" && n.kind !== "empty_stock") return null;
  const qs = n.action_url.split("?")[1];
  if (!qs) return null;
  const params = new URLSearchParams(qs);
  const weaponId = params.get("missile");
  const baseRaw = params.get("base");
  const qtyRaw = params.get("qty");
  if (!weaponId || !baseRaw || !qtyRaw) return null;
  const baseId = parseInt(baseRaw, 10);
  const qty = parseInt(qtyRaw, 10);
  if (!Number.isFinite(baseId) || !Number.isFinite(qty) || qty <= 0) return null;
  return { weaponId, baseId, qty };
}

/**
 * Turn low/empty-stock notifications into missile_batch acquisition orders.
 * Pure + deterministic — the UI signs each via the normal acquisition flow.
 */
export function buildRestockOrders(
  notifications: Notification[],
  weaponsById: Record<string, WeaponMeta>,
  currentYear: number,
  currentQuarter: number,
): AcquisitionCreatePayload[] {
  const [fdY, fdQ] = addQuarters(currentYear, currentQuarter, 2);
  const [focY, focQ] = addQuarters(currentYear, currentQuarter, 4);
  const orders: AcquisitionCreatePayload[] = [];
  for (const n of notifications) {
    const p = parseStockNotification(n);
    if (!p) continue;
    const unit = weaponsById[p.weaponId]?.unit_cost_cr ?? 0;
    orders.push({
      platform_id: p.weaponId,
      quantity: p.qty,
      first_delivery_year: fdY,
      first_delivery_quarter: fdQ,
      foc_year: focY,
      foc_quarter: focQ,
      total_cost_cr: p.qty * unit,
      preferred_base_id: p.baseId,
      kind: "missile_batch",
      target_battery_id: null,
    });
  }
  return orders;
}
