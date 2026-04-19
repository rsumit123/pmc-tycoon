import type { ISRDroneUnlock, StrikePlatformUnlock, HangarSquadron } from "../../lib/types";

export interface DroneRosterProps {
  isrDrones: ISRDroneUnlock[];
  strikeDrones: StrikePlatformUnlock[];
  squadrons: HangarSquadron[];
}

export function DroneRoster({ isrDrones, strikeDrones, squadrons }: DroneRosterProps) {
  const operatingDrones = squadrons.filter(
    (s) => ["tapas_uav", "ghatak_ucav"].includes(s.platform_id),
  );

  return (
    <div className="space-y-4">
      <section>
        <h3 className="text-xs font-semibold uppercase opacity-70 mb-2">Unlocked ISR Drones</h3>
        {isrDrones.length === 0 ? (
          <p className="text-xs opacity-60">No ISR drones unlocked. Complete Tapas UAV or Netra Mk2 R&D.</p>
        ) : isrDrones.map((d) => (
          <div key={d.target_id} className="bg-slate-900 border border-slate-800 rounded-lg p-3 mb-2">
            <div className="text-sm font-semibold">{d.name}</div>
            <div className="text-[10px] opacity-70">{d.description}</div>
            <div className="text-[11px] opacity-80 mt-1">Orbit radius: {d.coverage_km}km</div>
          </div>
        ))}
      </section>

      <section>
        <h3 className="text-xs font-semibold uppercase opacity-70 mb-2">Unlocked Strike Drones</h3>
        {strikeDrones.length === 0 ? (
          <p className="text-xs opacity-60">No strike drones unlocked. Complete Ghatak UCAV R&D.</p>
        ) : strikeDrones.map((d) => (
          <div key={d.target_id} className="bg-slate-900 border border-slate-800 rounded-lg p-3 mb-2">
            <div className="text-sm font-semibold">{d.name}</div>
            <div className="text-[10px] opacity-70">{d.description}</div>
            <div className="text-[11px] opacity-60 mt-1">Procure via Acquisitions — unmanned strike role.</div>
          </div>
        ))}
      </section>

      {operatingDrones.length > 0 && (
        <section>
          <h3 className="text-xs font-semibold uppercase opacity-70 mb-2">Operating Drone Squadrons</h3>
          {operatingDrones.map((sq) => (
            <div key={sq.id} className="bg-slate-900 border border-slate-800 rounded-lg p-3 mb-2">
              <div className="text-sm font-semibold">{sq.name}</div>
              <div className="text-[10px] opacity-60">
                {sq.platform_name} · {sq.base_name} · {sq.strength} drones
              </div>
            </div>
          ))}
        </section>
      )}
    </div>
  );
}
