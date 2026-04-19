import { Link, useParams } from "react-router-dom";
import type { UnlocksResponse } from "../../lib/types";

export function UnlocksFeed({ unlocks }: { unlocks: UnlocksResponse }) {
  const { id } = useParams<{ id: string }>();
  const cid = Number(id);
  const total = unlocks.missiles.length + unlocks.ad_systems.length
             + unlocks.isr_drones.length + unlocks.strike_platforms.length;

  if (total === 0) {
    return (
      <div className="bg-slate-900 border border-slate-800 rounded-lg p-6 text-center">
        <p className="text-sm opacity-70">No unlocks yet.</p>
        <p className="text-xs opacity-50 mt-2">
          Complete R&D programs to unlock missiles, AD systems, and drones.
        </p>
      </div>
    );
  }

  return (
    <div className="space-y-2">
      <div className="text-xs opacity-70">
        {total} unlock{total === 1 ? "" : "s"} available — explore the tabs above.
      </div>
      {unlocks.missiles.map((m) => (
        <div key={m.target_id} className="bg-emerald-950/30 border border-emerald-800 rounded-lg p-3">
          <div className="text-[10px] uppercase opacity-70">Missile</div>
          <div className="text-sm font-semibold">{m.name.replace(/_/g, " ")}</div>
          <div className="text-[10px] opacity-70">{m.description}</div>
        </div>
      ))}
      {unlocks.ad_systems.map((a) => (
        <div key={a.target_id} className="bg-emerald-950/30 border border-emerald-800 rounded-lg p-3">
          <div className="text-[10px] uppercase opacity-70">AD System</div>
          <div className="text-sm font-semibold">{a.name}</div>
          <div className="text-[10px] opacity-70">{a.description}</div>
        </div>
      ))}
      {unlocks.isr_drones.map((d) => (
        <div key={d.target_id} className="bg-emerald-950/30 border border-emerald-800 rounded-lg p-3">
          <div className="text-[10px] uppercase opacity-70">ISR Drone</div>
          <div className="text-sm font-semibold">{d.name}</div>
          <div className="text-[10px] opacity-70">{d.description}</div>
        </div>
      ))}
      {unlocks.strike_platforms.map((p) => (
        <div key={p.target_id} className="bg-emerald-950/30 border border-emerald-800 rounded-lg p-3">
          <div className="text-[10px] uppercase opacity-70">Airframe Unlocked</div>
          <div className="text-sm font-semibold">{p.name}</div>
          <div className="text-[10px] opacity-70 mb-2">{p.description}</div>
          <Link
            to={`/campaign/${cid}/procurement?tab=acquisitions`}
            className="inline-block text-xs rounded bg-amber-600 text-slate-900 px-2 py-1 font-semibold hover:bg-amber-500"
          >Procure via Acquisitions →</Link>
        </div>
      ))}
    </div>
  );
}
