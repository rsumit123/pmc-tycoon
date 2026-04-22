const ROLE_BLURBS: Record<string, string> = {
  multirole:
    "Multirole fighter — air-to-air + strike. The workhorse of your CAP and deep-strike packages.",
  air_superiority:
    "Air-superiority fighter — optimized for BVR engagements vs enemy fighters.",
  stealth:
    "Stealth fighter — low RCS cuts adversary detection range + missile P_kill. Elite but expensive.",
  stealth_strike:
    "Stealth strike / UCAV — penetrates defended airspace to hit high-value targets. No return fire role.",
  awacs:
    "AWACS — orbits give your committed package a detection + P_kill buff if within ~1000 km of the AO.",
  isr:
    "ISR drone — passively surveils adversary airbases within its orbit radius (Tapas 300 km / Heron TP 1000 km / MQ-9B 1800 km). Two roles: (1) each quarter generates per-base recon cards that reveal adversary force composition on the map with fog-of-war tiered by platform class (low/medium/high), and (2) boosts intel_quality on vignettes when the AO falls inside the orbit (+0.075/drone, cap 2).",
  tanker:
    "Aerial tanker — extends effective combat radius; enables longer strikes and persistent CAP.",
  bomber:
    "Strike bomber — heavy payload, typically cruise-missile delivery.",
  strike:
    "Strike platform — precision ground/anti-ship attack.",
  trainer:
    "Trainer aircraft — limited combat role.",
  interceptor:
    "Point-defense interceptor.",
};

const KIND_BLURBS: Record<string, string> = {
  missile:
    "Unlocks a missile type — equip it from the Armory to swap into a squadron's loadout (3-quarter rollout), and pre-purchase depot stock via Acquisitions > Missile Batches.",
  ad_system:
    "Unlocks an Air Defense system — install a battery at any base via Acquisitions > AD Batteries. Batteries engage cruise missiles + drones within their coverage radius before BVR combat fires.",
  isr_drone:
    "Unlocks an ISR drone platform — procure a squadron in Acquisitions > Aircraft. Orbit radius is per-platform (Tapas 300 km / Heron TP 1000 km / MQ-9B 1800 km). Adversary airbases inside the orbit appear on the map each quarter as red markers with tiered fog (low/medium/high fidelity). Base on border-forward airfields (Pathankot, Tezpur, Srinagar) to watch PAF + PLAAF depots.",
  strike_platform:
    "Unlocks a strike platform — procure via Acquisitions > Aircraft. Commits like any squadron in a vignette, but biased to strike/SEAD roles.",
  platform:
    "Unlocks a new aircraft platform — procure via Acquisitions > Aircraft.",
  none:
    "Doctrinal improvement — gates later R&D programs or a capability rather than producing a directly procurable item.",
};

export interface RoleInfoProps {
  open: boolean;
  onClose: () => void;
  title: string;
  description?: string;
  role?: string;
  unlockKind?: string;
  unlockTarget?: string;
}

export function RoleInfo({ open, onClose, title, description, role, unlockKind, unlockTarget }: RoleInfoProps) {
  if (!open) return null;
  const roleBlurb = role ? ROLE_BLURBS[role] : undefined;
  const kindBlurb = unlockKind ? KIND_BLURBS[unlockKind] : undefined;

  return (
    <div
      role="dialog"
      aria-label={`${title} info`}
      className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-950/80"
      onClick={onClose}
    >
      <div
        className="relative w-full max-w-md rounded-2xl bg-slate-900 border border-slate-800 p-5 space-y-3"
        onClick={(e) => e.stopPropagation()}
      >
        <button
          onClick={onClose}
          aria-label="close info"
          className="absolute top-3 right-3 w-8 h-8 rounded-full bg-slate-800 hover:bg-slate-700 text-slate-200"
        >
          ×
        </button>
        <h2 className="text-lg font-bold pr-8">{title}</h2>
        {description && <p className="text-xs opacity-80">{description}</p>}
        {role && (
          <div className="border border-slate-800 rounded-lg p-3 bg-slate-950/40 space-y-1">
            <div className="text-[10px] uppercase opacity-60">Role · {role}</div>
            <div className="text-xs">{roleBlurb ?? "Combat platform."}</div>
          </div>
        )}
        {unlockKind && (
          <div className="border border-slate-800 rounded-lg p-3 bg-slate-950/40 space-y-1">
            <div className="text-[10px] uppercase opacity-60">
              Unlocks · {unlockKind.replace(/_/g, " ")}
              {unlockTarget ? ` · ${unlockTarget}` : ""}
            </div>
            <div className="text-xs">{kindBlurb ?? ""}</div>
          </div>
        )}
      </div>
    </div>
  );
}

// --- Weapon / AD specialized info modals ---

export interface WeaponInfoProps {
  open: boolean;
  onClose: () => void;
  name: string;
  weaponClass?: string;
  nezKm?: number;
  maxRangeKm?: number;
  unitCostCr?: number;
}

const WEAPON_CLASS_BLURB: Record<string, string> = {
  a2a_bvr:         "Air-to-air BVR missile — fired from fighters at adversary aircraft beyond visual range. NEZ = no-escape zone (guaranteed-hit window), max range = outer launch envelope.",
  a2a_wvr:         "Air-to-air short-range missile — within visual range dogfight use. High off-boresight + IR homing.",
  anti_ship:       "Anti-ship cruise missile — sea-target profile with terminal sea-skim.",
  land_attack:     "Land-attack cruise missile — stand-off strike against fixed infrastructure.",
  anti_radiation: "Anti-radiation missile — homes on adversary radar emissions, key SEAD weapon.",
  glide_bomb:      "Guided glide bomb — stand-off precision weapon launched from outside MANPADS threat.",
};

export function WeaponInfo({ open, onClose, name, weaponClass, nezKm, maxRangeKm, unitCostCr }: WeaponInfoProps) {
  if (!open) return null;
  const blurb = weaponClass ? WEAPON_CLASS_BLURB[weaponClass] : undefined;
  return (
    <div role="dialog" aria-label={`${name} info`}
      className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-950/80"
      onClick={onClose}>
      <div className="relative w-full max-w-md rounded-2xl bg-slate-900 border border-slate-800 p-5 space-y-3"
        onClick={(e) => e.stopPropagation()}>
        <button onClick={onClose} aria-label="close info"
          className="absolute top-3 right-3 w-8 h-8 rounded-full bg-slate-800 hover:bg-slate-700 text-slate-200">×</button>
        <h2 className="text-lg font-bold pr-8">{name.toUpperCase()}</h2>
        {weaponClass && (
          <div className="border border-slate-800 rounded-lg p-3 bg-slate-950/40 space-y-1">
            <div className="text-[10px] uppercase opacity-60">Class · {weaponClass}</div>
            <div className="text-xs">{blurb ?? "Guided weapon."}</div>
          </div>
        )}
        <dl className="grid grid-cols-2 gap-2 text-xs">
          {nezKm !== undefined && (
            <div><dt className="opacity-60">NEZ</dt><dd>{nezKm} km</dd></div>
          )}
          {maxRangeKm !== undefined && (
            <div><dt className="opacity-60">Max range</dt><dd>{maxRangeKm} km</dd></div>
          )}
          {unitCostCr !== undefined && unitCostCr > 0 && (
            <div><dt className="opacity-60">Unit cost</dt><dd>₹{unitCostCr} cr</dd></div>
          )}
        </dl>
      </div>
    </div>
  );
}


export interface ADSystemInfoProps {
  open: boolean;
  onClose: () => void;
  name: string;
  coverageKm?: number;
  maxPk?: number;
  installCostCr?: number;
  interceptorCostCr?: number;
  description?: string;
}

export function ADSystemInfo({
  open, onClose, name, coverageKm, maxPk, installCostCr, interceptorCostCr, description,
}: ADSystemInfoProps) {
  if (!open) return null;
  return (
    <div role="dialog" aria-label={`${name} info`}
      className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-950/80"
      onClick={onClose}>
      <div className="relative w-full max-w-md rounded-2xl bg-slate-900 border border-slate-800 p-5 space-y-3"
        onClick={(e) => e.stopPropagation()}>
        <button onClick={onClose} aria-label="close info"
          className="absolute top-3 right-3 w-8 h-8 rounded-full bg-slate-800 hover:bg-slate-700 text-slate-200">×</button>
        <h2 className="text-lg font-bold pr-8">{name}</h2>
        {description && <p className="text-xs opacity-80">{description}</p>}
        <div className="border border-slate-800 rounded-lg p-3 bg-slate-950/40 space-y-1">
          <div className="text-[10px] uppercase opacity-60">Role · Air Defense</div>
          <div className="text-xs">
            Installed at a base, engages adversary aircraft + cruise missiles + drones inside the coverage bubble before BVR combat begins. Each battery has an interceptor magazine — reload via Acquisitions &gt; AD Reloads when depleted.
          </div>
        </div>
        <dl className="grid grid-cols-2 gap-2 text-xs">
          {coverageKm !== undefined && (
            <div><dt className="opacity-60">Coverage</dt><dd>{coverageKm} km</dd></div>
          )}
          {maxPk !== undefined && (
            <div><dt className="opacity-60">Max P<sub>kill</sub></dt><dd>{Math.round(maxPk * 100)}%</dd></div>
          )}
          {installCostCr !== undefined && installCostCr > 0 && (
            <div><dt className="opacity-60">Install cost</dt><dd>₹{installCostCr.toLocaleString("en-US")} cr</dd></div>
          )}
          {interceptorCostCr !== undefined && interceptorCostCr > 0 && (
            <div><dt className="opacity-60">Interceptor</dt><dd>₹{interceptorCostCr} cr/shot</dd></div>
          )}
        </dl>
      </div>
    </div>
  );
}


export function InfoButton({ onClick, ariaLabel }: { onClick: () => void; ariaLabel: string }) {
  return (
    <button
      type="button"
      onClick={(e) => { e.stopPropagation(); onClick(); }}
      aria-label={ariaLabel}
      className="inline-flex items-center justify-center w-5 h-5 rounded-full bg-slate-800 hover:bg-slate-700 text-slate-300 text-[10px] leading-none border border-slate-700 flex-shrink-0"
      title="What does this do?"
    >
      i
    </button>
  );
}
