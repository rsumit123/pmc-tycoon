import type { DiplomacyResponse, DiplomaticTier } from "../../lib/types";

const TIER_COLOR: Record<DiplomaticTier, string> = {
  friendly: "bg-emerald-700 text-emerald-100",
  neutral:  "bg-slate-700 text-slate-200",
  cool:     "bg-amber-800 text-amber-100",
  cold:     "bg-orange-800 text-orange-100",
  hostile:  "bg-rose-700 text-rose-100",
};

const TIER_DOT_COUNT: Record<DiplomaticTier, number> = {
  hostile: 1, cold: 2, cool: 3, neutral: 4, friendly: 5,
};

export function DiplomacyMeter({
  diplomacy, compact = false,
}: { diplomacy: DiplomacyResponse | null; compact?: boolean }) {
  if (!diplomacy) return null;
  if (compact) {
    return (
      <div className="flex items-center gap-1">
        {diplomacy.factions.map((f) => (
          <span
            key={f.faction}
            className={`text-[10px] px-1.5 py-0.5 rounded font-mono ${TIER_COLOR[f.tier]}`}
            title={`${f.faction} · ${f.tier} · ${f.temperature_pct}`}
          >
            {f.faction[0]}
          </span>
        ))}
      </div>
    );
  }
  return (
    <section className="bg-slate-900 border border-slate-800 rounded-lg p-3">
      <h3 className="text-xs font-semibold uppercase opacity-70 mb-2">🤝 Diplomatic temperature</h3>
      <ul className="space-y-1.5">
        {diplomacy.factions.map((f) => (
          <li key={f.faction} className="flex items-center justify-between gap-2 text-xs">
            <span className="font-semibold w-12">{f.faction}</span>
            <span className={`px-2 py-0.5 rounded text-[10px] ${TIER_COLOR[f.tier]}`}>{f.tier}</span>
            <span className="font-mono opacity-60 text-[10px]">
              {"●".repeat(TIER_DOT_COUNT[f.tier])}
              <span className="opacity-30">{"○".repeat(5 - TIER_DOT_COUNT[f.tier])}</span>
            </span>
            <span className="font-mono opacity-70 text-[10px] w-8 text-right">{f.temperature_pct}</span>
          </li>
        ))}
      </ul>
      {diplomacy.grant_bump_pct > 0 && (
        <p className="text-[10px] opacity-70 mt-2">
          War-footing grant bump: <span className="text-amber-300 font-semibold">+{diplomacy.grant_bump_pct}%</span>
        </p>
      )}
    </section>
  );
}
