import { useMemo, useState } from "react";
import type {
  RDProgramSpec, RDProgramState, RDFundingLevel, RDUpdatePayload,
} from "../../lib/types";
import { CommitHoldButton } from "../primitives/CommitHoldButton";

export interface RDDashboardProps {
  catalog: RDProgramSpec[];
  active: RDProgramState[];
  onStart: (programId: string, fundingLevel: RDFundingLevel) => void;
  onUpdate: (programId: string, payload: RDUpdatePayload) => void;
  disabled?: boolean;
}

const FUNDING_LEVELS: RDFundingLevel[] = ["slow", "standard", "accelerated"];

function specOf(catalog: RDProgramSpec[], programId: string): RDProgramSpec | undefined {
  return catalog.find((s) => s.id === programId);
}

function ActiveRow({
  state, spec, onUpdate,
}: { state: RDProgramState; spec?: RDProgramSpec; onUpdate: RDDashboardProps["onUpdate"] }) {
  const [confirming, setConfirming] = useState(false);

  const statusBadge =
    state.status === "completed"
      ? { text: "Completed", classes: "bg-emerald-900/50 text-emerald-200" }
      : state.status === "cancelled"
      ? { text: "Cancelled", classes: "bg-slate-800 text-slate-300" }
      : { text: "Active", classes: "bg-amber-900/50 text-amber-200" };

  return (
    <div className="bg-slate-900/70 border border-slate-800 rounded-lg p-3 space-y-2">
      <div className="flex items-baseline justify-between gap-2">
        <div className="text-sm font-semibold">{spec?.name ?? state.program_id}</div>
        <span className={`text-[10px] px-2 py-0.5 rounded-full uppercase ${statusBadge.classes}`}>
          {statusBadge.text}
        </span>
      </div>
      <div className="relative h-1.5 rounded bg-slate-800 overflow-hidden">
        <div
          className="absolute inset-y-0 left-0 bg-amber-500"
          style={{ width: `${Math.min(100, state.progress_pct)}%` }}
        />
      </div>
      <div className="flex items-center justify-between text-xs opacity-80">
        <span>Progress {state.progress_pct}%</span>
        <span>Invested ₹{state.cost_invested_cr.toLocaleString("en-US")} cr</span>
      </div>

      {state.status === "active" && (
        <>
          <div className="flex items-center gap-2">
            <span className="text-xs opacity-60">Funding: {state.funding_level}</span>
            <div className="flex gap-1">
              {FUNDING_LEVELS.map((lvl) => (
                <button
                  key={lvl}
                  type="button"
                  aria-label={`Set funding ${lvl}`}
                  onClick={() => onUpdate(state.program_id, { funding_level: lvl })}
                  className={[
                    "text-xs px-2 py-0.5 rounded",
                    lvl === state.funding_level
                      ? "bg-amber-600 text-slate-900 font-semibold"
                      : "bg-slate-800 hover:bg-slate-700 text-slate-200",
                  ].join(" ")}
                >
                  {lvl === "slow" ? "↓" : lvl === "standard" ? "●" : "↑"}
                </button>
              ))}
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
  spec, onStart, disabled,
}: { spec: RDProgramSpec; onStart: RDDashboardProps["onStart"]; disabled?: boolean }) {
  const [funding, setFunding] = useState<RDFundingLevel>("standard");
  return (
    <div className="bg-slate-900/50 border border-slate-800 rounded-lg p-3 space-y-2">
      <div className="text-sm font-semibold">{spec.name}</div>
      <div className="text-xs opacity-70">{spec.description}</div>
      <div className="text-xs opacity-60">
        Duration ~{spec.base_duration_quarters}q • Base cost ₹
        {spec.base_cost_cr.toLocaleString("en-US")} cr
        {spec.dependencies.length > 0 && (
          <> • Depends on: {spec.dependencies.join(", ")}</>
        )}
      </div>
      <div className="flex items-center gap-2">
        <span className="text-xs opacity-60">Speed</span>
        <div className="flex gap-1">
          {FUNDING_LEVELS.map((lvl) => (
            <button
              key={lvl}
              type="button"
              aria-label={`Set funding ${lvl}`}
              onClick={() => setFunding(lvl)}
              className={[
                "text-xs px-2 py-0.5 rounded",
                lvl === funding
                  ? "bg-amber-600 text-slate-900 font-semibold"
                  : "bg-slate-800 hover:bg-slate-700",
              ].join(" ")}
            >
              {lvl === "slow" ? "↓" : lvl === "standard" ? "●" : "↑"}
            </button>
          ))}
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

  return (
    <div className="space-y-6">
      <section className="space-y-3">
        <h3 className="text-sm font-bold uppercase tracking-wider opacity-80">
          Active programs
        </h3>
        {active.length === 0 ? (
          <p className="text-xs opacity-60">No R&D programs underway.</p>
        ) : (
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
            {active.map((a) => (
              <ActiveRow
                key={a.id}
                state={a}
                spec={specOf(catalog, a.program_id)}
                onUpdate={onUpdate}
              />
            ))}
          </div>
        )}
      </section>

      <section className="space-y-3">
        <h3 className="text-sm font-bold uppercase tracking-wider opacity-80">
          Catalog
        </h3>
        {availableCatalog.length === 0 ? (
          <p className="text-xs opacity-60">All catalog programs are already underway.</p>
        ) : (
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
            {availableCatalog.map((spec) => (
              <CatalogRow
                key={spec.id}
                spec={spec}
                onStart={onStart}
                disabled={disabled}
              />
            ))}
          </div>
        )}
      </section>
    </div>
  );
}
