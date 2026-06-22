const RELATIONS = [
  { country: "France", code: "FR", level: "allied" as const },
  { country: "Russia", code: "RU", level: "warm" as const },
  { country: "United States", code: "US", level: "warm" as const },
  { country: "Israel", code: "IL", level: "allied" as const },
  { country: "Sweden", code: "SE", level: "neutral" as const },
  { country: "European Union", code: "EU", level: "warm" as const },
];

const LEVEL_COLORS: Record<string, string> = {
  allied: "text-emerald-400 bg-emerald-900/30",
  warm: "text-amber-400 bg-amber-900/30",
  neutral: "text-slate-400 bg-slate-800",
  cool: "text-sky-400 bg-sky-900/30",
  hostile: "text-rose-400 bg-rose-900/30",
};

export function DiplomacyStrip() {
  return (
    <div className="mb-4">
      <h4 className="text-sm text-slate-500 mb-2">Supplier Relations</h4>
      <div className="flex flex-wrap gap-2">
        {RELATIONS.map((r) => (
          <div
            key={r.code}
            className={`px-3 py-1.5 rounded-full text-xs font-medium ${LEVEL_COLORS[r.level]}`}
          >
            <span className="font-semibold">{r.country}</span>
            <span className="ml-1.5 opacity-75">{r.level}</span>
          </div>
        ))}
      </div>
    </div>
  );
}
