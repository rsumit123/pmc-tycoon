import { useState } from "react";
import { Link, useParams } from "react-router-dom";
import type { UnlocksResponse } from "../../lib/types";
import { InfoButton, WeaponInfo, ADSystemInfo, RoleInfo } from "../primitives/RoleInfo";

type OpenInfo =
  | { kind: "missile"; idx: number }
  | { kind: "ad_system"; idx: number }
  | { kind: "isr_drone"; idx: number }
  | { kind: "strike"; idx: number }
  | null;

export function UnlocksFeed({ unlocks }: { unlocks: UnlocksResponse }) {
  const { id } = useParams<{ id: string }>();
  const cid = Number(id);
  const [openInfo, setOpenInfo] = useState<OpenInfo>(null);
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
      {unlocks.missiles.map((m, i) => (
        <div key={m.target_id} className="bg-emerald-950/30 border border-emerald-800 rounded-lg p-3">
          <div className="text-[10px] uppercase opacity-70">Missile</div>
          <div className="text-sm font-semibold flex items-center gap-1.5">
            {m.name.replace(/_/g, " ")}
            <InfoButton onClick={() => setOpenInfo({ kind: "missile", idx: i })} ariaLabel={`${m.name} info`} />
          </div>
          <div className="text-[10px] opacity-70">{m.description}</div>
        </div>
      ))}
      {unlocks.ad_systems.map((a, i) => (
        <div key={a.target_id} className="bg-emerald-950/30 border border-emerald-800 rounded-lg p-3">
          <div className="text-[10px] uppercase opacity-70">AD System</div>
          <div className="text-sm font-semibold flex items-center gap-1.5">
            {a.name}
            <InfoButton onClick={() => setOpenInfo({ kind: "ad_system", idx: i })} ariaLabel={`${a.name} info`} />
          </div>
          <div className="text-[10px] opacity-70">{a.description}</div>
        </div>
      ))}
      {unlocks.isr_drones.map((d, i) => (
        <div key={d.target_id} className="bg-emerald-950/30 border border-emerald-800 rounded-lg p-3">
          <div className="text-[10px] uppercase opacity-70">ISR Drone</div>
          <div className="text-sm font-semibold flex items-center gap-1.5">
            {d.name}
            <InfoButton onClick={() => setOpenInfo({ kind: "isr_drone", idx: i })} ariaLabel={`${d.name} info`} />
          </div>
          <div className="text-[10px] opacity-70">{d.description}</div>
        </div>
      ))}
      {unlocks.strike_platforms.map((p, i) => (
        <div key={p.target_id} className="bg-emerald-950/30 border border-emerald-800 rounded-lg p-3">
          <div className="text-[10px] uppercase opacity-70">Airframe Unlocked</div>
          <div className="text-sm font-semibold flex items-center gap-1.5">
            {p.name}
            <InfoButton onClick={() => setOpenInfo({ kind: "strike", idx: i })} ariaLabel={`${p.name} info`} />
          </div>
          <div className="text-[10px] opacity-70 mb-2">{p.description}</div>
          <Link
            to={`/campaign/${cid}/procurement?tab=acquisitions&view=offers&focus=${p.target_id}`}
            className="inline-block text-xs rounded bg-amber-600 text-slate-900 px-2 py-1 font-semibold hover:bg-amber-500"
          >Procure via Acquisitions →</Link>
        </div>
      ))}

      {openInfo?.kind === "missile" && (() => {
        const m = unlocks.missiles[openInfo.idx];
        return (
          <WeaponInfo
            open onClose={() => setOpenInfo(null)}
            name={m.name} weaponClass={m.weapon_class}
            nezKm={m.nez_km} maxRangeKm={m.max_range_km}
          />
        );
      })()}
      {openInfo?.kind === "ad_system" && (() => {
        const a = unlocks.ad_systems[openInfo.idx];
        return (
          <ADSystemInfo
            open onClose={() => setOpenInfo(null)}
            name={a.name} coverageKm={a.coverage_km} maxPk={a.max_pk}
            installCostCr={a.install_cost_cr} description={a.description}
          />
        );
      })()}
      {openInfo?.kind === "isr_drone" && (() => {
        const d = unlocks.isr_drones[openInfo.idx];
        return (
          <RoleInfo
            open onClose={() => setOpenInfo(null)}
            title={d.name} description={d.description}
            role="isr" unlockKind="isr_drone" unlockTarget={d.target_id}
          />
        );
      })()}
      {openInfo?.kind === "strike" && (() => {
        const p = unlocks.strike_platforms[openInfo.idx];
        return (
          <RoleInfo
            open onClose={() => setOpenInfo(null)}
            title={p.name} description={p.description}
            role="stealth_strike" unlockKind="strike_platform" unlockTarget={p.target_id}
          />
        );
      })()}
    </div>
  );
}
