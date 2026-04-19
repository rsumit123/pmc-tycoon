import { useMemo, useState } from "react";
import type {
  Platform, AcquisitionOrder, AcquisitionCreatePayload, RDProgramSpec, RDProgramState,
} from "../../lib/types";
import { Stepper } from "../primitives/Stepper";
import { CommitHoldButton } from "../primitives/CommitHoldButton";

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
}

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
  platform, currentYear, currentQuarter, onSign, disabled,
}: {
  platform: Platform;
  currentYear: number;
  currentQuarter: number;
  onSign: AcquisitionPipelineProps["onSign"];
  disabled?: boolean;
}) {
  const [qty, setQty] = useState<number>(DEFAULT_QTY);
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
    });
  };

  return (
    <div className="bg-slate-900/50 border border-slate-800 rounded-lg p-3 space-y-2">
      <p className="flex items-baseline justify-between gap-2">
        <span className="text-sm font-semibold">{platform.name}</span>
        <span className="text-[10px] opacity-60">{platform.origin}</span>
      </p>
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
  order, platformName, currentYear, currentQuarter, onCancel,
}: {
  order: AcquisitionOrder;
  platformName: string;
  currentYear: number;
  currentQuarter: number;
  onCancel?: (orderId: number) => void;
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

  // "Paid so far" = cost associated with already-delivered quarters.
  // Per-quarter unit-cost × quarters already delivered (approx).
  const quartersDone = totalQ > 0
    ? Math.max(0, Math.min(totalQ, Math.floor((order.delivered / order.quantity) * totalQ)))
    : 0;
  const paidSoFar = quartersDone * perQ;
  const remainingCost = Math.max(0, order.total_cost_cr - paidSoFar);
  const remainingQ = Math.max(0, totalQ - quartersDone);

  const isCompleted = order.delivered >= order.quantity;
  const cancellable = !order.cancelled && !isCompleted && !!onCancel;

  return (
    <div className="space-y-1.5 bg-slate-900/40 border border-slate-800 rounded-lg p-3">
      <div className="flex items-baseline justify-between gap-2 text-xs">
        <div className="min-w-0 flex-1">
          <span className="font-semibold">{platformName}</span>
          {order.cancelled && (
            <span className="ml-2 text-[10px] bg-rose-900/50 text-rose-200 px-1.5 py-0.5 rounded">CANCELLED</span>
          )}
          {!order.cancelled && isCompleted && (
            <span className="ml-2 text-[10px] bg-emerald-900/50 text-emerald-200 px-1.5 py-0.5 rounded">COMPLETE</span>
          )}
        </div>
        <span className="opacity-70 flex-shrink-0">
          {order.delivered}/{order.quantity}
        </span>
      </div>
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
      <div className="grid grid-cols-2 gap-x-2 gap-y-0.5 text-[11px] opacity-80 pt-1">
        <span>Total: <span className="font-mono">₹{order.total_cost_cr.toLocaleString("en-US")}</span> cr</span>
        <span>Per-quarter: <span className="font-mono">₹{perQ.toLocaleString("en-US")}</span></span>
        <span>Paid: <span className="font-mono">₹{paidSoFar.toLocaleString("en-US")}</span></span>
        <span>Remaining: <span className="font-mono">₹{remainingCost.toLocaleString("en-US")}</span></span>
      </div>

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

export function AcquisitionPipeline({
  platforms, orders, currentYear, currentQuarter, onSign, onCancel, disabled,
  rdCatalog = [], rdActive = [],
}: AcquisitionPipelineProps) {
  const byId = Object.fromEntries(platforms.map((p) => [p.id, p]));
  const [tab, setTab] = useState<"orders" | "offers">(orders.length > 0 ? "orders" : "offers");

  // Platforms gated by an incomplete R&D program.
  const lockedPlatformIds = useMemo(() => {
    const completedProgramIds = new Set(
      rdActive.filter((a) => a.status === "completed").map((a) => a.program_id),
    );
    const locked = new Set<string>();
    for (const prog of rdCatalog) {
      const u = prog.unlocks;
      if (!u || !u.target_id) continue;
      if (u.kind !== "platform" && u.kind !== "strike_platform") continue;
      if (completedProgramIds.has(prog.id)) continue;
      locked.add(u.target_id);
    }
    return locked;
  }, [rdCatalog, rdActive]);

  const availablePlatforms = useMemo(() => {
    return platforms.filter((p) => {
      if (lockedPlatformIds.has(p.id)) return false;
      if (p.intro_year && p.intro_year > currentYear) return false;
      return true;
    });
  }, [platforms, lockedPlatformIds, currentYear]);

  const lockedCount = platforms.length - availablePlatforms.length;

  return (
    <div className="space-y-4">
      <div className="flex gap-1 bg-slate-900 border border-slate-800 rounded-lg p-1">
        <button
          type="button"
          onClick={() => setTab("orders")}
          className={`flex-1 px-3 py-1.5 text-xs font-semibold rounded ${tab === "orders" ? "bg-amber-600 text-slate-900" : "text-slate-300"}`}
        >
          Active Orders ({orders.length})
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
          {orders.length === 0 ? (
            <p className="text-xs opacity-60 py-6 text-center">
              No active orders. Open <span className="font-semibold">Offers</span> to sign a new procurement.
            </p>
          ) : (
            <div className="overflow-x-auto">
              <div className="space-y-3 min-w-min">
                {orders.map((o) => (
                  <TimelineBar
                    key={o.id}
                    order={o}
                    platformName={byId[o.platform_id]?.name ?? o.platform_id}
                    currentYear={currentYear}
                    currentQuarter={currentQuarter}
                    onCancel={onCancel}
                  />
                ))}
              </div>
            </div>
          )}
        </section>
      ) : (
        <section className="space-y-3">
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
                />
              ))}
            </div>
          )}
        </section>
      )}
    </div>
  );
}
