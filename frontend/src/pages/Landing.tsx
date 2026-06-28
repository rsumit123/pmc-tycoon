import { useState, useEffect } from "react";
import { useNavigate, Link } from "react-router-dom";
import { useCampaignStore } from "../store/campaignStore";
import { HowToPlayGuide } from "../components/guide/HowToPlayGuide";
import { Loader } from "../components/primitives/Loader";
import { ChakravyuhRings } from "../components/brand/ChakravyuhRings";
import type { Difficulty } from "../lib/types";
import { startingGrantCr, DIFFICULTY_BLURB } from "../lib/economy";
import { OBJECTIVE_HINTS, BEGINNER_OBJECTIVE_IDS } from "../lib/objectiveHints";
import { resetTour } from "../lib/tour";

const DIFFICULTIES: { value: Difficulty; label: string }[] = [
  { value: "story", label: "Story" },
  { value: "relaxed", label: "Relaxed" },
  { value: "realistic", label: "Realistic" },
  { value: "hard_peer", label: "Hard Peer" },
  { value: "worst_case", label: "Worst Case" },
];

const MIN_OBJ = 3;
const MAX_OBJ = 5;

export function Landing() {
  const [name, setName] = useState("Singh-era modernization");
  const [difficulty, setDifficulty] = useState<Difficulty>("realistic");
  const [selectedObjectives, setSelectedObjectives] = useState<string[]>([]);
  const [showNewForm, setShowNewForm] = useState(false);
  const [showCustomize, setShowCustomize] = useState(false);
  const [showGuide, setShowGuide] = useState(false);

  const createCampaign = useCampaignStore((s) => s.createCampaign);
  const loading = useCampaignStore((s) => s.loading);
  const error = useCampaignStore((s) => s.error);
  const campaignList = useCampaignStore((s) => s.campaignList);
  const objectivesCatalog = useCampaignStore((s) => s.objectivesCatalog);
  const loadCampaignList = useCampaignStore((s) => s.loadCampaignList);
  const loadObjectivesCatalog = useCampaignStore((s) => s.loadObjectivesCatalog);
  const deleteCampaign = useCampaignStore((s) => s.deleteCampaign);
  const [confirmDelete, setConfirmDelete] = useState<number | null>(null);
  const [listLoaded, setListLoaded] = useState(false);
  const navigate = useNavigate();

  useEffect(() => {
    void loadCampaignList().finally(() => setListLoaded(true));
    void loadObjectivesCatalog();
  }, []);

  // If no campaigns exist, auto-show the new form
  const hasExisting = campaignList.length > 0;
  const formVisible = showNewForm || !hasExisting;

  function toggleObjective(id: string) {
    setSelectedObjectives((prev) => {
      if (prev.includes(id)) return prev.filter((x) => x !== id);
      if (prev.length >= MAX_OBJ) return prev;
      return [...prev, id];
    });
  }

  async function handleStart(cfg?: { name: string; difficulty: Difficulty; objectives: string[] }) {
    const payload = cfg ?? { name, difficulty, objectives: selectedObjectives };
    await createCampaign(payload);
    const c = useCampaignStore.getState().campaign;
    if (c) navigate(`/campaign/${c.id}`);
  }

  function handleQuickStart() {
    // Quick Start is the explicit "I'm new" path: use the most forgiving
    // (Story) difficulty and always (re)launch the first-run coach-marks,
    // even for a returning device that already dismissed the tour.
    resetTour();
    void handleStart({
      name: "First Command",
      difficulty: "story",
      objectives: [...BEGINNER_OBJECTIVE_IDS],
    });
  }

  const canStart =
    name.trim().length > 0 &&
    selectedObjectives.length >= MIN_OBJ &&
    selectedObjectives.length <= MAX_OBJ;

  const objCount = selectedObjectives.length;
  const objHint =
    objCount < MIN_OBJ
      ? `Select ${MIN_OBJ - objCount} more objective${MIN_OBJ - objCount > 1 ? "s" : ""}`
      : objCount > MAX_OBJ
      ? `Deselect ${objCount - MAX_OBJ} objective${objCount - MAX_OBJ > 1 ? "s" : ""}`
      : null;

  if (!listLoaded) return <Loader label="Loading campaigns" />;

  return (
    <div className="relative min-h-[100dvh] bg-[#0a0f1c] text-slate-100">
      {/* ── ambient command backdrop (fixed, behind scrolling content) ── */}
      <div
        className="pointer-events-none fixed inset-0"
        style={{
          backgroundImage:
            "linear-gradient(rgba(148,163,184,0.06) 1px, transparent 1px), linear-gradient(90deg, rgba(148,163,184,0.06) 1px, transparent 1px)",
          backgroundSize: "34px 34px",
        }}
      />
      <div
        className="pointer-events-none fixed inset-0"
        style={{ background: "radial-gradient(125% 80% at 50% 22%, transparent 40%, #0a0f1c 92%)" }}
      />
      <div className="pointer-events-none fixed inset-0 overflow-hidden">
        <ChakravyuhRings />
      </div>

      {/* ── content ── */}
      <div className="relative z-10 mx-auto w-full max-w-md px-5 py-8 safe-pt safe-pb space-y-6">
        {/* Command header + utility links */}
        <div className="flex items-start justify-between gap-3">
          <div className="font-tech text-[11px] leading-relaxed tracking-[0.28em] text-amber-500/80">
            IAF · DEFENSE<br />INTEGRATION COMMAND
          </div>
          <div className="flex flex-col items-end gap-0.5 font-tech text-[10px] tracking-widest">
            <button onClick={() => setShowGuide(true)} className="text-amber-400/80 hover:text-amber-300">HOW TO PLAY</button>
            <Link to="/glossary" className="text-slate-500 hover:text-slate-300">GLOSSARY</Link>
            <Link to="/credits" className="text-slate-500 hover:text-slate-300">CREDITS</Link>
            <Link to="/privacy" className="text-slate-500 hover:text-slate-300">PRIVACY</Link>
          </div>
        </div>

        {/* Brand */}
        <div className="cv-rise">
          <div className="font-display text-xl leading-none text-amber-400/70">चक्रव्यूह</div>
          <h1 className="font-display mt-1 text-4xl font-bold uppercase tracking-[0.12em] text-slate-50">Chakravyuh</h1>
          <p className="font-tech mt-2 text-xs text-slate-400">
            Head of Defense Integration · New Delhi · <span className="text-amber-500/90">2026</span>
          </p>
        </div>

        {/* Existing Campaigns */}
        {hasExisting && (
          <div className="cv-rise space-y-2" style={{ animationDelay: "80ms" }}>
            <h2 className="font-tech text-[10px] uppercase tracking-[0.25em] text-amber-500/70">Resume Campaign</h2>
            {campaignList.map((c) => (
              <div
                key={c.id}
                className="flex items-stretch overflow-hidden rounded-lg border border-slate-800 bg-slate-900/70 transition-colors hover:border-amber-600/50"
              >
                <button
                  onClick={() => navigate(`/campaign/${c.id}`)}
                  className="min-w-0 flex-1 space-y-1 px-4 py-3 text-left hover:bg-slate-800/60"
                >
                  <div className="truncate text-sm font-semibold">{c.name}</div>
                  <div className="flex flex-wrap gap-3 font-tech text-[11px] tracking-wide text-slate-400">
                    <span>{c.current_year} Q{c.current_quarter}</span>
                    <span>₹{c.budget_cr.toLocaleString("en-US")} cr</span>
                    <span className="capitalize text-amber-500/70">{c.difficulty.replace(/_/g, " ")}</span>
                  </div>
                </button>
                {confirmDelete === c.id ? (
                  <div className="flex items-center gap-1 border-l border-rose-800 bg-rose-950/60 px-2">
                    <button
                      type="button"
                      onClick={async () => {
                        await deleteCampaign(c.id);
                        setConfirmDelete(null);
                      }}
                      className="rounded bg-rose-700 px-2 py-1 text-xs font-semibold text-rose-100 hover:bg-rose-600"
                      aria-label="confirm delete"
                    >Delete</button>
                    <button
                      type="button"
                      onClick={() => setConfirmDelete(null)}
                      className="px-2 py-1 text-xs text-slate-300 hover:text-white"
                      aria-label="cancel delete"
                    >✕</button>
                  </div>
                ) : (
                  <button
                    type="button"
                    onClick={() => setConfirmDelete(c.id)}
                    className="border-l border-slate-800 px-3 text-slate-500 transition-colors hover:bg-rose-950/30 hover:text-rose-400"
                    aria-label={`Delete campaign ${c.name}`}
                    title="Delete campaign"
                  >🗑</button>
                )}
              </div>
            ))}
          </div>
        )}

        {/* Toggle new campaign form */}
        {hasExisting && !showNewForm && (
          <button
            onClick={() => setShowNewForm(true)}
            className="cv-rise w-full rounded-lg border-2 border-dashed border-slate-700 py-3 font-tech text-xs uppercase tracking-widest text-slate-400 transition-colors hover:border-amber-600/60 hover:text-amber-300"
          >
            + New Campaign
          </button>
        )}

        {/* New Campaign Form */}
        {formVisible && (
          <div className="cv-rise space-y-5" style={{ animationDelay: "120ms" }}>
            {hasExisting && (
              <h2 className="font-tech text-[10px] uppercase tracking-[0.25em] text-amber-500/70">New Campaign</h2>
            )}

            {/* Quick Start — the hero action */}
            <div className="space-y-1.5">
              <button
                onClick={handleQuickStart}
                disabled={loading}
                className="w-full rounded-lg bg-amber-500 px-4 py-3.5 font-display text-base font-bold uppercase tracking-wider text-slate-950 shadow-lg shadow-amber-900/30 transition-colors hover:bg-amber-400 disabled:opacity-50"
              >
                ⚡ Quick Start
              </button>
              <p className="text-center font-tech text-[10px] tracking-wider text-slate-500">
                RECOMMENDED · STORY MODE · GUIDED TUTORIAL
              </p>
            </div>

            {/* Error (covers both Quick Start and Assume Command) */}
            {error && (
              <div className="rounded-lg border border-red-800 bg-red-900/30 p-3 text-sm text-red-200">
                {error}
              </div>
            )}

            {/* Customize disclosure */}
            <button
              type="button"
              onClick={() => setShowCustomize((v) => !v)}
              className="w-full py-1 text-center font-tech text-[11px] tracking-widest text-slate-400 transition-colors hover:text-amber-300"
            >
              {showCustomize ? "▾ HIDE CUSTOM SETUP" : "▸ OR SET UP A CUSTOM CAMPAIGN"}
            </button>

            {showCustomize && (
              <div className="space-y-5">
                {/* Campaign name */}
                <div className="space-y-1.5">
                  <label className="block font-tech text-[10px] uppercase tracking-[0.2em] text-slate-500">Campaign name</label>
                  <input
                    className="w-full rounded-lg border border-slate-700 bg-slate-900/70 px-3 py-2 text-sm focus:border-amber-600/60 focus:outline-none"
                    value={name}
                    onChange={(e) => setName(e.target.value)}
                  />
                </div>

                {/* Difficulty */}
                <div className="space-y-2">
                  <label className="block font-tech text-[10px] uppercase tracking-[0.2em] text-slate-500">Difficulty</label>
                  <div className="grid grid-cols-2 gap-2">
                    {DIFFICULTIES.map((d) => {
                      const active = difficulty === d.value;
                      return (
                        <button
                          key={d.value}
                          onClick={() => setDifficulty(d.value)}
                          className={`min-h-[44px] rounded-lg border px-3 py-2 text-sm font-medium transition-colors ${
                            active
                              ? "border-amber-500 bg-amber-500/15 text-amber-200"
                              : "border-slate-700 bg-slate-900/60 hover:border-slate-500"
                          }`}
                        >
                          <span className="block font-display uppercase tracking-wide">{d.label}</span>
                          <span className="block font-tech text-[10px] font-normal opacity-70">
                            ₹{startingGrantCr(d.value).toLocaleString("en-US")} cr/q
                          </span>
                        </button>
                      );
                    })}
                  </div>
                  <p className="text-xs text-slate-400">{DIFFICULTY_BLURB[difficulty]}</p>
                </div>

                {/* Objective selector */}
                <div className="space-y-2">
                  <div className="flex items-center justify-between">
                    <label className="font-tech text-[10px] uppercase tracking-[0.2em] text-slate-500">Objectives</label>
                    <span className="font-tech text-[10px] tracking-wider text-slate-500">
                      SELECT {MIN_OBJ}–{MAX_OBJ} · {objCount} SELECTED
                    </span>
                  </div>

                  <div className="max-h-56 space-y-2 overflow-y-auto pr-1">
                    {objectivesCatalog.map((obj) => {
                      const selected = selectedObjectives.includes(obj.id);
                      const maxReached = objCount >= MAX_OBJ && !selected;
                      return (
                        <button
                          key={obj.id}
                          onClick={() => toggleObjective(obj.id)}
                          disabled={maxReached}
                          className={`w-full rounded-lg border px-3 py-2 text-left text-sm transition-colors ${
                            selected
                              ? "border-amber-500 bg-amber-500/15 text-amber-100"
                              : maxReached
                              ? "cursor-not-allowed border-slate-800 bg-slate-900/40 opacity-40"
                              : "border-slate-700 bg-slate-900/60 hover:border-slate-500"
                          }`}
                        >
                          <div className="font-medium">{obj.title}</div>
                          <div className="mt-0.5 text-xs opacity-60">{obj.description}</div>
                          {OBJECTIVE_HINTS[obj.id] && (
                            <div className="mt-1 font-tech text-[11px] text-amber-300/80">{OBJECTIVE_HINTS[obj.id]}</div>
                          )}
                          {(BEGINNER_OBJECTIVE_IDS as readonly string[]).includes(obj.id) && (
                            <span className="mt-1 inline-block rounded bg-emerald-700/40 px-1.5 py-0.5 font-tech text-[10px] tracking-wide text-emerald-200">Beginner-friendly</span>
                          )}
                        </button>
                      );
                    })}
                  </div>

                  {objHint && <p className="font-tech text-[11px] tracking-wide text-amber-400">{objHint}</p>}
                </div>

                {/* Submit */}
                <button
                  onClick={() => handleStart()}
                  disabled={loading || !canStart}
                  className="w-full rounded-lg border border-amber-500/70 bg-amber-600/20 px-4 py-3 font-display text-sm font-bold uppercase tracking-wider text-amber-200 transition-colors hover:bg-amber-600/30 disabled:cursor-not-allowed disabled:opacity-40"
                >
                  {loading ? "Starting…" : "Assume Command"}
                </button>
              </div>
            )}
          </div>
        )}

        {/* Footer */}
        <div className="flex items-center justify-between pt-2 font-tech text-[10px] tracking-widest text-slate-600">
          <span>EYES ONLY</span>
          <span>NEW DELHI</span>
        </div>
      </div>

      <HowToPlayGuide open={showGuide} onClose={() => setShowGuide(false)} />
    </div>
  );
}
