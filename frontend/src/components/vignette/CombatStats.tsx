import { useMemo } from "react";
import type { EventTraceEntry } from "../../lib/types";

export interface CombatStatsProps {
  eventTrace: EventTraceEntry[];
}

interface SideStats {
  shots: number;
  hits: number;
  byWeapon: Record<string, { shots: number; hits: number }>;
  avgPk: number;
}

function aggregate(trace: EventTraceEntry[]): { ind: SideStats; adv: SideStats; adEngagements: number } {
  const mk = (): SideStats => ({ shots: 0, hits: 0, byWeapon: {}, avgPk: 0 });
  const ind = mk();
  const adv = mk();
  let adEngagements = 0;
  const indPks: number[] = [];
  const advPks: number[] = [];

  for (const e of trace) {
    if (e.kind === "bvr_launch" || e.kind === "wvr_launch") {
      const side = e.side as string;
      const weapon = (e.weapon as string) ?? "unknown";
      const pk = (e.pk as number) ?? 0;
      const s = side === "ind" ? ind : adv;
      s.shots++;
      s.byWeapon[weapon] ??= { shots: 0, hits: 0 };
      s.byWeapon[weapon].shots++;
      if (side === "ind") indPks.push(pk); else advPks.push(pk);
    } else if (e.kind === "kill") {
      const side = e.side as string;
      const weapon = (e.weapon as string) ?? "unknown";
      const s = side === "ind" ? ind : adv;
      s.hits++;
      s.byWeapon[weapon] ??= { shots: 0, hits: 0 };
      s.byWeapon[weapon].hits++;
    } else if (e.kind === "ad_engagement") {
      adEngagements++;
    }
  }
  ind.avgPk = indPks.length ? indPks.reduce((a, b) => a + b, 0) / indPks.length : 0;
  adv.avgPk = advPks.length ? advPks.reduce((a, b) => a + b, 0) / advPks.length : 0;
  return { ind, adv, adEngagements };
}

function WeaponRow({ name, shots, hits }: { name: string; shots: number; hits: number }) {
  const rate = shots > 0 ? (hits / shots) * 100 : 0;
  return (
    <div className="flex items-center gap-2 text-[11px]">
      <span className="font-mono opacity-80 flex-1 truncate">
        {name.toUpperCase().replace(/_/g, " ")}
      </span>
      <span className="font-mono opacity-70 w-20 text-right">
        {hits}/{shots}
      </span>
      <span className={`font-mono w-10 text-right ${rate >= 30 ? "text-emerald-300" : rate >= 15 ? "text-amber-300" : "text-rose-300"}`}>
        {Math.round(rate)}%
      </span>
    </div>
  );
}

function SideColumn({ label, color, stats }: { label: string; color: string; stats: SideStats }) {
  const hitRate = stats.shots > 0 ? (stats.hits / stats.shots) * 100 : 0;
  const weapons = Object.entries(stats.byWeapon).sort((a, b) => b[1].shots - a[1].shots);
  return (
    <div className="flex-1 min-w-0">
      <div className={`text-[10px] uppercase font-bold ${color} mb-1`}>{label}</div>
      <div className="text-[11px] opacity-80 mb-2">
        <div>Missiles fired: <span className="font-mono">{stats.shots}</span></div>
        <div>Hits: <span className="font-mono">{stats.hits}</span></div>
        <div>Hit rate: <span className={`font-mono ${hitRate >= 30 ? "text-emerald-300" : hitRate >= 15 ? "text-amber-300" : "text-rose-300"}`}>
          {stats.shots ? Math.round(hitRate) : 0}%
        </span></div>
        <div>Avg PK: <span className="font-mono opacity-80">{(stats.avgPk * 100).toFixed(0)}%</span></div>
      </div>
      {weapons.length > 0 && (
        <div className="space-y-0.5">
          <div className="text-[10px] opacity-60 mb-1">By weapon:</div>
          {weapons.map(([name, w]) => (
            <WeaponRow key={name} name={name} shots={w.shots} hits={w.hits} />
          ))}
        </div>
      )}
    </div>
  );
}

export function CombatStats({ eventTrace }: CombatStatsProps) {
  const { ind, adv, adEngagements } = useMemo(() => aggregate(eventTrace), [eventTrace]);

  const hasData = ind.shots > 0 || adv.shots > 0 || adEngagements > 0;
  if (!hasData) return null;

  return (
    <div className="bg-slate-900 border border-slate-700 rounded-lg p-4">
      <h3 className="text-sm font-bold mb-3 text-slate-200">Combat Stats</h3>
      {adEngagements > 0 && (
        <div className="mb-3 text-xs bg-amber-950/30 border border-amber-800 rounded p-2">
          🎯 <span className="font-semibold">AD SAMs fired</span> — {adEngagements} pre-BVR engagement{adEngagements === 1 ? "" : "s"} shot down adversary airframes before air combat began.
        </div>
      )}
      <div className="flex gap-4">
        <SideColumn label="IAF" color="text-sky-300" stats={ind} />
        <div className="border-l border-slate-800" />
        <SideColumn label="ADV" color="text-red-300" stats={adv} />
      </div>
      <p className="text-[10px] opacity-60 italic mt-3">
        PK = probability of kill per shot (depends on missile NEZ, distance, adversary stealth, ROE, AWACS bonus).
      </p>
    </div>
  );
}
