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
    "ISR drone — orbits within ~700 km of a vignette AO boost intel_quality (up to +0.15 with 2 drones), upgrading adversary-force fidelity in the Ops Room.",
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
    "Unlocks an ISR drone platform — procure a squadron in Acquisitions > Aircraft, base it within ~700 km of expected vignette AOs to buff intel_quality.",
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
