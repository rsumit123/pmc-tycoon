import { useState, useMemo } from "react";
import type { EventTraceEntry } from "../../lib/types";
import { NatoSymbol } from "./NatoSymbol";
import { bearingFromFactionToAO } from "./attackAxis";
import { EventTicker } from "./EventTicker";

export interface TacticalReplayProps {
  eventTrace: EventTraceEntry[];
  indPlatforms: { platform_id: string; count: number }[];
  advPlatforms: { platform_id: string; count: number }[];
  ao?: { lat: number; lon: number };
  faction?: string;
}

interface Airframe {
  id: string;
  side: "ind" | "adv";
  platformId: string;
  alive: boolean;
  killedAtPhase: number | null;
}

type Phase = "detection" | "bvr1" | "bvr2" | "wvr" | "egress";
const PHASES: Phase[] = ["detection", "bvr1", "bvr2", "wvr", "egress"];
const PHASE_LABELS: Record<Phase, string> = {
  detection: "Detection Window (T+0)",
  bvr1: "BVR Round 1 — 120 km",
  bvr2: "BVR Round 2 — 50 km",
  wvr: "WVR Merge — 15 km",
  egress: "Egress + Outcome",
};
const PHASE_DISTANCES: Record<Phase, number> = { detection: 200, bvr1: 120, bvr2: 50, wvr: 15, egress: 200 };

function buildAirframes(
  indPlatforms: { platform_id: string; count: number }[],
  advPlatforms: { platform_id: string; count: number }[],
): Airframe[] {
  const frames: Airframe[] = [];
  let idx = 0;
  for (const p of indPlatforms) {
    for (let i = 0; i < p.count; i++) {
      frames.push({ id: `ind-${idx++}`, side: "ind", platformId: p.platform_id, alive: true, killedAtPhase: null });
    }
  }
  idx = 0;
  for (const p of advPlatforms) {
    for (let i = 0; i < p.count; i++) {
      frames.push({ id: `adv-${idx++}`, side: "adv", platformId: p.platform_id, alive: true, killedAtPhase: null });
    }
  }
  return frames;
}

function killsUpToPhase(trace: EventTraceEntry[], phaseIdx: number): Set<string> {
  const killed = new Set<string>();
  const maxT = [2, 5, 8, 11, 12][phaseIdx];
  let indKillIdx = 0;
  let advKillIdx = 0;
  for (const e of trace) {
    if (e.t_min > maxT) break;
    if (e.kind === "kill") {
      const side = e.side as string;
      const victimSide = side === "ind" ? "adv" : "ind";
      if (victimSide === "ind") {
        killed.add(`ind-${indKillIdx++}`);
      } else {
        killed.add(`adv-${advKillIdx++}`);
      }
    }
  }
  return killed;
}

export function TacticalReplay({ eventTrace, indPlatforms, advPlatforms, ao, faction }: TacticalReplayProps) {
  const [phaseIdx, setPhaseIdx] = useState(0);
  const phase = PHASES[phaseIdx];

  const allFrames = useMemo(
    () => buildAirframes(indPlatforms, advPlatforms),
    [indPlatforms, advPlatforms],
  );

  const killedIds = useMemo(
    () => killsUpToPhase(eventTrace, phaseIdx),
    [eventTrace, phaseIdx],
  );

  const W = 360;
  const H = 300;
  const centerX = W / 2;
  const dist = PHASE_DISTANCES[phase];

  const bearing = ao && faction ? bearingFromFactionToAO(faction, ao) : 90;
  // Attack comes from the faction's direction; if bearing > 180 the faction is to the west/south-west,
  // so adversary should appear on the left side of the display.
  const advOnLeft = bearing > 180;
  const indX = advOnLeft ? centerX + dist / 2 : centerX - dist / 2;
  const advX = advOnLeft ? centerX - dist / 2 : centerX + dist / 2;
  const indFrames = allFrames.filter((f) => f.side === "ind");
  const advFrames = allFrames.filter((f) => f.side === "adv");

  return (
    <div className="bg-slate-900 border border-slate-700 rounded-lg p-3 mt-4">
      <h3 className="text-sm font-bold mb-2 text-slate-300">Tactical Replay</h3>

      <div className="flex flex-wrap gap-1 mb-3">
        {PHASES.map((p, i) => (
          <button
            key={p}
            onClick={() => setPhaseIdx(i)}
            className={`text-xs px-2 py-1 rounded ${
              i === phaseIdx ? "bg-amber-600 text-slate-900 font-bold" : "bg-slate-800 text-slate-400"
            }`}
          >
            {p.toUpperCase()}
          </button>
        ))}
      </div>

      <p className="text-xs text-slate-400 mb-2">{PHASE_LABELS[phase]}</p>

      <svg viewBox={`0 0 ${W} ${H}`} className="w-full max-w-[360px] mx-auto" role="img" aria-label={`tactical replay phase ${phase}`}>
        <rect width={W} height={H} fill="#0f172a" rx={4} />

        {/* N-pointer */}
        <g transform="translate(8, 20)">
          <path d="M 0 10 L 5 0 L 10 10 L 5 7 Z" fill="#64748b" />
          <text x={5} y={24} textAnchor="middle" fill="#64748b" fontSize={8}>N</text>
        </g>

        {/* Distance line */}
        <line x1={indX} y1={H / 2} x2={advX} y2={H / 2} stroke="#334155" strokeWidth={1} strokeDasharray="4 4" />
        <text x={centerX} y={H / 2 + 4} textAnchor="middle" fill="#475569" fontSize={10}>
          {phase === "detection" ? "" : `${dist} km`}
        </text>

        {/* IND side */}
        {indFrames.map((f, i) => {
          const rows = Math.ceil(indFrames.length / 4);
          const col = i % 4;
          const row = Math.floor(i / 4);
          const x = indX - 30 + col * 20;
          const y = 40 + row * 40 + (rows > 4 ? 0 : (H - 80) / 2 - rows * 20);
          return (
            <NatoSymbol
              key={f.id}
              side="ind"
              platformId={f.platformId}
              alive={!killedIds.has(f.id)}
              x={x}
              y={y}
            />
          );
        })}

        {/* ADV side */}
        {advFrames.map((f, i) => {
          const rows = Math.ceil(advFrames.length / 4);
          const col = i % 4;
          const row = Math.floor(i / 4);
          const x = advX - 10 + col * 20;
          const y = 40 + row * 40 + (rows > 4 ? 0 : (H - 80) / 2 - rows * 20);
          return (
            <NatoSymbol
              key={f.id}
              side="adv"
              platformId={f.platformId}
              alive={!killedIds.has(f.id)}
              x={x}
              y={y}
            />
          );
        })}

        {/* Side labels */}
        <text x={indX - 20} y={20} fill="#3b82f6" fontSize={11} fontWeight="bold">IND</text>
        <text x={advX} y={20} fill="#ef4444" fontSize={11} fontWeight="bold">ADV</text>
      </svg>

      <div className="mt-3">
        <EventTicker
          events={eventTrace}
          phaseRange={([[0, 2], [3, 5], [6, 8], [9, 11], [12, 12]] as [number, number][])[phaseIdx]}
        />
      </div>
    </div>
  );
}
