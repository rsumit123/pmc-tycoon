import { useEffect, useMemo, useRef, useState } from "react";
import { useNavigate, useSearchParams } from "react-router-dom";
import { useCampaignStore } from "../../store/campaignStore";
import { api } from "../../lib/api";
import type {
  AdversaryBase, HangarSquadron, MissileStock, StrikePackagePayload,
  StrikePreview, StrikeProfileId, StrikeRoe,
} from "../../lib/types";
import { CommitHoldButton } from "../primitives/CommitHoldButton";
import { Stepper } from "../primitives/Stepper";
import { StrikeRiskPreview } from "./StrikeRiskPreview";

const PROFILES: { id: StrikeProfileId; name: string; emoji: string; tag: string; minSquadrons: number }[] = [
  { id: "deep_strike", name: "Deep Strike", emoji: "✈", tag: "Manned package", minSquadrons: 2 },
  { id: "sead_suppression", name: "SEAD", emoji: "🎯", tag: "AD suppression", minSquadrons: 1 },
  { id: "standoff_cruise", name: "Standoff", emoji: "🚀", tag: "Cruise launch", minSquadrons: 1 },
  { id: "drone_swarm", name: "Drone Swarm", emoji: "🛸", tag: "Ghatak only", minSquadrons: 1 },
];

const PROFILE_ELIGIBLE_ROLES: Record<StrikeProfileId, string[]> = {
  deep_strike: ["multirole", "strike", "stealth", "stealth_strike", "air_superiority"],
  sead_suppression: ["multirole", "strike", "air_superiority"],
  standoff_cruise: ["multirole", "bomber", "strike"],
  drone_swarm: ["stealth_strike", "isr"],
};

const PROFILE_WEAPON_CLASSES: Record<StrikeProfileId, string[]> = {
  deep_strike: ["a2a_bvr", "a2a_wvr", "glide_bomb", "anti_radiation", "land_attack"],
  sead_suppression: ["anti_radiation"],
  standoff_cruise: ["land_attack", "anti_ship"],
  drone_swarm: ["glide_bomb", "anti_radiation"],
};

const ROES: { id: StrikeRoe; name: string; tag: string }[] = [
  { id: "clean_strike", name: "Clean Strike", tag: "Low collateral · lower P_kill" },
  { id: "unrestricted", name: "Unrestricted", tag: "Standard ROE" },
  { id: "decapitation", name: "Decapitation", tag: "Command targets only · critical blowback" },
];

export function StrikeBuilder() {
  const navigate = useNavigate();
  const [searchParams, setSearchParams] = useSearchParams();
  const campaign = useCampaignStore((s) => s.campaign);
  const adversaryBases = useCampaignStore((s) => s.adversaryBases);
  const hangar = useCampaignStore((s) => s.hangar);
  const missileStocks = useCampaignStore((s) => s.missileStocks);
  const platformsById = useCampaignStore((s) => s.platformsById);
  const weaponsById = useCampaignStore((s) => s.weaponsById);
  const loadWeapons = useCampaignStore((s) => s.loadWeapons);
  const commitStrike = useCampaignStore((s) => s.commitStrike);

  useEffect(() => {
    if (Object.keys(weaponsById).length === 0) loadWeapons();
  }, [weaponsById, loadWeapons]);

  // Deep-link: ?target=<adversary_base_id> from map sheet pre-selects target.
  useEffect(() => {
    const t = searchParams.get("target");
    if (!t || target || adversaryBases.length === 0) return;
    const found = adversaryBases.find((b) => b.id === Number(t));
    if (found) {
      setTarget(found);
      setOpenSection("profile");
      const next = new URLSearchParams(searchParams);
      next.delete("target");
      setSearchParams(next, { replace: true });
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [searchParams, adversaryBases]);

  // Section open state.
  const [openSection, setOpenSection] = useState<string>("target");

  // Form state.
  const [target, setTarget] = useState<AdversaryBase | null>(null);
  const [profile, setProfile] = useState<StrikeProfileId>("deep_strike");
  const [picked, setPicked] = useState<Record<number, number>>({});
  const [weapons, setWeapons] = useState<Record<string, number>>({});
  const [awacs, setAwacs] = useState(false);
  const [tanker, setTanker] = useState(false);
  const [roe, setRoe] = useState<StrikeRoe>("unrestricted");

  const [factionFilter, setFactionFilter] = useState<"all" | "PAF" | "PLAAF" | "PLAN">("all");

  const [preview, setPreview] = useState<StrikePreview | null>(null);
  const [previewLoading, setPreviewLoading] = useState(false);
  const previewTimer = useRef<number | null>(null);
  const [submitting, setSubmitting] = useState(false);

  // Eligible squadrons by profile.
  const eligibleSquadrons: HangarSquadron[] = useMemo(() => {
    if (!hangar) return [];
    const eligibleRoles = PROFILE_ELIGIBLE_ROLES[profile];
    return hangar.squadrons.filter((sq) => {
      const role = platformsById[sq.platform_id]?.role ?? "";
      if (!eligibleRoles.includes(role)) return false;
      if (sq.strength <= 0) return false;
      if (profile === "drone_swarm" && sq.platform_id !== "ghatak_ucav") return false;
      return true;
    });
  }, [hangar, platformsById, profile]);

  // Determine launch base from first picked squadron.
  const pickedSquadronEntries = Object.entries(picked).filter(([, n]) => n > 0);
  const firstSqId = pickedSquadronEntries.length > 0 ? Number(pickedSquadronEntries[0][0]) : null;
  const firstSq = firstSqId !== null
    ? hangar?.squadrons.find((s) => s.id === firstSqId)
    : null;
  const launchBaseId = firstSq?.base_id ?? null;

  // Available weapons at launch base, filtered by profile's weapon classes.
  const availableWeapons = useMemo(() => {
    if (launchBaseId === null) return [] as MissileStock[];
    const allowedClasses = new Set(PROFILE_WEAPON_CLASSES[profile]);
    return missileStocks.filter((s) => {
      if (s.base_id !== launchBaseId) return false;
      if (s.stock <= 0) return false;
      const wclass = weaponsById[s.weapon_id]?.class ?? "";
      return allowedClasses.has(wclass);
    });
  }, [missileStocks, launchBaseId, profile, weaponsById]);

  // Reset picked squadrons + weapons when profile changes.
  useEffect(() => {
    setPicked({});
    setWeapons({});
  }, [profile]);

  // Build payload + run preview (debounced).
  const buildPayload = (): StrikePackagePayload | null => {
    if (!target) return null;
    const sqEntries = pickedSquadronEntries.map(([id, n]) => ({
      squadron_id: Number(id),
      airframes: n,
    }));
    if (sqEntries.length === 0) return null;
    return {
      target_base_id: target.id,
      profile,
      squadrons: sqEntries,
      weapons_planned: weapons,
      support: { awacs, tanker },
      roe,
    };
  };

  useEffect(() => {
    if (previewTimer.current) window.clearTimeout(previewTimer.current);
    if (!campaign || !target || pickedSquadronEntries.length === 0) {
      setPreview(null);
      return;
    }
    const payload = buildPayload();
    if (!payload) return;
    setPreviewLoading(true);
    previewTimer.current = window.setTimeout(async () => {
      try {
        const r = await api.previewStrike(campaign.id, payload);
        setPreview(r);
      } catch (e) {
        console.warn("preview failed", e);
        setPreview(null);
      } finally {
        setPreviewLoading(false);
      }
    }, 400);
    return () => {
      if (previewTimer.current) window.clearTimeout(previewTimer.current);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [campaign?.id, target?.id, profile, JSON.stringify(picked), JSON.stringify(weapons), awacs, tanker, roe]);

  const filteredBases = adversaryBases
    .filter((b) => b.is_covered)
    .filter((b) => factionFilter === "all" || b.faction === factionFilter);

  const profileObj = PROFILES.find((p) => p.id === profile)!;
  const totalAirframes = pickedSquadronEntries.reduce((a, [, n]) => a + n, 0);
  const totalWeapons = Object.values(weapons).reduce((a, n) => a + n, 0);

  const sectionMeetsMinSquadrons = pickedSquadronEntries.length >= profileObj.minSquadrons;
  const canCommit =
    !!target &&
    sectionMeetsMinSquadrons &&
    !!preview &&
    preview.issues.length === 0 &&
    !submitting;

  const onCommit = async () => {
    const payload = buildPayload();
    if (!payload || !campaign) return;
    setSubmitting(true);
    try {
      const op = await commitStrike(payload);
      navigate(`/campaign/${campaign.id}/ops/strike/${op.id}`);
    } catch {
      // toast pushed by store
    } finally {
      setSubmitting(false);
    }
  };

  if (!campaign || !hangar) return <div className="text-sm opacity-60 p-6 text-center">Loading…</div>;

  if (filteredBases.length === 0 && adversaryBases.filter((b) => b.is_covered).length === 0) {
    return (
      <div className="bg-slate-900 border border-slate-800 rounded-lg p-6 text-center space-y-2">
        <div className="text-3xl">🛸</div>
        <h3 className="text-base font-bold">No covered targets</h3>
        <p className="text-xs opacity-80">
          ISR drones must be orbiting within range of an adversary base before you can plan a strike on it.
        </p>
      </div>
    );
  }

  return (
    <div className="space-y-2">
      {/* Section 1 — Target */}
      <Section
        n={1} id="target" title="TARGET" open={openSection === "target"}
        summary={target ? `${target.name} · ${target.faction}` : "—"}
        complete={!!target}
        onToggle={() => setOpenSection(openSection === "target" ? "" : "target")}
      >
        <div className="space-y-2">
          <div className="flex gap-1 flex-wrap">
            {(["all", "PAF", "PLAAF", "PLAN"] as const).map((k) => (
              <button
                key={k}
                type="button"
                onClick={() => setFactionFilter(k)}
                className={[
                  "text-xs px-2 py-1 rounded",
                  factionFilter === k ? "bg-amber-600 text-slate-900 font-semibold" : "bg-slate-800 text-slate-300",
                ].join(" ")}
              >{k}</button>
            ))}
          </div>
          <ul className="space-y-1 max-h-72 overflow-y-auto">
            {filteredBases.length === 0 && (
              <li className="text-xs opacity-60 p-3 text-center">No covered targets in this faction.</li>
            )}
            {filteredBases.map((b) => (
              <li key={b.id}>
                <button
                  type="button"
                  onClick={() => {
                    setTarget(b);
                    setOpenSection("profile");
                  }}
                  className={[
                    "w-full text-left bg-slate-950/40 border rounded p-2 text-xs",
                    target?.id === b.id ? "border-amber-500" : "border-slate-800 hover:border-slate-600",
                  ].join(" ")}
                >
                  <div className="flex items-baseline justify-between gap-2">
                    <span className="font-semibold truncate">{b.name}</span>
                    <span className="opacity-60 text-[10px]">{b.faction} · {b.tier}</span>
                  </div>
                  {b.latest_sighting && (
                    <div className="text-[10px] opacity-60 mt-0.5">Intel: {b.latest_sighting.tier}</div>
                  )}
                </button>
              </li>
            ))}
          </ul>
        </div>
      </Section>

      {/* Section 2 — Profile */}
      <Section
        n={2} id="profile" title="PROFILE" open={openSection === "profile"}
        summary={profileObj.name}
        complete={true}
        onToggle={() => setOpenSection(openSection === "profile" ? "" : "profile")}
      >
        <div className="grid grid-cols-2 gap-2">
          {PROFILES.map((p) => (
            <button
              key={p.id}
              type="button"
              onClick={() => {
                setProfile(p.id);
                setOpenSection("squadrons");
              }}
              className={[
                "text-left rounded border p-2 transition-colors",
                profile === p.id
                  ? "bg-amber-900/30 border-amber-500"
                  : "bg-slate-950/40 border-slate-800 hover:border-slate-600",
              ].join(" ")}
            >
              <div className="text-base">{p.emoji}</div>
              <div className="text-xs font-semibold mt-0.5">{p.name}</div>
              <div className="text-[10px] opacity-60">{p.tag}</div>
              {p.minSquadrons > 1 && (
                <div className="text-[10px] opacity-50 mt-0.5">Min {p.minSquadrons} sqns</div>
              )}
            </button>
          ))}
        </div>
      </Section>

      {/* Section 3 — Squadrons */}
      <Section
        n={3} id="squadrons" title="SQUADRONS"
        open={openSection === "squadrons"}
        summary={pickedSquadronEntries.length > 0
          ? `${pickedSquadronEntries.length} sqn · ${totalAirframes} airframes`
          : "—"}
        complete={sectionMeetsMinSquadrons}
        onToggle={() => setOpenSection(openSection === "squadrons" ? "" : "squadrons")}
      >
        {eligibleSquadrons.length === 0 ? (
          <p className="text-xs opacity-60 py-4 text-center">
            No eligible squadrons for this profile.
          </p>
        ) : (
          <ul className="space-y-1.5">
            {eligibleSquadrons.map((sq) => {
              const sel = picked[sq.id] ?? 0;
              return (
                <li key={sq.id} className={[
                  "bg-slate-950/40 border rounded p-2 text-xs",
                  sel > 0 ? "border-amber-700" : "border-slate-800",
                ].join(" ")}>
                  <label className="flex items-center gap-2 cursor-pointer">
                    <input
                      type="checkbox"
                      checked={sel > 0}
                      onChange={(e) => {
                        const next = { ...picked };
                        if (e.target.checked) next[sq.id] = Math.max(2, Math.floor(sq.strength / 2));
                        else delete next[sq.id];
                        setPicked(next);
                      }}
                    />
                    <div className="flex-1 min-w-0">
                      <div className="font-semibold truncate">{sq.name}</div>
                      <div className="text-[10px] opacity-60 truncate">
                        {sq.platform_name} · {sq.base_name} · {sq.strength} airframes · {sq.readiness_pct}% ready
                      </div>
                    </div>
                  </label>
                  {sel > 0 && (
                    <div className="flex items-center gap-2 mt-1.5 ml-6">
                      <span className="text-[10px] opacity-60">commit</span>
                      <Stepper
                        value={sel}
                        onChange={(v) => setPicked({ ...picked, [sq.id]: v })}
                        min={1}
                        max={sq.strength}
                        step={1}
                        formatValue={(v) => String(v)}
                        ariaLabel={`${sq.name} airframes`}
                      />
                      <span className="text-[10px] opacity-60">/ {sq.strength}</span>
                    </div>
                  )}
                </li>
              );
            })}
          </ul>
        )}
        {launchBaseId !== null && pickedSquadronEntries.length > 1 && (
          <p className="text-[10px] opacity-60 mt-2">
            Launch base: <span className="font-semibold">{firstSq?.base_name}</span> (weapons drawn from here).
          </p>
        )}
      </Section>

      {/* Section 4 — Weapons */}
      <Section
        n={4} id="weapons" title="WEAPONS"
        open={openSection === "weapons"}
        summary={totalWeapons > 0 ? `${totalWeapons} munitions` : "—"}
        complete={true}
        onToggle={() => setOpenSection(openSection === "weapons" ? "" : "weapons")}
      >
        {launchBaseId === null ? (
          <p className="text-xs opacity-60 py-2">Pick at least one squadron first.</p>
        ) : availableWeapons.length === 0 ? (
          <p className="text-xs opacity-60 py-2">
            No compatible weapons in stock at <span className="font-semibold">{firstSq?.base_name}</span>.
          </p>
        ) : (
          <ul className="space-y-1.5">
            {availableWeapons.map((s) => {
              const planned = weapons[s.weapon_id] ?? 0;
              const meta = weaponsById[s.weapon_id];
              return (
                <li key={s.weapon_id} className="bg-slate-950/40 border border-slate-800 rounded p-2 text-xs">
                  <div className="flex items-baseline justify-between gap-2">
                    <span className="font-semibold uppercase">{s.weapon_id.replace(/_/g, "-")}</span>
                    <span className="text-[10px] opacity-60">
                      {meta?.class ?? "—"} · stock {s.stock}
                    </span>
                  </div>
                  <div className="flex items-center gap-2 mt-1">
                    <Stepper
                      value={planned}
                      onChange={(v) => setWeapons({ ...weapons, [s.weapon_id]: v })}
                      min={0}
                      max={s.stock}
                      step={2}
                      formatValue={(v) => String(v)}
                      ariaLabel={`${s.weapon_id} qty`}
                    />
                  </div>
                </li>
              );
            })}
          </ul>
        )}
      </Section>

      {/* Section 5 — Support */}
      <Section
        n={5} id="support" title="SUPPORT"
        open={openSection === "support"}
        summary={[awacs && "AWACS", tanker && "Tanker"].filter(Boolean).join(" + ") || "none"}
        complete={true}
        onToggle={() => setOpenSection(openSection === "support" ? "" : "support")}
      >
        <div className="space-y-1.5 text-xs">
          <label className="flex items-center gap-2">
            <input type="checkbox" checked={awacs} onChange={(e) => setAwacs(e.target.checked)} />
            <span>AWACS orbit (+ detection)</span>
          </label>
          <label className="flex items-center gap-2">
            <input type="checkbox" checked={tanker} onChange={(e) => setTanker(e.target.checked)} />
            <span>Tanker support (extends combat radius)</span>
          </label>
        </div>
      </Section>

      {/* Section 6 — ROE */}
      <Section
        n={6} id="roe" title="ROE"
        open={openSection === "roe"}
        summary={ROES.find((r) => r.id === roe)?.name ?? roe}
        complete={true}
        onToggle={() => setOpenSection(openSection === "roe" ? "" : "roe")}
      >
        <div className="space-y-1.5">
          {ROES.map((r) => {
            const disabled = r.id === "decapitation" && !target?.base_id_str;
            return (
              <label key={r.id} className={[
                "flex items-start gap-2 text-xs p-2 border rounded",
                roe === r.id ? "border-amber-500 bg-amber-900/20" : "border-slate-800 bg-slate-950/40",
                disabled ? "opacity-40" : "cursor-pointer",
              ].join(" ")}>
                <input
                  type="radio"
                  name="roe"
                  checked={roe === r.id}
                  disabled={disabled}
                  onChange={() => setRoe(r.id)}
                  className="mt-0.5"
                />
                <div className="min-w-0">
                  <div className="font-semibold">{r.name}</div>
                  <div className="text-[10px] opacity-70">{r.tag}</div>
                </div>
              </label>
            );
          })}
        </div>
      </Section>

      {/* Section 7 — Review (always visible when target + squadrons set) */}
      {target && pickedSquadronEntries.length > 0 && (
        <section className="bg-slate-900 border border-amber-700 rounded-lg p-3 space-y-2">
          <h3 className="text-xs font-semibold uppercase opacity-80">📋 Review</h3>
          <p className="text-xs leading-snug">
            <span className="font-semibold">{profileObj.name}</span> on{" "}
            <span className="font-semibold">{target.name}</span> ({target.faction}).{" "}
            {pickedSquadronEntries.length} squadron{pickedSquadronEntries.length === 1 ? "" : "s"}{" "}
            committing <span className="font-semibold">{totalAirframes}</span> airframes.{" "}
            {totalWeapons > 0 && (
              <>Munitions: {Object.entries(weapons).filter(([, n]) => n > 0).map(([w, n]) => `${n}× ${w}`).join(", ")}. </>
            )}
            {(awacs || tanker) && <>Support: {[awacs && "AWACS", tanker && "Tanker"].filter(Boolean).join(" + ")}. </>}
            ROE: {ROES.find((r) => r.id === roe)?.name}.
          </p>
          <StrikeRiskPreview preview={preview} loading={previewLoading} />
        </section>
      )}

      {/* Sticky commit CTA */}
      <div className="sticky bottom-0 -mx-4 px-4 py-3 bg-slate-950/90 backdrop-blur border-t border-slate-800">
        <CommitHoldButton
          label={submitting ? "Launching…" : canCommit
            ? "🚀 Hold to launch strike"
            : !target
            ? "Pick a target"
            : !sectionMeetsMinSquadrons
            ? `Need ${profileObj.minSquadrons} squadron${profileObj.minSquadrons > 1 ? "s" : ""}`
            : preview?.issues?.[0]
            ? preview.issues[0]
            : previewLoading
            ? "Calculating…"
            : "Hold to launch strike"}
          holdMs={2000}
          disabled={!canCommit}
          onCommit={onCommit}
          className="w-full"
        />
      </div>
    </div>
  );
}

function Section({
  n, id, title, summary, complete, open, onToggle, children,
}: {
  n: number;
  id: string;
  title: string;
  summary: string;
  complete: boolean;
  open: boolean;
  onToggle: () => void;
  children: React.ReactNode;
}) {
  void id;
  return (
    <section className="bg-slate-900 border border-slate-800 rounded-lg overflow-hidden">
      <button
        type="button"
        onClick={onToggle}
        className="w-full flex items-baseline justify-between gap-2 px-3 py-2.5 text-left hover:bg-slate-800/50"
      >
        <span className="flex items-baseline gap-2 min-w-0">
          <span className="text-[10px] opacity-50 font-mono">{n}</span>
          <span className={[
            "text-[10px]",
            complete ? "text-emerald-400" : "text-slate-500",
          ].join(" ")}>{complete ? "●" : "○"}</span>
          <span className="text-xs font-semibold uppercase">{title}</span>
        </span>
        <span className="flex items-baseline gap-2 flex-shrink-0">
          <span className="text-[11px] opacity-70 truncate max-w-[60vw]">{summary}</span>
          <span className="text-[10px] opacity-50">{open ? "▼" : "▶"}</span>
        </span>
      </button>
      {open && (
        <div className="px-3 pb-3 pt-1 border-t border-slate-800">{children}</div>
      )}
    </section>
  );
}
