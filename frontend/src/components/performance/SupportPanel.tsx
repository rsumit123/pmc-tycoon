import type { SupportStat } from "../../lib/types";

const ASSET_LABELS: Record<SupportStat["asset"], string> = {
  awacs: "AWACS",
  tanker: "Tanker (IL-78)",
  sead: "SEAD package",
};

function deltaDisplay(s: SupportStat): { text: string; color: string } {
  if (s.with_sorties === 0 || s.without_sorties === 0) {
    return { text: "—", color: "opacity-50" };
  }
  const sign = s.delta_win_rate_pp > 0 ? "+" : "";
  const color = s.delta_win_rate_pp > 0
    ? "text-emerald-300"
    : s.delta_win_rate_pp < 0
      ? "text-rose-300"
      : "opacity-70";
  return { text: `${sign}${s.delta_win_rate_pp} pp`, color };
}

export function SupportPanel({ support }: { support: SupportStat[] }) {
  return (
    <div className="space-y-2">
      {support.map((s) => {
        const d = deltaDisplay(s);
        const isUnused = s.with_sorties === 0;
        return (
          <div
            key={s.asset}
            className={[
              "bg-slate-900 border rounded-lg p-3",
              isUnused ? "border-slate-800 opacity-70" : "border-slate-700",
            ].join(" ")}
          >
            <div className="flex items-baseline justify-between gap-2 mb-1">
              <span className="text-sm font-semibold">{ASSET_LABELS[s.asset]}</span>
              <span className={`text-sm font-mono font-semibold ${d.color}`}>{d.text}</span>
            </div>
            {isUnused ? (
              <p className="text-[11px] italic opacity-70">
                Not yet toggled on in any committed vignette — no delta to report.
              </p>
            ) : (
              <div className="grid grid-cols-2 gap-2 text-[11px]">
                <div>
                  <span className="opacity-60">With:</span>{" "}
                  <span className="font-mono">{s.with_sorties} sorties</span>
                  <span className="font-semibold text-emerald-300 ml-1">
                    {s.with_win_rate_pct}%
                  </span>
                </div>
                <div>
                  <span className="opacity-60">Without:</span>{" "}
                  <span className="font-mono">{s.without_sorties} sorties</span>
                  <span className="font-semibold text-rose-300 ml-1">
                    {s.without_win_rate_pct}%
                  </span>
                </div>
              </div>
            )}
          </div>
        );
      })}
    </div>
  );
}
