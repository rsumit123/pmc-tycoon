import { useState, useEffect } from "react";
import { useNavigate } from "react-router-dom";
import { useCampaignStore } from "../store/campaignStore";
import { HowToPlayGuide } from "../components/guide/HowToPlayGuide";
import type { Difficulty } from "../lib/types";

const DIFFICULTIES: { value: Difficulty; label: string }[] = [
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
  const [showGuide, setShowGuide] = useState(false);

  const createCampaign = useCampaignStore((s) => s.createCampaign);
  const loading = useCampaignStore((s) => s.loading);
  const error = useCampaignStore((s) => s.error);
  const campaignList = useCampaignStore((s) => s.campaignList);
  const objectivesCatalog = useCampaignStore((s) => s.objectivesCatalog);
  const loadCampaignList = useCampaignStore((s) => s.loadCampaignList);
  const loadObjectivesCatalog = useCampaignStore((s) => s.loadObjectivesCatalog);
  const navigate = useNavigate();

  useEffect(() => {
    void loadCampaignList();
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

  async function handleStart() {
    await createCampaign({ name, difficulty, objectives: selectedObjectives });
    const c = useCampaignStore.getState().campaign;
    if (c) navigate(`/campaign/${c.id}`);
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

  return (
    <div className="min-h-screen flex items-center justify-center p-4">
      <div className="max-w-md w-full space-y-6">
        {/* Header */}
        <div className="flex items-start justify-between gap-3">
          <div>
            <h1 className="text-3xl font-bold">Sovereign Shield</h1>
            <p className="text-sm opacity-70 mt-1">
              Head of Defense Integration — New Delhi, 2026
            </p>
          </div>
          <button
            onClick={() => setShowGuide(true)}
            className="text-xs text-amber-400 underline opacity-70 hover:opacity-100 transition-opacity mt-1"
          >
            How to play
          </button>
        </div>

        {/* Existing Campaigns */}
        {hasExisting && (
          <div className="space-y-2">
            <h2 className="text-sm font-semibold uppercase tracking-wide opacity-60">
              Resume Campaign
            </h2>
            {campaignList.map((c) => (
              <button
                key={c.id}
                onClick={() => navigate(`/campaign/${c.id}`)}
                className="w-full text-left bg-slate-800 hover:bg-slate-700 border border-slate-700 rounded-lg px-4 py-3 space-y-1 transition-colors"
              >
                <div className="font-semibold text-sm">{c.name}</div>
                <div className="text-xs opacity-60 flex gap-3">
                  <span>
                    {c.current_year} Q{c.current_quarter}
                  </span>
                  <span>
                    ₹{c.budget_cr.toLocaleString("en-US")} cr
                  </span>
                  <span className="capitalize">
                    {c.difficulty.replace(/_/g, " ")}
                  </span>
                </div>
              </button>
            ))}
          </div>
        )}

        {/* Toggle new campaign form */}
        {hasExisting && !showNewForm && (
          <button
            onClick={() => setShowNewForm(true)}
            className="w-full border-2 border-dashed border-slate-600 hover:border-amber-600 rounded-lg py-3 text-sm opacity-70 hover:opacity-100 transition-colors"
          >
            + New Campaign
          </button>
        )}

        {/* New Campaign Form */}
        {formVisible && (
          <div className="space-y-5">
            {hasExisting && (
              <h2 className="text-sm font-semibold uppercase tracking-wide opacity-60">
                New Campaign
              </h2>
            )}

            {/* Campaign name */}
            <div className="space-y-1">
              <label className="block text-sm opacity-80">Campaign name</label>
              <input
                className="w-full bg-slate-800 border border-slate-700 rounded-lg px-3 py-2 text-sm"
                value={name}
                onChange={(e) => setName(e.target.value)}
              />
            </div>

            {/* Difficulty */}
            <div className="space-y-2">
              <label className="block text-sm opacity-80">Difficulty</label>
              <div className="grid grid-cols-2 gap-2">
                {DIFFICULTIES.map((d) => (
                  <button
                    key={d.value}
                    onClick={() => setDifficulty(d.value)}
                    className={`py-2 px-3 rounded-lg text-sm font-medium border transition-colors ${
                      difficulty === d.value
                        ? "bg-amber-600 border-amber-500 text-slate-900"
                        : "bg-slate-800 border-slate-700 hover:border-slate-500"
                    }`}
                  >
                    {d.label}
                  </button>
                ))}
              </div>
            </div>

            {/* Objective selector */}
            <div className="space-y-2">
              <div className="flex items-center justify-between">
                <label className="text-sm opacity-80">Objectives</label>
                <span className="text-xs opacity-60">
                  Select {MIN_OBJ}–{MAX_OBJ} ({objCount} selected)
                </span>
              </div>

              <div className="max-h-56 overflow-y-auto space-y-2 pr-1">
                {objectivesCatalog.map((obj) => {
                  const selected = selectedObjectives.includes(obj.id);
                  const maxReached = objCount >= MAX_OBJ && !selected;
                  return (
                    <button
                      key={obj.id}
                      onClick={() => toggleObjective(obj.id)}
                      disabled={maxReached}
                      className={`w-full text-left rounded-lg border px-3 py-2 text-sm transition-colors ${
                        selected
                          ? "bg-amber-600/20 border-amber-500 text-amber-100"
                          : maxReached
                          ? "bg-slate-800/50 border-slate-700 opacity-40 cursor-not-allowed"
                          : "bg-slate-800 border-slate-700 hover:border-slate-500"
                      }`}
                    >
                      <div className="font-medium">{obj.title}</div>
                      <div className="text-xs opacity-60 mt-0.5">
                        {obj.description}
                      </div>
                    </button>
                  );
                })}
              </div>

              {objHint && (
                <p className="text-xs text-amber-400">{objHint}</p>
              )}
            </div>

            {/* Error */}
            {error && (
              <div className="bg-red-900/30 border border-red-800 rounded-lg p-3 text-sm text-red-200">
                {error}
              </div>
            )}

            {/* Submit */}
            <button
              onClick={handleStart}
              disabled={loading || !canStart}
              className="w-full bg-amber-600 hover:bg-amber-500 disabled:opacity-50 disabled:cursor-not-allowed text-slate-900 font-semibold rounded-lg px-4 py-3 text-sm"
            >
              {loading ? "Starting…" : "Assume Command"}
            </button>
          </div>
        )}
      </div>

      <HowToPlayGuide open={showGuide} onClose={() => setShowGuide(false)} />
    </div>
  );
}
