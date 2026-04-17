import { useMemo, useState } from "react";
import type { BudgetAllocation } from "../../lib/types";
import { Stepper } from "../primitives/Stepper";
import { CommitHoldButton } from "../primitives/CommitHoldButton";

export interface BudgetAllocatorProps {
  grantCr: number;
  treasuryCr: number;
  initialAllocation: BudgetAllocation;
  onCommit: (allocation: BudgetAllocation) => void;
  disabled?: boolean;
}

const BUCKET_LABELS: Record<keyof BudgetAllocation, string> = {
  rd: "R&D",
  acquisition: "Acquisition",
  om: "O&M",
  spares: "Spares",
  infrastructure: "Infrastructure",
};

const BUCKET_HELP: Record<keyof BudgetAllocation, string> = {
  rd: "Funds active programs. Underfunding slips milestone rolls.",
  acquisition: "Settles acquisition invoices. Underfunding slips deliveries.",
  om: "Readiness regen for existing squadrons.",
  spares: "Caps readiness ceiling. Chronic underfunding erodes strength.",
  infrastructure: "Airbase hardening + AD integration (Plan 10 consumes).",
};

const DEFAULT_PCT: BudgetAllocation = {
  rd: 25, acquisition: 35, om: 20, spares: 15, infrastructure: 5,
};

const STEP_CR = 5000;

function defaultFromGrant(grantCr: number): BudgetAllocation {
  return {
    rd: Math.floor((grantCr * DEFAULT_PCT.rd) / 100),
    acquisition: Math.floor((grantCr * DEFAULT_PCT.acquisition) / 100),
    om: Math.floor((grantCr * DEFAULT_PCT.om) / 100),
    spares: Math.floor((grantCr * DEFAULT_PCT.spares) / 100),
    infrastructure: Math.floor((grantCr * DEFAULT_PCT.infrastructure) / 100),
  };
}

export function BudgetAllocator({
  grantCr, treasuryCr, initialAllocation, onCommit, disabled = false,
}: BudgetAllocatorProps) {
  const [alloc, setAlloc] = useState<BudgetAllocation>(initialAllocation);

  const available = grantCr + treasuryCr;
  const total = useMemo(
    () => alloc.rd + alloc.acquisition + alloc.om + alloc.spares + alloc.infrastructure,
    [alloc],
  );
  const remaining = available - total;
  const overspent = remaining < 0;

  const setBucket = (key: keyof BudgetAllocation, next: number) => {
    setAlloc((a) => ({ ...a, [key]: Math.max(0, next) }));
  };

  const reset = () => setAlloc(defaultFromGrant(grantCr));

  return (
    <div className="space-y-4">
      <div className="flex items-baseline justify-between text-sm">
        <div>
          <span className="opacity-60">Quarterly grant</span>{" "}
          <span className="font-semibold">₹{grantCr.toLocaleString("en-US")} cr</span>
          {treasuryCr > 0 && (
            <>
              {" "}
              <span className="opacity-60">+ reserves</span>{" "}
              <span className="font-semibold">₹{treasuryCr.toLocaleString("en-US")} cr</span>
            </>
          )}
        </div>
        <button
          type="button"
          onClick={reset}
          className="text-xs opacity-60 hover:opacity-100 underline"
        >
          Reset
        </button>
      </div>

      <div className="space-y-3">
        {(Object.keys(BUCKET_LABELS) as Array<keyof BudgetAllocation>).map((key) => (
          <div key={key} className="grid grid-cols-[1fr_auto] gap-3 items-center">
            <div>
              <div className="text-sm font-semibold">{BUCKET_LABELS[key]}</div>
              <div className="text-xs opacity-60">{BUCKET_HELP[key]}</div>
            </div>
            <Stepper
              value={alloc[key]}
              onChange={(v) => setBucket(key, v)}
              step={STEP_CR}
              min={0}
              max={available}
              formatValue={(v) => v.toLocaleString("en-US")}
              disabled={disabled}
              ariaLabel={`${BUCKET_LABELS[key]} allocation`}
            />
          </div>
        ))}
      </div>

      <div className="border-t border-slate-800 pt-3 flex items-center justify-between text-sm">
        <div>
          <span className="opacity-60">Total</span>{" "}
          <span className="font-semibold">₹{total.toLocaleString("en-US")} cr</span>
        </div>
        <div>
          <span className="opacity-60">Remaining</span>{" "}
          <span
            className={[
              "font-semibold",
              overspent ? "text-rose-300" : "text-emerald-300",
            ].join(" ")}
          >
            ₹{remaining.toLocaleString("en-US")} cr
          </span>
        </div>
      </div>

      <div className="pt-2">
        <CommitHoldButton
          label={overspent ? "Over-allocated" : "Hold to commit"}
          holdMs={1800}
          disabled={disabled || overspent}
          onCommit={() => onCommit(alloc)}
          className="w-full"
        />
      </div>
    </div>
  );
}
