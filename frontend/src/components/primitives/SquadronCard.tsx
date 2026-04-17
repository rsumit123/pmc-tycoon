import type { BaseSquadronSummary, Platform } from "../../lib/types";
import { useLongPress } from "./useLongPress";

export interface SquadronCardProps {
  squadron: BaseSquadronSummary;
  platform?: Platform;
  onLongPress?: () => void;
  onClick?: () => void;
  className?: string;
}

export function SquadronCard({
  squadron, platform, onLongPress, onClick, className = "",
}: SquadronCardProps) {
  const handlers = useLongPress({
    onLongPress: () => onLongPress?.(),
    onClick: () => onClick?.(),
    durationMs: 400,
  });

  const readinessHue =
    squadron.readiness_pct >= 75 ? "text-emerald-300"
    : squadron.readiness_pct >= 55 ? "text-amber-300"
    : "text-rose-300";

  return (
    <div
      role="button"
      tabIndex={0}
      {...handlers}
      className={[
        "bg-slate-900/70 border border-slate-800 rounded-lg p-3 space-y-2 select-none",
        "hover:border-slate-700 active:border-amber-600 cursor-pointer",
        className,
      ].join(" ")}
    >
      <div className="flex items-baseline justify-between gap-2">
        <div className="text-sm font-semibold truncate">{squadron.name}</div>
        <span className="text-xs opacity-60">{squadron.call_sign}</span>
      </div>
      <div className="text-xs opacity-80">
        {platform?.name ?? squadron.platform_id}
      </div>
      <div className="flex items-center justify-between text-xs">
        <span>Strength: <span className="font-semibold">{squadron.strength}</span></span>
        <span className={readinessHue}>Ready: {squadron.readiness_pct}%</span>
      </div>
      {squadron.ace_name && (
        <div className="text-[11px] italic opacity-80 pt-1 border-t border-slate-800">
          {squadron.ace_name}
        </div>
      )}
    </div>
  );
}
