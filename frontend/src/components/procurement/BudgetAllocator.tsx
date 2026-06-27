import { useMemo, useState } from "react";
import type {
  BudgetAllocation, AcquisitionOrder, Platform, RDProgramSpec, RDProgramState, RDFundingLevel,
} from "../../lib/types";
import { Stepper } from "../primitives/Stepper";
import { CommitHoldButton } from "../primitives/CommitHoldButton";

export interface BudgetAllocatorProps {
  grantCr: number;
  treasuryCr: number;
  initialAllocation: BudgetAllocation;
  onCommit: (allocation: BudgetAllocation) => void;
  disabled?: boolean;
  /** Active acquisitions drive the 'committed' floor on the acquisition bucket. */
  activeOrders?: AcquisitionOrder[];
  platformsById?: Record<string, Platform>;
  /** Active R&D programs + catalog drive the 'committed' floor on the rd bucket. */
  rdActive?: RDProgramState[];
  rdCatalog?: RDProgramSpec[];
  currentYear?: number;
  currentQuarter?: number;
  /** Optional fleet readiness percentage (0–100). Renders a readiness bar above presets. */
  fleetReadinessPct?: number;
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

// ---------------------------------------------------------------------------
// Presets
// ---------------------------------------------------------------------------

const PRESETS: { key: string; label: string; pct: Record<string, number> }[] = [
  { key: "balanced",  label: "Balanced",           pct: { rd: 25, acquisition: 35, om: 20, spares: 15, infrastructure: 5 } },
  { key: "force",     label: "Build the Force",    pct: { rd: 15, acquisition: 50, om: 18, spares: 12, infrastructure: 5 } },
  { key: "tech",      label: "Tech Rush",          pct: { rd: 40, acquisition: 25, om: 18, spares: 12, infrastructure: 5 } },
  { key: "readiness", label: "Maintain Readiness", pct: { rd: 15, acquisition: 25, om: 35, spares: 20, infrastructure: 5 } },
];

function fromPct(pct: Record<string, number>, grant: number): BudgetAllocation {
  return Object.fromEntries(
    Object.entries(pct).map(([k, v]) => [k, Math.round((grant * v) / 100)])
  ) as BudgetAllocation;
}

/** Returns the key of the preset whose percentages exactly match alloc vs grant, or null if custom. */
function matchingPreset(alloc: BudgetAllocation, grant: number): string | null {
  for (const p of PRESETS) {
    const derived = fromPct(p.pct, grant);
    if (
      derived.rd === alloc.rd &&
      derived.acquisition === alloc.acquisition &&
      derived.om === alloc.om &&
      derived.spares === alloc.spares &&
      derived.infrastructure === alloc.infrastructure
    ) {
      return p.key;
    }
  }
  return null;
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function defaultFromGrant(grantCr: number): BudgetAllocation {
  return {
    rd: Math.floor((grantCr * DEFAULT_PCT.rd) / 100),
    acquisition: Math.floor((grantCr * DEFAULT_PCT.acquisition) / 100),
    om: Math.floor((grantCr * DEFAULT_PCT.om) / 100),
    spares: Math.floor((grantCr * DEFAULT_PCT.spares) / 100),
    infrastructure: Math.floor((grantCr * DEFAULT_PCT.infrastructure) / 100),
  };
}

const RD_FACTORS: Record<RDFundingLevel, number> = {
  slow: 0.5, standard: 1.0, accelerated: 1.5,
};

function acquisitionCommitments(
  orders: AcquisitionOrder[],
  platformsById: Record<string, Platform>,
  currentYear: number,
  currentQuarter: number,
): { perQ: number; lines: { label: string; perQ: number }[] } {
  const nowIdx = currentYear * 4 + (currentQuarter - 1);
  const lines: { label: string; perQ: number }[] = [];
  let total = 0;
  for (const o of orders) {
    if (o.cancelled) continue;
    if (o.delivered >= o.quantity) continue;
    const firstIdx = o.first_delivery_year * 4 + (o.first_delivery_quarter - 1);
    const focIdx = o.foc_year * 4 + (o.foc_quarter - 1);
    // Only counts this quarter if we're within the delivery window
    if (nowIdx < firstIdx || nowIdx > focIdx) continue;
    const totalQ = (o.foc_year - o.first_delivery_year) * 4 + (o.foc_quarter - o.first_delivery_quarter) + 1;
    const perQ = totalQ > 0 ? Math.floor(o.total_cost_cr / totalQ) : 0;
    total += perQ;
    const name = platformsById[o.platform_id]?.name ?? o.platform_id;
    lines.push({ label: `${o.quantity}× ${name}`, perQ });
  }
  return { perQ: total, lines };
}

function rdCommitments(
  active: RDProgramState[],
  catalog: RDProgramSpec[],
): { perQ: number; lines: { label: string; perQ: number }[] } {
  const catalogById = Object.fromEntries(catalog.map((c) => [c.id, c]));
  const lines: { label: string; perQ: number }[] = [];
  let total = 0;
  for (const a of active) {
    if (a.status !== "active") continue;
    const spec = catalogById[a.program_id];
    if (!spec) continue;
    const factor = RD_FACTORS[a.funding_level] ?? 1.0;
    const perQ = Math.floor((spec.base_cost_cr / spec.base_duration_quarters) * factor);
    total += perQ;
    lines.push({ label: `${spec.name} (${a.funding_level})`, perQ });
  }
  return { perQ: total, lines };
}

function BucketCommitment({
  committed, lines,
}: { committed: number; lines: { label: string; perQ: number }[] }) {
  const [expanded, setExpanded] = useState(false);
  if (committed === 0 || lines.length === 0) {
    return (
      <p className="text-[10px] opacity-50 italic">
        No committed spend this quarter.
      </p>
    );
  }
  return (
    <div className="text-[10px] space-y-1">
      <button
        type="button"
        onClick={() => setExpanded(!expanded)}
        className="text-left opacity-70 hover:opacity-100 underline"
      >
        Committed: ₹{committed.toLocaleString("en-US")}/q ({lines.length} item{lines.length === 1 ? "" : "s"}) {expanded ? "▲" : "▼"}
      </button>
      {expanded && (
        <ul className="pl-2 space-y-0.5 opacity-70">
          {lines.map((l, i) => (
            <li key={i} className="flex justify-between gap-2">
              <span className="truncate">{l.label}</span>
              <span className="font-mono flex-shrink-0">₹{l.perQ.toLocaleString("en-US")}</span>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Readiness bar
// ---------------------------------------------------------------------------

function ReadinessBar({ pct }: { pct: number }) {
  let color: string;
  let label: string;
  if (pct >= 75) {
    color = "bg-emerald-500";
    label = "Fleet readiness: Good";
  } else if (pct >= 55) {
    color = "bg-amber-500";
    label = "Fleet readiness: Strained";
  } else {
    color = "bg-rose-500";
    label = "Fleet readiness: Critical";
  }
  return (
    <div className="space-y-1">
      <div className="flex justify-between text-xs">
        <span className={pct >= 75 ? "text-emerald-400" : pct >= 55 ? "text-amber-400" : "text-rose-400"}>
          {label}
        </span>
        <span className="opacity-60">{pct}%</span>
      </div>
      <div className="h-1.5 w-full rounded-full bg-slate-800">
        <div
          className={`h-1.5 rounded-full ${color}`}
          style={{ width: `${Math.min(100, Math.max(0, pct))}%` }}
        />
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Main component
// ---------------------------------------------------------------------------

export function BudgetAllocator({
  grantCr, treasuryCr, initialAllocation, onCommit, disabled = false,
  activeOrders = [], platformsById = {}, rdActive = [], rdCatalog = [],
  currentYear = 2026, currentQuarter = 2,
  fleetReadinessPct,
}: BudgetAllocatorProps) {
  const [alloc, setAlloc] = useState<BudgetAllocation>(initialAllocation);
  const [advanced, setAdvanced] = useState(false);

  const available = grantCr + treasuryCr;
  const total = useMemo(
    () => alloc.rd + alloc.acquisition + alloc.om + alloc.spares + alloc.infrastructure,
    [alloc],
  );
  const remaining = available - total;
  const overspent = remaining < 0;

  const acqCommit = useMemo(
    () => acquisitionCommitments(activeOrders, platformsById, currentYear, currentQuarter),
    [activeOrders, platformsById, currentYear, currentQuarter],
  );
  const rdCommit = useMemo(
    () => rdCommitments(rdActive, rdCatalog),
    [rdActive, rdCatalog],
  );

  const commitmentByBucket: Record<keyof BudgetAllocation, { perQ: number; lines: { label: string; perQ: number }[] }> = {
    rd: rdCommit,
    acquisition: acqCommit,
    om: { perQ: 0, lines: [] },
    spares: { perQ: 0, lines: [] },
    infrastructure: { perQ: 0, lines: [] },
  };

  const setBucket = (key: keyof BudgetAllocation, next: number) => {
    setAlloc((a) => ({ ...a, [key]: Math.max(0, next) }));
  };

  const reset = () => setAlloc(defaultFromGrant(grantCr));

  // Auto-match: set RD + Acquisition to exactly committed. Leave other buckets alone.
  const autoMatch = () => {
    setAlloc((a) => ({
      ...a,
      rd: rdCommit.perQ,
      acquisition: acqCommit.perQ,
    }));
  };

  const applyPreset = (p: typeof PRESETS[number]) => {
    setAlloc(fromPct(p.pct, grantCr));
  };

  const activePresetKey = matchingPreset(alloc, grantCr);

  return (
    <div className="space-y-4">
      <details className="bg-slate-900/60 border border-slate-800 rounded-lg px-3 py-2 text-xs">
        <summary className="cursor-pointer font-semibold">How budget works ▾</summary>
        <div className="mt-2 space-y-1.5 opacity-80 leading-relaxed">
          <p><span className="font-semibold">Grant</span> arrives every turn. Any unused grant rolls into <span className="font-semibold">reserves</span> (💰 treasury).</p>
          <p><span className="font-semibold">R&D / Acquisition</span> buckets should match their committed spend. Over-allocating is wasted — excess does <em>not</em> roll to reserves. Use <span className="font-semibold">Auto-match commitments</span> to set them correctly.</p>
          <p><span className="font-semibold">O&M / Spares / Infra</span> are consumptive — whatever you allocate is spent this turn.</p>
          <p>Set program speed on the <span className="font-semibold">R&D</span> tab (slow / standard / accelerated). The Budget R&D bucket only caps total spend — it doesn't change program speed.</p>
        </div>
      </details>

      {/* Optional fleet readiness bar */}
      {fleetReadinessPct !== undefined && (
        <ReadinessBar pct={fleetReadinessPct} />
      )}

      {/* Grant summary line */}
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
        {!activePresetKey && (
          <span className="text-xs opacity-50 italic">Custom</span>
        )}
      </div>

      {/* Preset buttons */}
      <div className="grid grid-cols-2 gap-2">
        {PRESETS.map((p) => {
          const derived = fromPct(p.pct, grantCr);
          const isActive = activePresetKey === p.key;
          return (
            <button
              key={p.key}
              type="button"
              onClick={() => applyPreset(p)}
              aria-pressed={isActive}
              className={[
                "min-h-[44px] rounded-lg border px-3 py-2 text-left transition-colors",
                isActive
                  ? "border-amber-500 bg-amber-950/40 text-amber-300"
                  : "border-slate-700 bg-slate-900/40 hover:border-slate-500 text-slate-200",
              ].join(" ")}
            >
              <div className="text-xs font-semibold">{p.label}</div>
              <div className="text-[10px] opacity-60 mt-0.5">
                R&D ₹{derived.rd.toLocaleString("en-US")} · Acq ₹{derived.acquisition.toLocaleString("en-US")}
              </div>
            </button>
          );
        })}
      </div>

      {/* Advanced toggle */}
      <button
        type="button"
        onClick={() => setAdvanced((v) => !v)}
        className="min-h-[44px] w-full rounded-lg border border-slate-700 bg-slate-900/30 px-3 py-2 text-xs text-slate-300 hover:border-slate-500 flex items-center justify-between"
        aria-expanded={advanced}
      >
        <span>Advanced / Customize</span>
        <span>{advanced ? "▲" : "▼"}</span>
      </button>

      {/* Advanced panel — bucket steppers + commitment controls */}
      {advanced && (
        <div className="space-y-4">
          <div className="flex items-center justify-end gap-3 text-sm">
            {(rdCommit.perQ > 0 || acqCommit.perQ > 0) && (
              <button
                type="button"
                onClick={autoMatch}
                className="text-xs text-amber-400 hover:text-amber-300 underline"
                title="Set R&D and Acquisition buckets to exactly match committed spend"
              >
                Auto-match commitments
              </button>
            )}
            <button
              type="button"
              onClick={reset}
              className="text-xs opacity-60 hover:opacity-100 underline"
            >
              Reset
            </button>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            {(Object.keys(BUCKET_LABELS) as Array<keyof BudgetAllocation>).map((key) => {
              const commit = commitmentByBucket[key];
              const underAllocated = commit.perQ > 0 && alloc[key] < commit.perQ;
              return (
                <div key={key} className={[
                  "space-y-2 rounded-lg p-3 border",
                  underAllocated ? "border-rose-800 bg-rose-950/20" : "border-slate-800 bg-slate-900/30",
                ].join(" ")}>
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
                  <BucketCommitment committed={commit.perQ} lines={commit.lines} />
                  {underAllocated && (
                    <p className="text-[10px] text-rose-300">
                      ⚠ Under-allocated by ₹{(commit.perQ - alloc[key]).toLocaleString("en-US")} cr — {key === "rd" ? "R&D programs will slip pro-rata" : "deliveries will slip"} this quarter.
                    </p>
                  )}
                  {(key === "rd" || key === "acquisition") && commit.perQ > 0 && alloc[key] > commit.perQ && (
                    <p className="text-[10px] text-amber-400">
                      ⚠ Over-allocated by ₹{(alloc[key] - commit.perQ).toLocaleString("en-US")} cr — excess is wasted (this bucket doesn't roll to reserves). Lower it or move to O&M/Spares/Infra.
                    </p>
                  )}
                </div>
              );
            })}
          </div>
        </div>
      )}

      {/* Total / remaining summary */}
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
