import { useEffect, useMemo, useRef, useState } from "react";
import type {
  Platform, AcquisitionOrder, AcquisitionCreatePayload, RDProgramSpec, RDProgramState,
  BaseMarker, MissileStock, ADBattery, UnlocksResponse, WeaponMeta,
  MissileUnlock, ADSystemUnlock,
} from "../../lib/types";
import { Stepper } from "../primitives/Stepper";
import { CommitHoldButton } from "../primitives/CommitHoldButton";
import { PlatformDossier } from "../primitives/PlatformDossier";
import { InfoButton, WeaponInfo, ADSystemInfo } from "../primitives/RoleInfo";
import { flagFor, WEAPON_ORIGIN, AD_SYSTEM_ORIGIN } from "../../lib/origin";

export const AD_STARTING_INTERCEPTORS: Record<string, number> = {
  s400: 16, long_range_sam: 16, project_kusha: 12,
  mrsam_air: 24, akash_ng: 24, qrsam: 32, vshorads: 32,
};
export const AD_INTERCEPTOR_COST: Record<string, number> = {
  s400: 17, long_range_sam: 15, project_kusha: 15,
  mrsam_air: 5, akash_ng: 3, qrsam: 2, vshorads: 1,
};
const AD_LONG_DELIVERY = new Set(["s400", "long_range_sam", "project_kusha"]);

export interface AcquisitionPipelineProps {
  platforms: Platform[];
  orders: AcquisitionOrder[];
  currentYear: number;
  currentQuarter: number;
  onSign: (payload: AcquisitionCreatePayload) => void;
  onCancel?: (orderId: number) => void;
  disabled?: boolean;
  /** Full R&D catalog — used to detect which platforms are R&D-gated. */
  rdCatalog?: RDProgramSpec[];
  /** Active R&D program states — used to know which gated platforms remain locked. */
  rdActive?: RDProgramState[];
  /** Available bases, for per-order delivery routing. */
  bases?: BaseMarker[];
  /** Initial inner tab — lets deep-links land on Offers. */
  initialView?: "orders" | "offers";
  /** When set, scrolls to + highlights the matching OfferCard on mount. */
  focusPlatformId?: string;
  /** When set, scrolls to + highlights the matching AD Battery offer card. */
  focusAdId?: string;
  /** Active missile stock per base (used for informational displays). */
  missileStocks?: MissileStock[];
  /** Installed AD batteries (used for AD Reload offers). */
  adBatteries?: ADBattery[];
  /** Armory unlocks (used for missile + AD system offers). */
  armoryUnlocks?: UnlocksResponse | null;
  /** Weapon catalog for missile_batch unit cost lookup. */
  weaponsById?: Record<string, WeaponMeta>;
  /** Explicit initial offer sub-tab (overrides focus-hint inference). */
  initialOfferCat?: "aircraft" | "missiles" | "ad_systems" | "reloads" | null;
  /** When set, scrolls to + pre-fills MissileBatchOfferCard for this weapon. */
  focusMissile?: string;
  /** When set, seeds the base select on the focused missile card. */
  focusBaseId?: number;
  /** When set, seeds the qty stepper on the focused missile card. */
  focusQty?: number;
  /** Pre-select the AD reload group matching this system id. */
  focusAdSystem?: string;
  /** Pre-select the target battery within an AD reload card. */
  focusBatteryId?: number;
}

// Strip noisy suffixes so base names fit in narrow select dropdowns on mobile.
// "Pathankot Air Force Station" → "Pathankot"; "Car Nicobar Air Force Station (INS Baaz)" → "Car Nicobar"
function shortBaseName(name: string): string {
  return name
    .replace(/\s+Air Force Station\b.*$/, "")
    .replace(/\s+AFS\b.*$/, "");
}

// Base runway_class values in content (bases.yaml): "medium" or "heavy".
// Platform runway_class (if set) declares its minimum requirement. A "heavy"
// runway hosts anything; "medium" hosts anything except long/heavy-req
// platforms. Keep every set broad — prior table missed "heavy" entirely,
// which reduced eligible bases to 2/15 for any standard-req platform.
const RUNWAY_COMPATIBILITY: Record<string, Set<string>> = {
  short:    new Set(["short", "standard", "medium", "long", "heavy"]),
  standard: new Set(["standard", "medium", "long", "heavy"]),
  medium:   new Set(["medium", "long", "heavy"]),
  long:     new Set(["long", "heavy"]),
  heavy:    new Set(["heavy"]),
};

const DEFAULT_QTY = 16;
const MIN_QTY = 4;
const MAX_QTY = 36;
const QTY_STEP = 2;

const TIMELINE_START_Y = 2026;
const TIMELINE_START_Q = 2;
const TIMELINE_QUARTERS = 40;

function qIndex(year: number, quarter: number): number {
  return (year - TIMELINE_START_Y) * 4 + (quarter - TIMELINE_START_Q);
}

function qFraction(year: number, quarter: number): number {
  const i = Math.max(0, Math.min(TIMELINE_QUARTERS - 1, qIndex(year, quarter)));
  return i / TIMELINE_QUARTERS;
}

function OfferCard({
  platform, currentYear, currentQuarter, onSign, disabled, bases = [], highlighted,
}: {
  platform: Platform;
  currentYear: number;
  currentQuarter: number;
  onSign: AcquisitionPipelineProps["onSign"];
  disabled?: boolean;
  bases?: BaseMarker[];
  highlighted?: boolean;
}) {
  const ref = useRef<HTMLDivElement | null>(null);
  useEffect(() => {
    if (highlighted && ref.current) {
      ref.current.scrollIntoView({ behavior: "smooth", block: "center" });
    }
  }, [highlighted]);
  const [qty, setQty] = useState<number>(DEFAULT_QTY);
  const [preferredBaseId, setPreferredBaseId] = useState<number | "auto">("auto");
  const [dossierOpen, setDossierOpen] = useState(false);

  const runwayReq = platform.runway_class ?? "standard";
  const acceptable = RUNWAY_COMPATIBILITY[runwayReq] ?? new Set(["standard", "medium", "long", "heavy"]);
  const compatibleBases = bases.filter((b) => acceptable.has(b.runway_class));

  const totalCost = qty * platform.cost_cr;
  const firstDeliveryQ = platform.default_first_delivery_quarters ?? 8;
  const focQ = platform.default_foc_quarters ?? 16;
  const firstDeliveryYear = currentYear + Math.floor((currentQuarter - 1 + firstDeliveryQ) / 4);
  const firstDeliveryQuarter = ((currentQuarter - 1 + firstDeliveryQ) % 4) + 1;
  const focYear = currentYear + Math.floor((currentQuarter - 1 + focQ) / 4);
  const focQuarter = ((currentQuarter - 1 + focQ) % 4) + 1;

  const sign = () => {
    onSign({
      platform_id: platform.id,
      quantity: qty,
      first_delivery_year: firstDeliveryYear,
      first_delivery_quarter: firstDeliveryQuarter,
      foc_year: focYear,
      foc_quarter: focQuarter,
      total_cost_cr: totalCost,
      preferred_base_id: preferredBaseId === "auto" ? null : preferredBaseId,
    });
  };

  return (
    <div
      ref={ref}
      className={[
        "rounded-lg p-3 space-y-2 border",
        highlighted
          ? "bg-amber-900/30 border-amber-500 ring-2 ring-amber-400/70 animate-pulse"
          : "bg-slate-900/50 border-slate-800",
      ].join(" ")}
    >
      <p className="flex items-baseline justify-between gap-2">
        <span className="text-sm font-semibold flex items-center gap-1.5">
          {platform.name}
          <InfoButton onClick={() => setDossierOpen(true)} ariaLabel={`${platform.name} info`} />
        </span>
        <span className="text-[11px] opacity-80 flex items-center gap-1 flex-shrink-0">
          <span>{flagFor(platform.origin)}</span>
          <span className="opacity-70">{platform.origin}</span>
        </span>
      </p>
      <PlatformDossier platform={platform} open={dossierOpen} onClose={() => setDossierOpen(false)} />
      <div className="text-xs opacity-70">
        {platform.role} • gen {platform.generation}
        {" • "}₹{platform.cost_cr.toLocaleString("en-US")} cr/unit
      </div>
      <div className="flex items-center gap-2">
        <span className="text-xs opacity-60">Quantity</span>
        <Stepper
          value={qty}
          onChange={setQty}
          step={QTY_STEP}
          min={MIN_QTY}
          max={MAX_QTY}
          formatValue={(v) => String(v)}
          ariaLabel={`${platform.name} quantity`}
        />
      </div>
      <div className="text-xs opacity-70">
        Total: <span className="font-semibold">₹{totalCost.toLocaleString("en-US")} cr</span>
        {" • First delivery "}{firstDeliveryYear}-Q{firstDeliveryQuarter}
        {" • FOC "}{focYear}-Q{focQuarter}
      </div>
      {compatibleBases.length > 0 && (
        <label className="flex flex-col gap-1 text-xs">
          <span className="opacity-60">Deliver to</span>
          <select
            value={preferredBaseId === "auto" ? "auto" : String(preferredBaseId)}
            onChange={(e) => {
              const v = e.target.value;
              setPreferredBaseId(v === "auto" ? "auto" : Number(v));
            }}
            className="w-full min-w-0 bg-slate-800 border border-slate-700 rounded px-2 py-1 text-xs"
            aria-label={`${platform.name} delivery base`}
          >
            <option value="auto">Auto (best fit)</option>
            {compatibleBases.map((b) => (
              <option key={b.id} value={b.id}>{shortBaseName(b.name)}</option>
            ))}
          </select>
        </label>
      )}
      <CommitHoldButton
        label={`Hold to sign ₹${totalCost.toLocaleString("en-US")}`}
        holdMs={1800}
        disabled={disabled}
        onCommit={sign}
        className="w-full"
      />
    </div>
  );
}

function TimelineBar({
  order, platformName, originFlag, currentYear, currentQuarter, onCancel, deliveryBaseName,
}: {
  order: AcquisitionOrder;
  platformName: string;
  originFlag?: string;
  currentYear: number;
  currentQuarter: number;
  onCancel?: (orderId: number) => void;
  deliveryBaseName?: string;
}) {
  const [confirming, setConfirming] = useState(false);

  const startFrac = qFraction(order.first_delivery_year, order.first_delivery_quarter);
  const endFrac = qFraction(order.foc_year, order.foc_quarter);
  const widthFrac = Math.max(0.02, endFrac - startFrac);
  const nowFrac = qFraction(currentYear, currentQuarter);

  const totalQ =
    (order.foc_year - order.first_delivery_year) * 4 +
    (order.foc_quarter - order.first_delivery_quarter) + 1;
  const perQ = totalQ > 0 ? Math.floor(order.total_cost_cr / totalQ) : order.total_cost_cr;

  const nowIdx = currentYear * 4 + (currentQuarter - 1);
  const firstIdx = order.first_delivery_year * 4 + (order.first_delivery_quarter - 1);

  const quartersDone = totalQ > 0
    ? Math.max(0, Math.min(totalQ, Math.floor((order.delivered / order.quantity) * totalQ)))
    : 0;
  const paidSoFar = quartersDone * perQ;
  const remainingCost = Math.max(0, order.total_cost_cr - paidSoFar);
  const remainingQ = Math.max(0, totalQ - quartersDone);

  const isCompleted = order.delivered >= order.quantity;
  const isPreDelivery = !order.cancelled && !isCompleted && nowIdx < firstIdx;
  const cancellable = !order.cancelled && !isCompleted && !!onCancel;
  const quartersUntilStart = Math.max(0, firstIdx - nowIdx);

  return (
    <div className="space-y-1.5 bg-slate-900/40 border border-slate-800 rounded-lg p-3">
      <div className="flex items-baseline justify-between gap-2 text-xs">
        <div className="min-w-0 flex-1">
          {originFlag && <span className="mr-1">{originFlag}</span>}
          <span className="font-semibold">{platformName}</span>
          {order.cancelled && (
            <span className="ml-2 text-[10px] bg-rose-900/50 text-rose-200 px-1.5 py-0.5 rounded">CANCELLED</span>
          )}
          {!order.cancelled && isCompleted && (
            <span className="ml-2 text-[10px] bg-emerald-900/50 text-emerald-200 px-1.5 py-0.5 rounded">COMPLETE</span>
          )}
          {isPreDelivery && (
            <span className="ml-2 text-[10px] bg-sky-900/50 text-sky-200 px-1.5 py-0.5 rounded">SIGNED</span>
          )}
          {!order.cancelled && !isCompleted && !isPreDelivery && (
            <span className="ml-2 text-[10px] bg-amber-900/50 text-amber-200 px-1.5 py-0.5 rounded">DELIVERING</span>
          )}
        </div>
        <span className="opacity-70 flex-shrink-0">
          {order.delivered}/{order.quantity}
        </span>
      </div>
      {deliveryBaseName && (
        <div className="text-[10px] opacity-70">
          → Delivering to <span className="font-semibold">{deliveryBaseName}</span>
        </div>
      )}
      <div className="relative h-3 bg-slate-800 rounded">
        <div
          className={`absolute inset-y-0 border rounded ${
            order.cancelled ? "bg-slate-700/40 border-slate-600"
              : isCompleted ? "bg-emerald-700/60 border-emerald-500"
              : "bg-amber-700/60 border-amber-500"
          }`}
          style={{ left: `${startFrac * 100}%`, width: `${widthFrac * 100}%` }}
        />
        <div
          className="absolute top-[-2px] bottom-[-2px] w-[2px] bg-emerald-300"
          style={{ left: `${nowFrac * 100}%` }}
          aria-label="current quarter"
        />
      </div>
      <div className="flex justify-between text-[10px] opacity-60">
        <span>{order.first_delivery_year}-Q{order.first_delivery_quarter}</span>
        <span>{order.foc_year}-Q{order.foc_quarter}</span>
      </div>
      {isPreDelivery ? (
        <div className="text-[11px] opacity-80 pt-1 space-y-0.5">
          <p>
            💰 Delivery starts <span className="font-semibold">{order.first_delivery_year} Q{order.first_delivery_quarter}</span>
            {quartersUntilStart > 0 && <> (in {quartersUntilStart} quarter{quartersUntilStart === 1 ? "" : "s"})</>}
          </p>
          <p>
            Will cost <span className="font-mono">₹{perQ.toLocaleString("en-US")}</span>/q for {totalQ}q · total <span className="font-mono">₹{order.total_cost_cr.toLocaleString("en-US")}</span>
          </p>
          <p className="opacity-60 italic">
            No money leaves treasury until delivery begins.
          </p>
        </div>
      ) : order.cancelled ? (
        <div className="text-[11px] opacity-80 pt-1 space-y-0.5">
          <p>Delivered before cancel: <span className="font-semibold">{order.delivered}</span> airframe{order.delivered === 1 ? "" : "s"}</p>
          <p>Total paid: <span className="font-mono">₹{paidSoFar.toLocaleString("en-US")}</span></p>
        </div>
      ) : isCompleted ? (
        <div className="text-[11px] opacity-80 pt-1">
          ✓ Fully delivered · total paid <span className="font-mono">₹{order.total_cost_cr.toLocaleString("en-US")}</span>
        </div>
      ) : (
        <div className="grid grid-cols-2 gap-x-2 gap-y-0.5 text-[11px] opacity-80 pt-1">
          <span>Per-Q: <span className="font-mono">₹{perQ.toLocaleString("en-US")}</span></span>
          <span>Total: <span className="font-mono">₹{order.total_cost_cr.toLocaleString("en-US")}</span></span>
          <span>Paid: <span className="font-mono">₹{paidSoFar.toLocaleString("en-US")}</span></span>
          <span>Remaining: <span className="font-mono">₹{remainingCost.toLocaleString("en-US")}</span></span>
        </div>
      )}

      {cancellable && !confirming && (
        <button
          type="button"
          onClick={() => setConfirming(true)}
          className="text-[11px] text-rose-300 hover:text-rose-200 underline mt-1"
        >Cancel order</button>
      )}

      {cancellable && confirming && (
        <div className="border border-rose-800 rounded p-2 bg-rose-900/20 text-[11px] space-y-2 mt-1">
          <div className="text-rose-200">
            Cancelling stops all future deliveries.
            <strong className="block mt-1">
              You keep {order.delivered} delivered airframe{order.delivered === 1 ? "" : "s"}.
              Remaining {order.quantity - order.delivered} airframes are forfeited.
            </strong>
            <span className="block mt-1">
              Saves ~₹{remainingCost.toLocaleString("en-US")} cr over {remainingQ} quarter{remainingQ === 1 ? "" : "s"} on the Acquisitions bucket.
            </span>
          </div>
          <div className="flex gap-2">
            <button
              type="button"
              onClick={() => { onCancel?.(order.id); setConfirming(false); }}
              className="text-xs px-2 py-1 rounded bg-rose-700 hover:bg-rose-600 text-white"
            >Confirm cancel</button>
            <button
              type="button"
              onClick={() => setConfirming(false)}
              className="text-xs px-2 py-1 rounded bg-slate-800 hover:bg-slate-700"
            >Keep order</button>
          </div>
        </div>
      )}
    </div>
  );
}

function computeDelivery(
  currentYear: number, currentQuarter: number,
  firstDeliveryQ: number, focQ: number,
) {
  const firstDeliveryYear = currentYear + Math.floor((currentQuarter - 1 + firstDeliveryQ) / 4);
  const firstDeliveryQuarter = ((currentQuarter - 1 + firstDeliveryQ) % 4) + 1;
  const focYear = currentYear + Math.floor((currentQuarter - 1 + focQ) / 4);
  const focQuarter = ((currentQuarter - 1 + focQ) % 4) + 1;
  return { firstDeliveryYear, firstDeliveryQuarter, focYear, focQuarter };
}

export function MissileBatchOfferCard({
  missile, unitCostCr, currentYear, currentQuarter, bases, onSign, disabled,
  initialBaseId, initialQty, highlighted, missileStocks = [],
}: {
  missile: MissileUnlock;
  unitCostCr: number;
  currentYear: number;
  currentQuarter: number;
  bases: BaseMarker[];
  onSign: (p: AcquisitionCreatePayload) => void;
  disabled?: boolean;
  initialBaseId?: number;
  initialQty?: number;
  highlighted?: boolean;
  /** All missile stocks for the campaign — used to surface current depot count per base. */
  missileStocks?: MissileStock[];
}) {
  const ref = useRef<HTMLDivElement | null>(null);
  useEffect(() => {
    if (highlighted && ref.current) {
      ref.current.scrollIntoView({ behavior: "smooth", block: "center" });
    }
  }, [highlighted]);
  const [qty, setQty] = useState<number>(initialQty && initialQty > 0 ? initialQty : 50);
  const [baseId, setBaseId] = useState<number | "">(
    typeof initialBaseId === "number" ? initialBaseId : "",
  );
  const [infoOpen, setInfoOpen] = useState(false);
  const [splitMode, setSplitMode] = useState(false);
  const firstDeliveryQ = 2;
  const focQ = 4;
  const dates = computeDelivery(currentYear, currentQuarter, firstDeliveryQ, focQ);
  const totalCost = qty * unitCostCr;
  const splitBaseCount = bases.length;
  const perBase = splitBaseCount > 0 ? Math.floor(qty / splitBaseCount) : 0;
  const splitRemainder = splitBaseCount > 0 ? qty - perBase * splitBaseCount : 0;
  const canSign = unitCostCr > 0 && (
    splitMode
      ? splitBaseCount > 0 && perBase > 0
      : typeof baseId === "number"
  );
  const totalQuarters = Math.max(
    1,
    (dates.focYear - dates.firstDeliveryYear) * 4 +
      (dates.focQuarter - dates.firstDeliveryQuarter) + 1,
  );
  const perQ = Math.ceil(qty / totalQuarters);

  const sign = () => {
    const basePayload = {
      kind: "missile_batch" as const,
      platform_id: missile.target_id,
      first_delivery_year: dates.firstDeliveryYear,
      first_delivery_quarter: dates.firstDeliveryQuarter,
      foc_year: dates.focYear,
      foc_quarter: dates.focQuarter,
    };
    if (splitMode) {
      // Fire one missile_batch order per eligible base. First N bases get an
      // extra round if qty doesn't divide cleanly, so the full total ships.
      bases.forEach((b, idx) => {
        const thisQty = perBase + (idx < splitRemainder ? 1 : 0);
        if (thisQty <= 0) return;
        onSign({
          ...basePayload,
          quantity: thisQty,
          total_cost_cr: thisQty * unitCostCr,
          preferred_base_id: b.id,
        });
      });
      return;
    }
    if (typeof baseId !== "number") return;
    onSign({
      ...basePayload,
      quantity: qty,
      total_cost_cr: totalCost,
      preferred_base_id: baseId,
    });
  };

  return (
    <div
      ref={ref}
      className={[
        "rounded-lg p-3 space-y-2 border",
        highlighted
          ? "bg-amber-900/30 border-amber-500 ring-2 ring-amber-400/70 animate-pulse"
          : "bg-slate-900/50 border-slate-800",
      ].join(" ")}
    >
      <p className="flex items-baseline justify-between gap-2">
        <span className="text-sm font-semibold flex items-center gap-1.5">
          {missile.name}
          <InfoButton onClick={() => setInfoOpen(true)} ariaLabel={`${missile.name} info`} />
        </span>
        <span className="text-[11px] flex items-center gap-1 flex-shrink-0">
          <span>{flagFor(WEAPON_ORIGIN[missile.target_id])}</span>
          <span className="opacity-60">missile batch</span>
        </span>
      </p>
      <WeaponInfo
        open={infoOpen}
        onClose={() => setInfoOpen(false)}
        name={missile.name}
        weaponClass={missile.weapon_class}
        nezKm={missile.nez_km}
        maxRangeKm={missile.max_range_km}
        unitCostCr={unitCostCr}
      />
      <div className="text-xs opacity-70">
        ₹{unitCostCr.toLocaleString("en-US")} cr/unit • NEZ {missile.nez_km} km
      </div>
      <div className="flex items-center gap-2">
        <span className="text-xs opacity-60">Quantity</span>
        <Stepper
          value={qty}
          onChange={setQty}
          step={10}
          min={10}
          max={500}
          formatValue={(v) => String(v)}
          ariaLabel={`${missile.name} quantity`}
        />
      </div>
      <label className="flex items-center gap-2 text-xs">
        <input
          type="checkbox"
          checked={splitMode}
          onChange={(e) => setSplitMode(e.target.checked)}
          aria-label={`${missile.name} split across bases`}
        />
        <span>Split evenly across {splitBaseCount} bases (~{perBase}/base)</span>
      </label>
      {!splitMode && (
        <label className="flex flex-col gap-1 text-xs">
          <span className="opacity-60">Deliver to</span>
          <select
            value={baseId === "" ? "" : String(baseId)}
            onChange={(e) => {
              const v = e.target.value;
              setBaseId(v === "" ? "" : Number(v));
            }}
            className="w-full min-w-0 bg-slate-800 border border-slate-700 rounded px-2 py-1 text-xs"
            aria-label={`${missile.name} delivery base`}
          >
            <option value="">Pick a base…</option>
            {bases.map((b) => {
              const s = missileStocks.find(
                (x) => x.base_id === b.id && x.weapon_id === missile.target_id,
              );
              const label = s
                ? `${shortBaseName(b.name)} — depot ${s.stock}`
                : `${shortBaseName(b.name)} — depot 0`;
              return <option key={b.id} value={b.id}>{label}</option>;
            })}
          </select>
        </label>
      )}
      {splitMode && (
        <div className="text-xs rounded border px-2 py-1.5 bg-sky-950/30 border-sky-800 text-sky-100">
          Fires <span className="font-semibold">{splitBaseCount}</span> orders —{" "}
          {splitRemainder === 0
            ? <><span className="font-semibold">{perBase}</span> rounds each.</>
            : <>first {splitRemainder} get <span className="font-semibold">{perBase + 1}</span>, rest get <span className="font-semibold">{perBase}</span>.</>}
          <div className="text-[10px] opacity-80 mt-0.5">Pick a single base for focused deliveries.</div>
        </div>
      )}
      {!splitMode && typeof baseId === "number" && (() => {
        const current = missileStocks.find(
          (s) => s.base_id === baseId && s.weapon_id === missile.target_id,
        )?.stock ?? 0;
        const baseName = shortBaseName(bases.find((b) => b.id === baseId)?.name ?? "");
        const low = current === 0;
        return (
          <div className={[
            "text-xs rounded border px-2 py-1.5",
            low ? "bg-rose-950/30 border-rose-800 text-rose-200"
                : "bg-slate-800/40 border-slate-700 text-slate-200",
          ].join(" ")}>
            Current depot at <span className="font-semibold">{baseName}</span>:{" "}
            <span className="font-semibold">{current}</span>
            {" → after delivery: "}
            <span className="font-semibold">{current + qty}</span>
            {low && <div className="text-[10px] opacity-80 mt-0.5">Empty depot — squadron cannot fire this weapon until delivery begins.</div>}
          </div>
        );
      })()}
      <div className="text-xs opacity-70">
        Total: <span className="font-semibold">₹{totalCost.toLocaleString("en-US")} cr</span>
        {" • Delivery "}{dates.firstDeliveryYear}-Q{dates.firstDeliveryQuarter}
        {" → FOC "}{dates.focYear}-Q{dates.focQuarter}
      </div>
      <div className="text-[10px] opacity-60">
        ≈{perQ} {missile.target_id.toLowerCase()}/q across {totalQuarters} quarter{totalQuarters === 1 ? "" : "s"}
      </div>
      <CommitHoldButton
        label={`Hold to sign ₹${totalCost.toLocaleString("en-US")}`}
        holdMs={1800}
        disabled={disabled || !canSign}
        onCommit={sign}
        className="w-full"
      />
    </div>
  );
}

export function ADBatteryOfferCard({
  system, currentYear, currentQuarter, bases, onSign, disabled, highlighted,
}: {
  system: ADSystemUnlock;
  currentYear: number;
  currentQuarter: number;
  bases: BaseMarker[];
  onSign: (p: AcquisitionCreatePayload) => void;
  disabled?: boolean;
  highlighted?: boolean;
}) {
  const ref = useRef<HTMLDivElement | null>(null);
  useEffect(() => {
    if (highlighted && ref.current) {
      ref.current.scrollIntoView({ behavior: "smooth", block: "center" });
    }
  }, [highlighted]);
  const [baseId, setBaseId] = useState<number | "">("");
  const [infoOpen, setInfoOpen] = useState(false);
  const startingStock = AD_STARTING_INTERCEPTORS[system.target_id] ?? 16;
  const perShot = AD_INTERCEPTOR_COST[system.target_id] ?? 5;
  const totalCost = (system.install_cost_cr ?? 0) + (startingStock * perShot);
  const deliveryQ = AD_LONG_DELIVERY.has(system.target_id) ? 8 : 4;
  const dates = computeDelivery(currentYear, currentQuarter, Math.max(1, deliveryQ - 2), deliveryQ);

  const canSign = typeof baseId === "number";
  const sign = () => {
    if (typeof baseId !== "number") return;
    onSign({
      kind: "ad_battery",
      platform_id: system.target_id,
      quantity: 1,
      first_delivery_year: dates.firstDeliveryYear,
      first_delivery_quarter: dates.firstDeliveryQuarter,
      foc_year: dates.focYear,
      foc_quarter: dates.focQuarter,
      total_cost_cr: totalCost,
      preferred_base_id: baseId,
    });
  };

  return (
    <div
      ref={ref}
      className={[
        "rounded-lg p-3 space-y-2 border",
        highlighted
          ? "bg-amber-900/30 border-amber-500 ring-2 ring-amber-400/70 animate-pulse"
          : "bg-slate-900/50 border-slate-800",
      ].join(" ")}
    >
      <p className="flex items-baseline justify-between gap-2">
        <span className="text-sm font-semibold flex items-center gap-1.5">
          {system.name}
          <InfoButton onClick={() => setInfoOpen(true)} ariaLabel={`${system.name} info`} />
        </span>
        <span className="text-[11px] flex items-center gap-1 flex-shrink-0">
          <span>{flagFor(AD_SYSTEM_ORIGIN[system.target_id])}</span>
          <span className="opacity-60">AD battery</span>
        </span>
      </p>
      <ADSystemInfo
        open={infoOpen}
        onClose={() => setInfoOpen(false)}
        name={system.name}
        coverageKm={system.coverage_km}
        maxPk={system.max_pk}
        installCostCr={system.install_cost_cr}
        interceptorCostCr={perShot}
        description={system.description}
      />
      <div className="text-xs opacity-70">
        Coverage {system.coverage_km} km • max Pk {system.max_pk.toFixed(2)}
      </div>
      <div className="text-xs opacity-70">
        Install: ₹{(system.install_cost_cr ?? 0).toLocaleString("en-US")} cr
        {" + "}{startingStock} interceptors × ₹{perShot} cr
      </div>
      <label className="flex flex-col gap-1 text-xs">
        <span className="opacity-60">Install at</span>
        <select
          value={baseId === "" ? "" : String(baseId)}
          onChange={(e) => {
            const v = e.target.value;
            setBaseId(v === "" ? "" : Number(v));
          }}
          className="w-full min-w-0 bg-slate-800 border border-slate-700 rounded px-2 py-1 text-xs"
          aria-label={`${system.name} install base`}
        >
          <option value="">Pick a base…</option>
          {bases.map((b) => (
            <option key={b.id} value={b.id}>{shortBaseName(b.name)}</option>
          ))}
        </select>
      </label>
      <div className="text-xs opacity-70">
        Total: <span className="font-semibold">₹{totalCost.toLocaleString("en-US")} cr</span>
        {" • Delivery "}{dates.firstDeliveryYear}-Q{dates.firstDeliveryQuarter}
        {" → FOC "}{dates.focYear}-Q{dates.focQuarter}
      </div>
      <div className="text-[10px] opacity-60">
        Full battery + {startingStock} interceptors delivered at FOC ({dates.focYear}-Q{dates.focQuarter}). Treasury billed pro-rata each quarter.
      </div>
      <CommitHoldButton
        label={`Hold to sign ₹${totalCost.toLocaleString("en-US")}`}
        holdMs={1800}
        disabled={disabled || !canSign}
        onCommit={sign}
        className="w-full"
      />
    </div>
  );
}

const AD_SYSTEM_DISPLAY: Record<string, string> = {
  s400: "S-400 Triumf",
  long_range_sam: "Indigenous Long-Range SAM",
  project_kusha: "Project Kusha BMD",
  mrsam_air: "MR-SAM (Barak-8)",
  akash_ng: "Akash-NG",
  qrsam: "QRSAM",
  vshorads: "VSHORADS",
};

export function ADReloadOfferCard({
  systemId, batteries, baseNameById, currentYear, currentQuarter, onSign, disabled,
  initialTargetBatteryId, highlighted,
}: {
  systemId: string;
  batteries: ADBattery[];  // all batteries of this system type
  baseNameById: Record<number, string>;
  currentYear: number;
  currentQuarter: number;
  onSign: (p: AcquisitionCreatePayload) => void;
  disabled?: boolean;
  initialTargetBatteryId?: number;
  highlighted?: boolean;
}) {
  const ref = useRef<HTMLDivElement | null>(null);
  useEffect(() => {
    if (highlighted && ref.current) {
      ref.current.scrollIntoView({ behavior: "smooth", block: "center" });
    }
  }, [highlighted]);
  const capacity = AD_STARTING_INTERCEPTORS[systemId] ?? 16;
  const perShot = AD_INTERCEPTOR_COST[systemId] ?? 5;
  const displayName = AD_SYSTEM_DISPLAY[systemId] ?? systemId;

  // Default target = battery with the lowest stock (most needs reload).
  const sortedByNeed = [...batteries].sort(
    (a, b) => (a.interceptor_stock ?? 0) - (b.interceptor_stock ?? 0),
  );
  const initialTarget =
    typeof initialTargetBatteryId === "number" &&
    batteries.some((b) => b.id === initialTargetBatteryId)
      ? initialTargetBatteryId
      : (sortedByNeed[0]?.id ?? batteries[0]?.id ?? 0);
  const [targetId, setTargetId] = useState<number>(initialTarget);
  const target = batteries.find((b) => b.id === targetId);
  const currentStock = target?.interceptor_stock ?? 0;
  const maxRefill = Math.max(1, capacity - currentStock);
  const defaultQty = Math.min(maxRefill, Math.max(4, Math.floor(capacity / 2)));
  const [qty, setQty] = useState<number>(defaultQty);
  const [infoOpen, setInfoOpen] = useState(false);
  const dates = computeDelivery(currentYear, currentQuarter, 1, 2);
  const totalCost = qty * perShot;
  const totalQuarters = Math.max(
    1,
    (dates.focYear - dates.firstDeliveryYear) * 4 +
      (dates.focQuarter - dates.firstDeliveryQuarter) + 1,
  );
  const perQRate = Math.ceil(qty / totalQuarters);

  // Aggregate stock across all batteries of this system
  const totalCurrent = batteries.reduce((a, b) => a + (b.interceptor_stock ?? 0), 0);
  const totalCapacity = batteries.length * capacity;

  const sign = () => {
    if (!target) return;
    onSign({
      kind: "ad_reload",
      platform_id: systemId,
      quantity: qty,
      first_delivery_year: dates.firstDeliveryYear,
      first_delivery_quarter: dates.firstDeliveryQuarter,
      foc_year: dates.focYear,
      foc_quarter: dates.focQuarter,
      total_cost_cr: totalCost,
      target_battery_id: target.id,
    });
  };

  return (
    <div
      ref={ref}
      className={[
        "rounded-lg p-3 space-y-2 border",
        highlighted
          ? "bg-amber-900/30 border-amber-500 ring-2 ring-amber-400/70 animate-pulse"
          : "bg-slate-900/50 border-slate-800",
      ].join(" ")}
    >
      <p className="flex items-baseline justify-between gap-2">
        <span className="text-sm font-semibold flex items-center gap-1.5">
          {displayName}
          <InfoButton onClick={() => setInfoOpen(true)} ariaLabel={`${displayName} info`} />
        </span>
        <span className="text-[11px] flex items-center gap-1 flex-shrink-0">
          <span>{flagFor(AD_SYSTEM_ORIGIN[systemId])}</span>
          <span className="opacity-60">AD reload</span>
        </span>
      </p>
      <ADSystemInfo
        open={infoOpen}
        onClose={() => setInfoOpen(false)}
        name={displayName}
        interceptorCostCr={perShot}
      />
      <div className="text-xs opacity-70">
        ₹{perShot.toLocaleString("en-US")} cr/interceptor · fleet: {totalCurrent}/{totalCapacity} across {batteries.length} {batteries.length === 1 ? "battery" : "batteries"}
      </div>
      {batteries.length > 1 && (
        <label className="flex flex-col gap-1 text-xs">
          <span className="opacity-60">Target battery</span>
          <select
            value={targetId}
            onChange={(e) => setTargetId(Number(e.target.value))}
            className="w-full min-w-0 bg-slate-800 border border-slate-700 rounded px-2 py-1 text-xs"
            aria-label={`${displayName} target battery`}
          >
            {sortedByNeed.map((b) => {
              const stock = b.interceptor_stock ?? 0;
              const pct = capacity > 0 ? stock / capacity : 0;
              const indicator = pct >= 0.5 ? "✓" : pct > 0 ? "⚠" : "✗";
              const baseShort = baseNameById[b.base_id]
                ? shortBaseName(baseNameById[b.base_id])
                : `base ${b.base_id}`;
              return (
                <option key={b.id} value={b.id}>
                  {indicator} {baseShort} ({stock}/{capacity})
                </option>
              );
            })}
          </select>
        </label>
      )}
      {batteries.length === 1 && target && (
        <div className="text-[11px] opacity-70">
          Target: <span className="font-semibold">
            {baseNameById[target.base_id] ? shortBaseName(baseNameById[target.base_id]) : `base ${target.base_id}`}
          </span>
          {" · current "}{currentStock}/{capacity}
        </div>
      )}
      <div className="flex items-center gap-2">
        <span className="text-xs opacity-60">Reload qty</span>
        <Stepper
          value={qty}
          onChange={setQty}
          step={4}
          min={1}
          max={capacity * 2}
          formatValue={(v) => String(v)}
          ariaLabel={`${displayName} reload quantity`}
        />
      </div>
      <div className="text-xs opacity-70">
        Total: <span className="font-semibold">₹{totalCost.toLocaleString("en-US")} cr</span>
        {" • Delivery "}{dates.firstDeliveryYear}-Q{dates.firstDeliveryQuarter}
        {" → FOC "}{dates.focYear}-Q{dates.focQuarter}
      </div>
      <div className="text-[10px] opacity-60">
        ≈{perQRate}/q across {totalQuarters} quarter{totalQuarters === 1 ? "" : "s"}
      </div>
      <CommitHoldButton
        label={`Hold to sign ₹${totalCost.toLocaleString("en-US")}`}
        holdMs={1800}
        disabled={disabled || !target}
        onCommit={sign}
        className="w-full"
      />
    </div>
  );
}

type OfferCategory = "aircraft" | "missiles" | "ad_systems" | "reloads";

type OrderGroupKey = string;

function groupKey(o: AcquisitionOrder): OrderGroupKey {
  const kind = o.kind ?? "platform";
  const status =
    o.cancelled ? "c"
    : o.delivered >= o.quantity ? "d"
    : "a";
  return [
    kind, o.platform_id,
    o.first_delivery_year, o.first_delivery_quarter,
    o.foc_year, o.foc_quarter,
    status,
  ].join("|");
}

function OrdersList({
  orders, byId, bases, currentYear, currentQuarter, onCancel,
}: {
  orders: AcquisitionOrder[];
  byId: Record<string, Platform>;
  bases: BaseMarker[];
  currentYear: number;
  currentQuarter: number;
  onCancel?: (id: number) => void;
}) {
  const groups = new Map<OrderGroupKey, AcquisitionOrder[]>();
  for (const o of orders) {
    const k = groupKey(o);
    const arr = groups.get(k);
    if (arr) arr.push(o);
    else groups.set(k, [o]);
  }

  // Render in insertion order (first seen per group).
  return (
    <>
      {Array.from(groups.values()).map((group) =>
        group.length === 1 ? (
          <SingleOrderRow
            key={group[0].id}
            order={group[0]}
            byId={byId}
            bases={bases}
            currentYear={currentYear}
            currentQuarter={currentQuarter}
            onCancel={onCancel}
          />
        ) : (
          <OrderGroup
            key={`grp-${group[0].id}`}
            group={group}
            byId={byId}
            bases={bases}
            currentYear={currentYear}
            currentQuarter={currentQuarter}
            onCancel={onCancel}
          />
        ),
      )}
    </>
  );
}

function orderMeta(o: AcquisitionOrder, byId: Record<string, Platform>, bases: BaseMarker[]) {
  const kind = o.kind ?? "platform";
  let origin: string | undefined;
  if (kind === "platform") origin = byId[o.platform_id]?.origin;
  else if (kind === "missile_batch") origin = WEAPON_ORIGIN[o.platform_id];
  else if (kind === "ad_battery" || kind === "ad_reload") origin = AD_SYSTEM_ORIGIN[o.platform_id];
  const deliveryBaseId = o.preferred_base_id ?? null;
  const deliveryBaseName = deliveryBaseId
    ? shortBaseName(bases.find((b) => b.id === deliveryBaseId)?.name ?? "")
    : (kind === "platform" ? "Best-fit base (auto)" : "");
  return {
    kind,
    originFlag: flagFor(origin),
    platformName: byId[o.platform_id]?.name ?? o.platform_id,
    deliveryBaseName,
  };
}

function SingleOrderRow({
  order, byId, bases, currentYear, currentQuarter, onCancel,
}: {
  order: AcquisitionOrder;
  byId: Record<string, Platform>;
  bases: BaseMarker[];
  currentYear: number;
  currentQuarter: number;
  onCancel?: (id: number) => void;
}) {
  const m = orderMeta(order, byId, bases);
  return (
    <TimelineBar
      order={order}
      platformName={m.platformName}
      originFlag={m.originFlag}
      currentYear={currentYear}
      currentQuarter={currentQuarter}
      onCancel={onCancel}
      deliveryBaseName={m.deliveryBaseName || undefined}
    />
  );
}

function OrderGroup({
  group, byId, bases, currentYear, currentQuarter, onCancel,
}: {
  group: AcquisitionOrder[];
  byId: Record<string, Platform>;
  bases: BaseMarker[];
  currentYear: number;
  currentQuarter: number;
  onCancel?: (id: number) => void;
}) {
  const [expanded, setExpanded] = useState(false);
  const first = group[0];
  const m = orderMeta(first, byId, bases);
  const totalQty = group.reduce((a, o) => a + o.quantity, 0);
  const totalDelivered = group.reduce((a, o) => a + o.delivered, 0);
  const totalCost = group.reduce((a, o) => a + o.total_cost_cr, 0);
  const baseCount = new Set(
    group.map((o) => o.preferred_base_id).filter((x): x is number => typeof x === "number"),
  ).size;

  const status =
    first.cancelled ? { label: "CANCELLED", cls: "bg-rose-900/50 text-rose-200" }
    : totalDelivered >= totalQty ? { label: "COMPLETE", cls: "bg-emerald-900/50 text-emerald-200" }
    : currentYear * 4 + currentQuarter - 1 < first.first_delivery_year * 4 + first.first_delivery_quarter - 1
      ? { label: "SIGNED", cls: "bg-sky-900/50 text-sky-200" }
      : { label: "DELIVERING", cls: "bg-amber-900/50 text-amber-200" };

  return (
    <div className="bg-slate-900/40 border border-slate-800 rounded-lg">
      <button
        type="button"
        onClick={() => setExpanded((v) => !v)}
        className="w-full p-3 text-left hover:bg-slate-900/60 rounded-lg"
      >
        <div className="flex items-baseline justify-between gap-2 text-xs">
          <div className="min-w-0 flex-1 flex items-baseline gap-2">
            <span className="text-[10px] opacity-60">{expanded ? "▼" : "▶"}</span>
            {m.originFlag && <span>{m.originFlag}</span>}
            <span className="font-semibold truncate">{m.platformName}</span>
            <span className={`text-[10px] px-1.5 py-0.5 rounded ${status.cls}`}>{status.label}</span>
          </div>
          <span className="opacity-70 flex-shrink-0 font-mono">
            {totalDelivered}/{totalQty}
          </span>
        </div>
        <div className="text-[10px] opacity-70 mt-1">
          {group.length} orders across {baseCount || group.length} base{baseCount === 1 ? "" : "s"} ·
          ₹{totalCost.toLocaleString("en-US")} cr total ·
          delivery {first.first_delivery_year}-Q{first.first_delivery_quarter} → FOC {first.foc_year}-Q{first.foc_quarter}
        </div>
      </button>
      {expanded && (
        <div className="px-3 pb-3 space-y-2 border-t border-slate-800 pt-2">
          {group.map((o) => (
            <SingleOrderRow
              key={o.id}
              order={o}
              byId={byId}
              bases={bases}
              currentYear={currentYear}
              currentQuarter={currentQuarter}
              onCancel={onCancel}
            />
          ))}
        </div>
      )}
    </div>
  );
}

export function AcquisitionPipeline({
  platforms, orders, currentYear, currentQuarter, onSign, onCancel, disabled,
  rdCatalog = [], rdActive = [], bases = [], initialView, focusPlatformId,
  focusAdId, adBatteries = [], armoryUnlocks = null, weaponsById = {},
  missileStocks = [],
  initialOfferCat: initialOfferCatProp, focusMissile, focusBaseId, focusQty,
  focusAdSystem, focusBatteryId,
}: AcquisitionPipelineProps) {
  const byId = Object.fromEntries(platforms.map((p) => [p.id, p]));
  const [tab, setTab] = useState<"orders" | "offers">(
    initialView ?? (orders.length > 0 ? "orders" : "offers"),
  );
  // Inner Offers category — explicit prop wins, else deep-link hints auto-jump tabs.
  const initialOfferCat: OfferCategory =
    initialOfferCatProp ??
    (focusPlatformId ? "aircraft"
      : focusAdId ? "ad_systems"
      : focusMissile ? "missiles"
      : focusBatteryId || focusAdSystem ? "reloads"
      : "aircraft");
  const [offerCat, setOfferCat] = useState<OfferCategory>(initialOfferCat);
  useEffect(() => {
    if (initialOfferCatProp) setOfferCat(initialOfferCatProp);
    else if (focusPlatformId) setOfferCat("aircraft");
    else if (focusAdId) setOfferCat("ad_systems");
    else if (focusMissile) setOfferCat("missiles");
    else if (focusBatteryId || focusAdSystem) setOfferCat("reloads");
  }, [initialOfferCatProp, focusPlatformId, focusAdId, focusMissile, focusBatteryId, focusAdSystem]);
  const [showCompleted, setShowCompleted] = useState(false);
  // Clear the highlight after a few seconds so it doesn't pulse forever.
  const [focusId, setFocusId] = useState<string | undefined>(focusPlatformId);
  useEffect(() => {
    if (!focusPlatformId) return;
    setFocusId(focusPlatformId);
    const t = setTimeout(() => setFocusId(undefined), 4000);
    return () => clearTimeout(t);
  }, [focusPlatformId]);
  const [focusAd, setFocusAd] = useState<string | undefined>(focusAdId);
  useEffect(() => {
    if (!focusAdId) return;
    setFocusAd(focusAdId);
    const t = setTimeout(() => setFocusAd(undefined), 4000);
    return () => clearTimeout(t);
  }, [focusAdId]);

  // R&D-unlocked platforms: their R&D completion is the real "intro", so
  // we bypass the intro_year gate for them.
  const rdUnlockedPlatformIds = useMemo(() => {
    const completedProgramIds = new Set(
      rdActive.filter((a) => a.status === "completed").map((a) => a.program_id),
    );
    const unlocked = new Set<string>();
    for (const prog of rdCatalog) {
      const u = prog.unlocks;
      if (!u || !u.target_id) continue;
      if (u.kind !== "platform" && u.kind !== "strike_platform" && u.kind !== "isr_drone") continue;
      if (completedProgramIds.has(prog.id)) unlocked.add(u.target_id);
    }
    return unlocked;
  }, [rdCatalog, rdActive]);

  // Platforms gated by an incomplete R&D program.
  const lockedPlatformIds = useMemo(() => {
    const completedProgramIds = new Set(
      rdActive.filter((a) => a.status === "completed").map((a) => a.program_id),
    );
    const locked = new Set<string>();
    for (const prog of rdCatalog) {
      const u = prog.unlocks;
      if (!u || !u.target_id) continue;
      if (u.kind !== "platform" && u.kind !== "strike_platform" && u.kind !== "isr_drone") continue;
      if (completedProgramIds.has(prog.id)) continue;
      locked.add(u.target_id);
    }
    return locked;
  }, [rdCatalog, rdActive]);

  const availablePlatforms = useMemo(() => {
    return platforms.filter((p) => {
      if (lockedPlatformIds.has(p.id)) return false;
      if (rdUnlockedPlatformIds.has(p.id)) return true;
      if (p.intro_year && p.intro_year > currentYear) return false;
      return true;
    });
  }, [platforms, lockedPlatformIds, rdUnlockedPlatformIds, currentYear]);

  const lockedCount = platforms.length - availablePlatforms.length;

  const completedOrderCount = orders.filter((o) => !o.cancelled && o.delivered >= o.quantity).length;
  const visibleOrders = useMemo(() => {
    if (showCompleted) return orders;
    return orders.filter((o) => o.cancelled || o.delivered < o.quantity);
  }, [orders, showCompleted]);

  return (
    <div className="space-y-4">
      <div className="flex gap-1 bg-slate-900 border border-slate-800 rounded-lg p-1">
        <button
          type="button"
          onClick={() => setTab("orders")}
          className={`flex-1 px-3 py-1.5 text-xs font-semibold rounded ${tab === "orders" ? "bg-amber-600 text-slate-900" : "text-slate-300"}`}
        >
          Active Orders ({orders.length - (showCompleted ? 0 : completedOrderCount)})
        </button>
        <button
          type="button"
          onClick={() => setTab("offers")}
          className={`flex-1 px-3 py-1.5 text-xs font-semibold rounded ${tab === "offers" ? "bg-amber-600 text-slate-900" : "text-slate-300"}`}
        >
          Offers ({availablePlatforms.length})
        </button>
      </div>

      {tab === "orders" ? (
        <section>
          {completedOrderCount > 0 && (
            <label className="flex items-center gap-2 text-[11px] opacity-70 mb-2 cursor-pointer select-none">
              <input
                type="checkbox"
                checked={showCompleted}
                onChange={(e) => setShowCompleted(e.target.checked)}
              />
              Show {completedOrderCount} completed
            </label>
          )}
          {visibleOrders.length === 0 ? (
            <p className="text-xs opacity-60 py-6 text-center">
              {orders.length === 0
                ? <>No active orders. Open <span className="font-semibold">Offers</span> to sign a new procurement.</>
                : <>All orders delivered. Tick <span className="font-semibold">Show {completedOrderCount} completed</span> to review.</>}
            </p>
          ) : (
            <div className="overflow-x-auto">
              <div className="space-y-3 min-w-min">
                <OrdersList
                  orders={visibleOrders}
                  byId={byId}
                  bases={bases}
                  currentYear={currentYear}
                  currentQuarter={currentQuarter}
                  onCancel={onCancel}
                />
              </div>
            </div>
          )}
        </section>
      ) : (
        <section className="space-y-3">
          {(() => {
            const counts: Record<OfferCategory, number> = {
              aircraft: availablePlatforms.length,
              missiles: armoryUnlocks?.missiles.length ?? 0,
              ad_systems: armoryUnlocks?.ad_systems.length ?? 0,
              reloads: new Set(adBatteries.map((b) => b.system_id)).size,
            };
            const catTabs: Array<{ k: OfferCategory; label: string }> = [
              { k: "aircraft", label: "Aircraft" },
              { k: "missiles", label: "Missiles" },
              { k: "ad_systems", label: "AD Systems" },
              { k: "reloads", label: "Reloads" },
            ];
            return (
              <div className="flex gap-1 bg-slate-900 border border-slate-800 rounded-lg p-1 overflow-x-auto">
                {catTabs.map((ct) => (
                  <button
                    key={ct.k}
                    type="button"
                    onClick={() => setOfferCat(ct.k)}
                    className={[
                      "flex-shrink-0 px-2.5 py-1.5 text-xs font-semibold rounded whitespace-nowrap",
                      offerCat === ct.k ? "bg-amber-600 text-slate-900" : "text-slate-300",
                    ].join(" ")}
                  >
                    {ct.label} ({counts[ct.k]})
                  </button>
                ))}
              </div>
            );
          })()}

          {offerCat === "aircraft" && (
            <div className="space-y-2">
              {lockedCount > 0 && (
                <p className="text-[11px] opacity-60">
                  {lockedCount} platform{lockedCount === 1 ? "" : "s"} hidden — {lockedCount === 1 ? "it's" : "they're"} gated by in-progress R&D or not yet introduced.
                </p>
              )}
              {availablePlatforms.length === 0 ? (
                <p className="text-xs opacity-60 py-6 text-center">
                  No platforms available to procure right now.
                </p>
              ) : (
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                  {availablePlatforms.map((p) => (
                    <OfferCard
                      key={p.id}
                      platform={p}
                      currentYear={currentYear}
                      currentQuarter={currentQuarter}
                      onSign={onSign}
                      disabled={disabled}
                      bases={bases}
                      highlighted={focusId === p.id}
                    />
                  ))}
                </div>
              )}
            </div>
          )}

          {offerCat === "missiles" && (
            (!armoryUnlocks || armoryUnlocks.missiles.length === 0) ? (
              <p className="text-xs opacity-60 py-6 text-center">
                No missiles unlocked yet. Complete R&D programs to unlock.
              </p>
            ) : (
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                {armoryUnlocks.missiles.map((m) => {
                  const unit = weaponsById[m.target_id]?.unit_cost_cr ?? 0;
                  const isFocus = focusMissile === m.target_id;
                  return (
                    <MissileBatchOfferCard
                      key={m.target_id}
                      missile={m}
                      unitCostCr={unit}
                      currentYear={currentYear}
                      currentQuarter={currentQuarter}
                      bases={bases}
                      onSign={onSign}
                      disabled={disabled}
                      missileStocks={missileStocks}
                      initialBaseId={isFocus ? focusBaseId : undefined}
                      initialQty={isFocus ? focusQty : undefined}
                      highlighted={isFocus}
                    />
                  );
                })}
              </div>
            )
          )}

          {offerCat === "ad_systems" && (
            (!armoryUnlocks || armoryUnlocks.ad_systems.length === 0) ? (
              <p className="text-xs opacity-60 py-6 text-center">
                No AD systems unlocked yet.
              </p>
            ) : (
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                {armoryUnlocks.ad_systems.map((s) => (
                  <ADBatteryOfferCard
                    key={s.target_id}
                    system={s}
                    currentYear={currentYear}
                    currentQuarter={currentQuarter}
                    bases={bases}
                    onSign={onSign}
                    disabled={disabled}
                    highlighted={focusAd === s.target_id}
                  />
                ))}
              </div>
            )
          )}

          {offerCat === "reloads" && (() => {
            if (adBatteries.length === 0) {
              return (
                <p className="text-xs opacity-60 py-6 text-center">
                  No installed batteries to reload.
                </p>
              );
            }
            const bySystem: Record<string, ADBattery[]> = {};
            for (const b of adBatteries) (bySystem[b.system_id] ??= []).push(b);
            const baseNameById = Object.fromEntries(bases.map((b) => [b.id, b.name]));
            return (
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                {Object.entries(bySystem).map(([systemId, bats]) => {
                  const batteryInGroup =
                    typeof focusBatteryId === "number" &&
                    bats.some((b) => b.id === focusBatteryId);
                  const systemMatches = focusAdSystem === systemId;
                  const isFocus = batteryInGroup || systemMatches;
                  return (
                    <ADReloadOfferCard
                      key={systemId}
                      systemId={systemId}
                      batteries={bats}
                      baseNameById={baseNameById}
                      currentYear={currentYear}
                      currentQuarter={currentQuarter}
                      onSign={onSign}
                      disabled={disabled}
                      initialTargetBatteryId={batteryInGroup ? focusBatteryId : undefined}
                      highlighted={isFocus}
                    />
                  );
                })}
              </div>
            );
          })()}
        </section>
      )}
    </div>
  );
}
