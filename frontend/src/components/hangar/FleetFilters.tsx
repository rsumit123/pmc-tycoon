export type HangarSortMode = "readiness_asc" | "readiness_desc" | "name" | "xp_desc";

export interface FleetFiltersProps {
  roleFilter: string;
  onRoleChange: (v: string) => void;
  sortMode: HangarSortMode;
  onSortChange: (m: HangarSortMode) => void;
}

const ROLE_OPTIONS = ["All", "Fighters", "AWACS", "Tanker", "Drones"];
const SORT_LABELS: Record<HangarSortMode, string> = {
  readiness_asc: "Readiness \u2191",
  readiness_desc: "Readiness \u2193",
  name: "Name A-Z",
  xp_desc: "XP \u2193",
};

export function FleetFilters({ roleFilter, onRoleChange, sortMode, onSortChange }: FleetFiltersProps) {
  return (
    <div className="space-y-2">
      <div className="flex flex-wrap gap-1.5">
        {ROLE_OPTIONS.map((r) => (
          <button
            key={r}
            type="button"
            onClick={() => onRoleChange(r)}
            className={[
              "text-[11px] rounded-full px-2.5 py-1 border",
              r === roleFilter
                ? "bg-amber-600 border-amber-500 text-slate-900 font-semibold"
                : "bg-slate-800 border-slate-700 text-slate-300",
            ].join(" ")}
          >{r}</button>
        ))}
      </div>
      <div className="flex items-center gap-2 text-xs">
        <span className="opacity-60">Sort</span>
        <select
          value={sortMode}
          onChange={(e) => onSortChange(e.target.value as HangarSortMode)}
          className="bg-slate-900 border border-slate-700 rounded px-2 py-1 text-xs"
        >
          {(Object.keys(SORT_LABELS) as HangarSortMode[]).map((m) => (
            <option key={m} value={m}>{SORT_LABELS[m]}</option>
          ))}
        </select>
      </div>
    </div>
  );
}
