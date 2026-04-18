import type { EventTraceEntry } from "../../lib/types";

export interface EventTickerProps {
  events: EventTraceEntry[];
  phaseRange: [number, number];
}

function describeEvent(e: EventTraceEntry): string {
  switch (e.kind) {
    case "detection":
      return `Detection: ${e.advantage} advantage (IAF radar ${e.ind_radar_km}km / ADV ${e.adv_radar_km}km)`;
    case "bvr_launch":
    case "wvr_launch":
      return `${String(e.side).toUpperCase()} ${e.attacker_platform} → ${e.target_platform}: ${String(e.weapon).toUpperCase()} (PK ${Math.round((e.pk as number) * 100)}%, ${e.distance_km}km)`;
    case "kill":
      return `KILL — ${e.attacker_platform} splashed ${e.victim_platform} (${e.weapon})`;
    case "no_hits":
      return `${String(e.side).toUpperCase()} — no hits this round`;
    case "vid_skip_bvr":
      return `BVR skipped: ${e.reason}`;
    case "egress":
      return `Egress: ${e.ind_survivors} IAF survivors, ${e.adv_survivors} ADV survivors`;
    case "outcome":
      return `Outcome locked`;
    default:
      return e.kind;
  }
}

export function EventTicker({ events, phaseRange }: EventTickerProps) {
  const filtered = events.filter((e) => e.t_min >= phaseRange[0] && e.t_min <= phaseRange[1]);
  if (filtered.length === 0) return <p className="text-xs opacity-60">No events this phase.</p>;

  return (
    <ul className="space-y-1 text-[11px] font-mono">
      {filtered.map((e, i) => {
        const text = describeEvent(e);
        const color =
          e.kind === "kill"
            ? "text-red-300"
            : e.kind === "bvr_launch" || e.kind === "wvr_launch"
              ? "text-amber-300"
              : e.kind === "detection"
                ? "text-slate-300"
                : "text-slate-400";
        return (
          <li key={i} className={color}>
            <span className="opacity-60">T+{String(e.t_min).padStart(2, "0")}</span> · {text}
          </li>
        );
      })}
    </ul>
  );
}
