import { useRef, useCallback } from "react";
import type { CampaignSummary } from "../../lib/types";
import { ForceEvolutionChart } from "./ForceEvolutionChart";

export interface CampaignCardGeneratorProps {
  summary: CampaignSummary;
}

function computeGrade(won: number, total: number): string {
  if (total === 0) return "N/A";
  const ratio = won / total;
  if (ratio >= 0.9) return "S";
  if (ratio >= 0.8) return "A";
  if (ratio >= 0.65) return "B";
  if (ratio >= 0.5) return "C";
  if (ratio >= 0.35) return "D";
  return "F";
}

export function CampaignCardGenerator({ summary }: CampaignCardGeneratorProps) {
  const cardRef = useRef<HTMLDivElement>(null);
  const grade = computeGrade(summary.vignettes_won, summary.vignettes_total);

  const handleExport = useCallback(async () => {
    if (!cardRef.current) return;
    const html2canvas = (await import("html2canvas")).default;
    const canvas = await html2canvas(cardRef.current, {
      backgroundColor: "#020617",
      scale: 2,
    });
    const link = document.createElement("a");
    link.download = `${summary.name.replace(/\s+/g, "-").toLowerCase()}-card.png`;
    link.href = canvas.toDataURL("image/png");
    link.click();
  }, [summary.name]);

  const stats = [
    { label: "Squadrons", value: summary.force_structure.squadrons_end },
    { label: "Airframes", value: summary.force_structure.total_airframes },
    { label: "5th Gen", value: summary.force_structure.fifth_gen_squadrons },
    { label: "Vignettes Won", value: summary.vignettes_won },
    { label: "Vignettes Lost", value: summary.vignettes_lost },
    { label: "Aces", value: summary.ace_count },
  ];

  return (
    <div className="space-y-4">
      <div
        ref={cardRef}
        className="bg-slate-950 border border-slate-700 rounded-xl p-6 max-w-sm mx-auto"
      >
        <div className="flex items-center justify-between mb-4">
          <div>
            <h3 className="text-lg font-bold text-slate-100">{summary.name}</h3>
            <p className="text-xs text-slate-400">
              {summary.starting_year}–{summary.current_year} • {summary.difficulty}
            </p>
          </div>
          <div className="text-3xl font-black text-amber-400">{grade}</div>
        </div>
        <div className="grid grid-cols-3 gap-2 mb-4">
          {stats.map((s) => (
            <div key={s.label} className="text-center">
              <div className="text-lg font-mono font-bold text-slate-100">{s.value}</div>
              <div className="text-[10px] text-slate-400 uppercase tracking-wide">{s.label}</div>
            </div>
          ))}
        </div>
        <ForceEvolutionChart snapshots={summary.year_snapshots} width={320} height={80} />
      </div>
      <div className="text-center">
        <button
          onClick={handleExport}
          aria-label="Save campaign card as PNG"
          className="bg-amber-600 hover:bg-amber-500 text-slate-900 text-sm font-semibold rounded-lg px-4 py-2"
        >
          Save as PNG
        </button>
      </div>
    </div>
  );
}
