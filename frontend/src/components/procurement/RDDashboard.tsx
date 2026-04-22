import { useMemo, useState } from "react";
import type {
  RDProgramSpec, RDProgramState, RDFundingLevel, RDUpdatePayload,
} from "../../lib/types";
import { CommitHoldButton } from "../primitives/CommitHoldButton";
import { RoleInfo, InfoButton } from "../primitives/RoleInfo";
import { useCampaignStore } from "../../store/campaignStore";

export interface RDDashboardProps {
  catalog: RDProgramSpec[];
  active: RDProgramState[];
  onStart: (programId: string, fundingLevel: RDFundingLevel) => void;
  onUpdate: (programId: string, payload: RDUpdatePayload) => void;
  disabled?: boolean;
}

const FUNDING_LEVELS: RDFundingLevel[] = ["slow", "standard", "accelerated"];
const CATEGORY_KEYWORDS: Record<string, string[]> = {
  Fighters: ["amca", "tejas", "tedbf", "rafale", "mig"],
  Weapons:  ["astra", "brahmos", "rudram", "meteor", "missile"],
  Sensors:  ["netra", "aewc", "uttam", "aesa", "radar"],
  Drones:   ["ghatak", "archer", "tapas", "drone", "ucav"],
  Infrastructure: ["shelter", "runway", "base", "fuel"],
};

function categorize(spec: RDProgramSpec): string {
  const id = spec.id.toLowerCase();
  const name = spec.name.toLowerCase();
  for (const [cat, keys] of Object.entries(CATEGORY_KEYWORDS)) {
    if (keys.some((k) => id.includes(k) || name.includes(k))) return cat;
  }
  return "Other";
}

function specOf(catalog: RDProgramSpec[], programId: string): RDProgramSpec | undefined {
  return catalog.find((s) => s.id === programId);
}

function ActiveRow({
  state, spec, onUpdate, loading,
}: {
  state: RDProgramState;
  spec?: RDProgramSpec;
  onUpdate: RDDashboardProps["onUpdate"];
  loading: boolean;
}) {
  const [confirming, setConfirming] = useState(false);
  const [infoOpen, setInfoOpen] = useState(false);

  const statusBadge =
    state.status === "completed"
      ? { text: "Completed", classes: "bg-emerald-900/50 text-emerald-200" }
      : state.status === "cancelled"
      ? { text: "Cancelled", classes: "bg-slate-800 text-slate-300" }
      : { text: "Active", classes: "bg-amber-900/50 text-amber-200" };

  return (
    <div className="bg-slate-900/70 border border-slate-800 rounded-lg p-3 space-y-2 relative">
      {loading && (
        <div className="absolute inset-0 bg-slate-950/40 rounded-lg flex items-center justify-center z-10">
          <div className="w-5 h-5 rounded-full border-2 border-amber-400 border-t-transparent animate-spin" />
        </div>
      )}
      <div className="flex items-baseline justify-between gap-2">
        <div className="text-sm font-semibold flex items-center gap-1.5">
          {spec?.name ?? state.program_id}
          {spec && (
            <InfoButton
              onClick={() => setInfoOpen(true)}
              ariaLabel={`${spec.name} info`}
            />
          )}
        </div>
        <span className={`text-[10px] px-2 py-0.5 rounded-full uppercase ${statusBadge.classes}`}>
          {statusBadge.text}
        </span>
      </div>
      {spec && (
        <RoleInfo
          open={infoOpen}
          onClose={() => setInfoOpen(false)}
          title={spec.name}
          description={spec.description}
          unlockKind={spec.unlocks?.kind}
          unlockTarget={spec.unlocks?.target_id ?? undefined}
        />
      )}
      <div className="relative h-2 rounded bg-slate-800 overflow-hidden">
        <div
          className="absolute inset-y-0 left-0 bg-amber-500 transition-all"
          style={{ width: `${Math.min(100, state.progress_pct)}%` }}
        />
      </div>
      <div className="flex items-center justify-between text-xs opacity-80">
        <span>Progress {state.progress_pct}%</span>
        <span>Invested ₹{state.cost_invested_cr.toLocaleString("en-US")} cr</span>
      </div>

      {state.status === "active" && (
        <>
          <div className="flex flex-col gap-1">
            <span className="text-xs opacity-60">Funding</span>
            <div className="grid grid-cols-3 gap-1">
              {FUNDING_LEVELS.map((lvl) => {
                const proj = state.projections?.[lvl];
                const selected = lvl === state.funding_level;
                return (
                  <button
                    key={lvl}
                    type="button"
                    aria-label={`Set funding ${lvl}`}
                    disabled={loading}
                    onClick={() => onUpdate(state.program_id, { funding_level: lvl })}
                    className={[
                      "text-xs rounded p-1.5 border flex flex-col items-center gap-0.5 transition-colors",
                      selected
                        ? "bg-amber-600 border-amber-500 text-slate-900 font-semibold"
                        : "bg-slate-800 border-slate-700 hover:border-slate-500 text-slate-200",
                      loading ? "opacity-60 cursor-not-allowed" : "",
                    ].join(" ")}
                  >
                    <span className="capitalize">{lvl}</span>
                    {proj ? (
                      <>
                        <span className="text-[10px] opacity-80">{proj.completion_year} Q{proj.completion_quarter}</span>
                        <span className="text-[10px] opacity-80">₹{proj.quarterly_cost_cr.toLocaleString("en-US")}/q</span>
                      </>
                    ) : (
                      <span className="text-[10px] opacity-40">—</span>
                    )}
                  </button>
                );
              })}
            </div>
          </div>

          {confirming ? (
            <div className="border border-rose-800 rounded p-2 bg-rose-900/20 text-xs space-y-2">
              <div className="text-rose-200">
                Cancelling will stop further spend.
                <strong className="block">
                  ₹{state.cost_invested_cr.toLocaleString("en-US")} cr already invested is
                  written off — it is not refunded.
                </strong>
              </div>
              <div className="flex gap-2">
                <button
                  type="button"
                  onClick={() => {
                    onUpdate(state.program_id, { status: "cancelled" });
                    setConfirming(false);
                  }}
                  className="text-xs px-2 py-1 rounded bg-rose-700 hover:bg-rose-600 text-white"
                >
                  Confirm cancel
                </button>
                <button
                  type="button"
                  onClick={() => setConfirming(false)}
                  className="text-xs px-2 py-1 rounded bg-slate-800 hover:bg-slate-700"
                >
                  Keep running
                </button>
              </div>
            </div>
          ) : (
            <button
              type="button"
              onClick={() => setConfirming(true)}
              className="text-xs text-rose-300 hover:text-rose-200 underline"
            >
              Cancel program
            </button>
          )}
        </>
      )}
    </div>
  );
}

function CatalogRow({
  spec, onStart, disabled, dependentNames,
}: {
  spec: RDProgramSpec;
  onStart: RDDashboardProps["onStart"];
  disabled?: boolean;
  dependentNames: string[];
}) {
  const [funding, setFunding] = useState<RDFundingLevel>("standard");
  const [infoOpen, setInfoOpen] = useState(false);
  const campaign = useCampaignStore((s) => s.campaign);

  function clientProjection(lvl: RDFundingLevel, progress: number) {
    const FUNDING_FACTORS: Record<RDFundingLevel, [number, number]> = {
      slow: [0.5, 0.5],
      standard: [1.0, 1.0],
      accelerated: [1.5, 1.4],
    };
    const [costFactor, progFactor] = FUNDING_FACTORS[lvl];
    const basePerQtr = 100 / spec.base_duration_quarters;
    const effPerQtr = basePerQtr * progFactor;
    const remaining = Math.max(0, 100 - progress);
    const quartersRemaining = effPerQtr <= 0 ? 0 : Math.ceil(remaining / effPerQtr);
    const currentYear = campaign?.current_year ?? 2026;
    const currentQuarter = campaign?.current_quarter ?? 2;
    const totalQ = currentYear * 4 + (currentQuarter - 1) + quartersRemaining;
    const completion_year = Math.floor(totalQ / 4);
    const completion_quarter = (totalQ % 4) + 1;
    const quarterly_cost_cr = Math.floor((spec.base_cost_cr / spec.base_duration_quarters) * costFactor);
    return { completion_year, completion_quarter, quarterly_cost_cr };
  }

  const unlockKind = spec.unlocks?.kind ?? "none";
  const unlocksSomething = unlockKind !== "none";
  const isDoctrinalFlavor = !unlocksSomething && dependentNames.length === 0;

  let outcomeChip: { label: string; cls: string } | null = null;
  if (unlocksSomething) {
    const target = spec.unlocks?.target_id ?? "";
    outcomeChip = {
      label: `Unlocks ${unlockKind.replace(/_/g, " ")}: ${target}`,
      cls: "bg-emerald-900/40 text-emerald-200 border-emerald-700",
    };
  } else if (dependentNames.length > 0) {
    outcomeChip = {
      label: `Prereq for: ${dependentNames.join(", ")}`,
      cls: "bg-sky-900/40 text-sky-200 border-sky-700",
    };
  } else {
    outcomeChip = {
      label: "Doctrinal flavor — no direct unlock",
      cls: "bg-slate-800 text-slate-400 border-slate-700",
    };
  }

  return (
    <div className={[
      "border rounded-lg p-3 space-y-2",
      isDoctrinalFlavor ? "bg-slate-900/30 border-slate-800 opacity-70" : "bg-slate-900/50 border-slate-800",
    ].join(" ")}>
      <div className="flex items-baseline justify-between gap-2">
        <div className="text-sm font-semibold flex items-center gap-1.5">
          {spec.name}
          <InfoButton onClick={() => setInfoOpen(true)} ariaLabel={`${spec.name} info`} />
        </div>
      </div>
      <RoleInfo
        open={infoOpen}
        onClose={() => setInfoOpen(false)}
        title={spec.name}
        description={spec.description}
        unlockKind={spec.unlocks?.kind}
        unlockTarget={spec.unlocks?.target_id ?? undefined}
      />
      <div className="text-xs opacity-70">{spec.description}</div>
      {outcomeChip && (
        <div className={`text-[10px] inline-block border rounded px-1.5 py-0.5 ${outcomeChip.cls}`}>
          {outcomeChip.label}
        </div>
      )}
      <div className="text-xs opacity-60">
        Duration ~{spec.base_duration_quarters}q • Base cost ₹
        {spec.base_cost_cr.toLocaleString("en-US")} cr
        {spec.dependencies.length > 0 && (
          <> • Depends on: {spec.dependencies.join(", ")}</>
        )}
      </div>
      <div className="flex flex-col gap-1">
        <span className="text-xs opacity-60">Speed</span>
        <div className="grid grid-cols-3 gap-1">
          {FUNDING_LEVELS.map((lvl) => {
            const proj = clientProjection(lvl, 0);
            const selected = lvl === funding;
            return (
              <button
                key={lvl}
                type="button"
                aria-label={`Set funding ${lvl}`}
                onClick={() => setFunding(lvl)}
                className={[
                  "text-xs rounded p-1.5 border flex flex-col items-center gap-0.5",
                  selected
                    ? "bg-amber-600 border-amber-500 text-slate-900 font-semibold"
                    : "bg-slate-800 border-slate-700 hover:border-slate-500 text-slate-200",
                ].join(" ")}
              >
                <span className="capitalize">{lvl}</span>
                <span className="text-[10px] opacity-80">{proj.completion_year} Q{proj.completion_quarter}</span>
                <span className="text-[10px] opacity-80">₹{proj.quarterly_cost_cr.toLocaleString("en-US")}/q</span>
              </button>
            );
          })}
        </div>
      </div>
      <CommitHoldButton
        label="Hold to start"
        holdMs={1800}
        disabled={disabled}
        onCommit={() => onStart(spec.id, funding)}
        className="w-full"
      />
    </div>
  );
}

export function RDDashboard({
  catalog, active, onStart, onUpdate, disabled,
}: RDDashboardProps) {
  const rdLoading = useCampaignStore((s) => s.rdLoading);
  const campaign = useCampaignStore((s) => s.campaign);

  const [tab, setTab] = useState<"active" | "catalog">(active.length > 0 ? "active" : "catalog");
  const [category, setCategory] = useState<string>("All");
  const [sortMode, setSortMode] = useState<"name" | "duration" | "cost">("name");
  const [showCompleted, setShowCompleted] = useState(false);

  const completedCount = useMemo(
    () => active.filter((a) => a.status === "completed" || a.status === "cancelled").length,
    [active],
  );

  const sortedActive = useMemo(() => {
    const rows = showCompleted
      ? active
      : active.filter((a) => a.status !== "completed" && a.status !== "cancelled");
    return [...rows].sort((a, b) => b.progress_pct - a.progress_pct);
  }, [active, showCompleted]);

  // Reverse dependency index: programId → list of program ids that list it as a dependency
  const dependentsByProgram = useMemo(() => {
    const out: Record<string, string[]> = {};
    for (const prog of catalog) {
      for (const dep of prog.dependencies) {
        (out[dep] ??= []).push(prog.id);
      }
    }
    return out;
  }, [catalog]);

  const activeIds = useMemo(
    () => new Set(
      active.filter((a) => a.status === "active" || a.status === "completed")
            .map((a) => a.program_id),
    ),
    [active],
  );

  const availableCatalog = useMemo(
    () => catalog.filter((s) => !activeIds.has(s.id)),
    [catalog, activeIds],
  );

  const filteredCatalog = useMemo(() => {
    const base = category === "All"
      ? availableCatalog
      : availableCatalog.filter((s) => categorize(s) === category);
    const sorted = [...base];
    if (sortMode === "duration") {
      sorted.sort((a, b) => a.base_duration_quarters - b.base_duration_quarters);
    } else if (sortMode === "cost") {
      sorted.sort((a, b) => a.base_cost_cr - b.base_cost_cr);
    } else {
      sorted.sort((a, b) => a.name.localeCompare(b.name));
    }
    return sorted;
  }, [availableCatalog, category, sortMode]);

  // Category counts for the inner tab labels.
  const categoryCounts = useMemo(() => {
    const counts: Record<string, number> = { All: availableCatalog.length };
    for (const c of ["Fighters", "Weapons", "Sensors", "Drones", "Infrastructure", "Other"]) {
      counts[c] = availableCatalog.filter((s) => categorize(s) === c).length;
    }
    return counts;
  }, [availableCatalog]);

  const totalQuarterlyCost = useMemo(() => {
    return active.reduce((sum, a) => {
      if (a.status !== "active") return sum;
      const proj = a.projections?.[a.funding_level];
      return sum + (proj?.quarterly_cost_cr ?? 0);
    }, 0);
  }, [active]);

  const allocationSet = !!campaign?.current_allocation_json;
  const rdBucket = campaign?.current_allocation_json?.rd ?? 0;
  const overBudget = allocationSet && totalQuarterlyCost > rdBucket;

  return (
    <div className="space-y-4">
      <div className={[
        "sticky top-0 z-20 -mx-4 sm:mx-0 px-4 py-2 border-b",
        overBudget ? "bg-rose-950/80 border-rose-800"
          : !allocationSet ? "bg-amber-950/40 border-amber-800"
          : "bg-slate-900 border-slate-700",
      ].join(" ")}>
        <div className="flex items-baseline justify-between text-xs gap-2">
          <span className="opacity-70">Quarterly R&D spend</span>
          {allocationSet ? (
            <span className={overBudget ? "text-rose-300 font-semibold" : "text-slate-200 font-semibold"}>
              ₹{totalQuarterlyCost.toLocaleString("en-US")} / ₹{rdBucket.toLocaleString("en-US")} cr
            </span>
          ) : (
            <span className="text-amber-300 font-semibold">
              ₹{totalQuarterlyCost.toLocaleString("en-US")} committed
            </span>
          )}
        </div>
        {overBudget && (
          <p className="text-[10px] text-rose-300 mt-1">
            Projected spend exceeds R&D budget bucket — programs will get underfunded pro-rata.
          </p>
        )}
        {!allocationSet && (
          <p className="text-[10px] text-amber-300 mt-1">
            Budget allocation not set. Visit <span className="font-semibold">Budget</span> tab to allocate your ₹{(campaign?.quarterly_grant_cr ?? 0).toLocaleString("en-US")} cr quarterly grant.
          </p>
        )}
      </div>

      <div className="flex gap-1 bg-slate-900 border border-slate-800 rounded-lg p-1">
        <button
          type="button"
          onClick={() => setTab("active")}
          className={[
            "flex-1 px-3 py-1.5 text-xs font-semibold rounded",
            tab === "active" ? "bg-amber-600 text-slate-900" : "text-slate-300",
          ].join(" ")}
        >
          Active ({active.length})
        </button>
        <button
          type="button"
          onClick={() => setTab("catalog")}
          className={[
            "flex-1 px-3 py-1.5 text-xs font-semibold rounded",
            tab === "catalog" ? "bg-amber-600 text-slate-900" : "text-slate-300",
          ].join(" ")}
        >
          Catalog ({availableCatalog.length})
        </button>
      </div>

      {tab === "active" ? (
        <section className="space-y-2">
          {completedCount > 0 && (
            <label className="flex items-center gap-2 text-[11px] opacity-70 cursor-pointer select-none">
              <input
                type="checkbox"
                checked={showCompleted}
                onChange={(e) => setShowCompleted(e.target.checked)}
              />
              Show {completedCount} completed / cancelled
            </label>
          )}
          {sortedActive.length === 0 ? (
            <p className="text-xs opacity-60 py-4 text-center">
              {active.length === 0
                ? "No R&D programs underway. Open Catalog to start one."
                : completedCount > 0
                  ? <>All programs completed. Tick <span className="font-semibold">Show {completedCount} completed</span> to review.</>
                  : "No active programs."}
            </p>
          ) : (
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
              {sortedActive.map((a) => (
                <ActiveRow
                  key={a.id}
                  state={a}
                  spec={specOf(catalog, a.program_id)}
                  onUpdate={onUpdate}
                  loading={!!rdLoading[a.program_id]}
                />
              ))}
            </div>
          )}
        </section>
      ) : (
        <section className="space-y-3">
          <div className="flex gap-1 bg-slate-900 border border-slate-800 rounded-lg p-1 overflow-x-auto">
            {["All", "Fighters", "Weapons", "Sensors", "Drones", "Infrastructure", "Other"].map((c) => (
              <button
                key={c}
                type="button"
                onClick={() => setCategory(c)}
                className={[
                  "flex-shrink-0 px-2.5 py-1.5 text-xs font-semibold rounded whitespace-nowrap",
                  category === c ? "bg-amber-600 text-slate-900" : "text-slate-300",
                ].join(" ")}
              >
                {c === "Infrastructure" ? "Infra" : c} ({categoryCounts[c] ?? 0})
              </button>
            ))}
          </div>

          <div className="flex items-center justify-end gap-2">
            <span className="text-[10px] opacity-60">Sort</span>
            <select
              value={sortMode}
              onChange={(e) => setSortMode(e.target.value as "name" | "duration" | "cost")}
              className="bg-slate-800 border border-slate-700 rounded px-2 py-1 text-[11px]"
              aria-label="Sort R&D catalog"
            >
              <option value="name">Name</option>
              <option value="duration">Duration ↑</option>
              <option value="cost">Cost ↑</option>
            </select>
          </div>

          {filteredCatalog.length === 0 ? (
            <p className="text-xs opacity-60 py-4 text-center">No programs in this category.</p>
          ) : (
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
              {filteredCatalog.map((spec) => (
                <CatalogRow
                  key={spec.id}
                  spec={spec}
                  onStart={onStart}
                  disabled={disabled}
                  dependentNames={(dependentsByProgram[spec.id] ?? []).map(
                    (pid) => catalog.find((c) => c.id === pid)?.name ?? pid,
                  )}
                />
              ))}
            </div>
          )}
        </section>
      )}
    </div>
  );
}
