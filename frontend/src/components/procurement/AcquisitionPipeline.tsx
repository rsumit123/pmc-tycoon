import { useState } from "react";
import type {
  Platform, AcquisitionOrder, AcquisitionCreatePayload,
} from "../../lib/types";
import { Stepper } from "../primitives/Stepper";
import { CommitHoldButton } from "../primitives/CommitHoldButton";

export interface AcquisitionPipelineProps {
  platforms: Platform[];
  orders: AcquisitionOrder[];
  currentYear: number;
  currentQuarter: number;
  onSign: (payload: AcquisitionCreatePayload) => void;
  disabled?: boolean;
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
  order, platformName, currentYear, currentQuarter,
}: {
  order: AcquisitionOrder;
  platformName: string;
  currentYear: number;
  currentQuarter: number;
}) {
  const startFrac = qFraction(order.first_delivery_year, order.first_delivery_quarter);
  const endFrac = qFraction(order.foc_year, order.foc_quarter);
  const widthFrac = Math.max(0.02, endFrac - startFrac);
  const nowFrac = qFraction(currentYear, currentQuarter);

  return (
    <div className="space-y-1">
      <div className="flex items-baseline justify-between text-xs">
        <span className="font-semibold">{platformName}</span>
        <span className="opacity-60">
          {order.delivered}/{order.quantity}
        </span>
      </div>
      <div className="relative h-3 bg-slate-800 rounded">
        <div
          className="absolute inset-y-0 bg-amber-700/60 border border-amber-500 rounded"
          style={{ left: `${startFrac * 100}%`, width: `${widthFrac * 100}%` }}
        />
        <div
          className="absolute top-[-2px] bottom-[-2px] w-[2px] bg-emerald-300"
          style={{ left: `${nowFrac * 100}%` }}
          aria-label="current quarter"
        />
      </div>
      <div className="flex justify-between text-[10px] opacity-50">
        <span>
          {order.first_delivery_year}-Q{order.first_delivery_quarter}
        </span>
        <span>
          {order.foc_year}-Q{order.foc_quarter}
        </span>
      </div>
    </div>
  );
}

export function AcquisitionPipeline({
  platforms, orders, currentYear, currentQuarter, onSign, disabled,
}: AcquisitionPipelineProps) {
  const byId = Object.fromEntries(platforms.map((p) => [p.id, p]));
  const availablePlatforms = platforms;
  return (
    <div className="space-y-6">
      <section className="space-y-3">
        <h3 className="text-sm font-bold uppercase tracking-wider opacity-80">
          Offers
        </h3>
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
      </section>

      <section className="space-y-3">
        <h3 className="text-sm font-bold uppercase tracking-wider opacity-80">
          Active orders
        </h3>
        {orders.length === 0 ? (
          <p className="text-xs opacity-60">No active orders.</p>
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
                />
              ))}
            </div>
          </div>
        )}
      </section>
    </div>
  );
}
