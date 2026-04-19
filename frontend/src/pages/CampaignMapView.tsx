import { useEffect, useMemo, useState } from "react";
import { Link, useNavigate, useParams } from "react-router-dom";
import type { Map as MLMap } from "maplibre-gl";

import { useCampaignStore } from "../store/campaignStore";
import { useMapStore } from "../store/mapStore";

import { SubcontinentMap } from "../components/map/SubcontinentMap";
import { ADCoverageLayer } from "../components/map/ADCoverageLayer";
import { IntelContactsLayer } from "../components/map/IntelContactsLayer";
import { LayerTogglePanel } from "../components/map/LayerTogglePanel";
import { BaseSheet } from "../components/map/BaseSheet";
import { RebaseOverlay } from "../components/map/RebaseOverlay";
import { YearEndRecapToast } from "../components/endgame/YearEndRecapToast";
import { ThemeToggle } from "../components/settings/ThemeToggle";
import { HowToPlayGuide } from "../components/guide/HowToPlayGuide";
import { synthesizeContacts } from "../lib/intelContacts";
import { playRadarPing, getAudioEnabled, setAudioEnabled } from "../lib/audio";
import type { BaseSquadronSummary } from "../lib/types";

export function CampaignMapView() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const campaign = useCampaignStore((s) => s.campaign);
  const bases = useCampaignStore((s) => s.bases);
  const platformsById = useCampaignStore((s) => s.platformsById);
  const loadCampaign = useCampaignStore((s) => s.loadCampaign);
  const loadBases = useCampaignStore((s) => s.loadBases);
  const loadPlatforms = useCampaignStore((s) => s.loadPlatforms);
  const advanceTurn = useCampaignStore((s) => s.advanceTurn);
  const loading = useCampaignStore((s) => s.loading);
  const error = useCampaignStore((s) => s.error);
  const pendingVignettes = useCampaignStore((s) => s.pendingVignettes);
  const loadPendingVignettes = useCampaignStore((s) => s.loadPendingVignettes);
  const intelCards = useCampaignStore((s) => s.intelCards);
  const acquisitions = useCampaignStore((s) => s.acquisitions);
  const rdActive = useCampaignStore((s) => s.rdActive);
  const rdCatalog = useCampaignStore((s) => s.rdCatalog);
  const loadAcquisitions = useCampaignStore((s) => s.loadAcquisitions);
  const loadRdActive = useCampaignStore((s) => s.loadRdActive);
  const loadRdCatalog = useCampaignStore((s) => s.loadRdCatalog);
  const adBatteries = useCampaignStore((s) => s.adBatteries);
  const loadADBatteries = useCampaignStore((s) => s.loadADBatteries);
  const loadIntel = useCampaignStore((s) => s.loadIntel);

  const selectedBaseId = useMapStore((s) => s.selectedBaseId);
  const setSelectedBase = useMapStore((s) => s.setSelectedBase);
  const activeLayers = useMapStore((s) => s.activeLayers);

  const rebaseSquadron = useCampaignStore((s) => s.rebaseSquadron);

  const [mapInstance, setMapInstance] = useState<MLMap | null>(null);
  const [projectionVersion, setProjectionVersion] = useState(0);
  const [rebaseTarget, setRebaseTarget] = useState<{ squadron: BaseSquadronSummary; baseId: number } | null>(null);
  const [audioOn, setAudioOn] = useState(getAudioEnabled);
  const [showGuide, setShowGuide] = useState(false);
  const [showMenu, setShowMenu] = useState(false);
  const [flashBaseId, setFlashBaseId] = useState<number | null>(null);

  const isCampaignComplete = campaign
    ? campaign.current_year > 2036 || (campaign.current_year === 2036 && campaign.current_quarter > 1)
    : false;

  useEffect(() => {
    if (id && (!campaign || campaign.id !== Number(id))) {
      loadCampaign(Number(id));
    }
  }, [id, campaign, loadCampaign]);

  useEffect(() => {
    if (campaign) {
      loadBases(campaign.id);
      loadPlatforms();
      loadAcquisitions(campaign.id);
      loadRdActive(campaign.id);
      loadRdCatalog();
      loadADBatteries(campaign.id);
      loadIntel(campaign.id);
    }
  }, [campaign, loadBases, loadPlatforms, loadAcquisitions, loadRdActive, loadRdCatalog, loadADBatteries, loadIntel]);

  useEffect(() => {
    if (campaign) {
      loadPendingVignettes(campaign.id);
    }
  }, [campaign, loadPendingVignettes]);

  useEffect(() => {
    if (pendingVignettes.length > 0) playRadarPing();
  }, [pendingVignettes.length]);

  useEffect(() => {
    if (!mapInstance) return;
    const bump = () => setProjectionVersion((v) => v + 1);
    mapInstance.on("move", bump);
    return () => { mapInstance.off("move", bump); };
  }, [mapInstance]);

  const handleAdvanceTurn = async () => {
    const prev = useCampaignStore.getState().campaign;
    if (!prev) return;
    const fromYear = prev.current_year;
    const fromQuarter = prev.current_quarter;
    await advanceTurn();
    const updated = useCampaignStore.getState().campaign;
    if (updated && (updated.current_year > 2036 || (updated.current_year === 2036 && updated.current_quarter > 1))) {
      navigate(`/campaign/${updated.id}/white-paper`);
      return;
    }
    if (updated) navigate(`/campaign/${updated.id}/turn-report/${fromYear}/${fromQuarter}`);
  };

  const handleRebase = async (sqnId: number, targetBaseId: number) => {
    await rebaseSquadron(sqnId, targetBaseId);
    setRebaseTarget(null);
    setSelectedBase(null);
    setFlashBaseId(targetBaseId);
    setTimeout(() => setFlashBaseId(null), 2000);
  };

  const selectedBase = useMemo(
    () => bases.find((b) => b.id === selectedBaseId) ?? null,
    [bases, selectedBaseId],
  );

  const intelContacts = useMemo(() => synthesizeContacts(intelCards), [intelCards]);

  // Top-bar commitment summary: sum per-quarter burn from active orders + active R&D programs.
  const { topBarCommitQ, topBarOutstanding } = useMemo(() => {
    if (!campaign) return { topBarCommitQ: 0, topBarOutstanding: 0 };
    const nowIdx = campaign.current_year * 4 + (campaign.current_quarter - 1);
    let acq = 0;
    let outstandingTotal = 0;
    for (const o of acquisitions) {
      if (o.cancelled) continue;
      if (o.delivered >= o.quantity) continue;
      const totalQ = (o.foc_year - o.first_delivery_year) * 4 + (o.foc_quarter - o.first_delivery_quarter) + 1;
      const perQ = totalQ > 0 ? Math.floor(o.total_cost_cr / totalQ) : 0;
      // Quarters already paid = delivered/quantity × totalQ (approx).
      const qPaid = totalQ > 0 ? Math.floor((o.delivered / o.quantity) * totalQ) : 0;
      const remainingCost = Math.max(0, o.total_cost_cr - qPaid * perQ);
      outstandingTotal += remainingCost;
      const firstIdx = o.first_delivery_year * 4 + (o.first_delivery_quarter - 1);
      const focIdx = o.foc_year * 4 + (o.foc_quarter - 1);
      if (nowIdx >= firstIdx && nowIdx <= focIdx) acq += perQ;
    }
    const factors: Record<string, number> = { slow: 0.5, standard: 1.0, accelerated: 1.5 };
    const catById = Object.fromEntries(rdCatalog.map((c) => [c.id, c]));
    let rd = 0;
    for (const a of rdActive) {
      if (a.status !== "active") continue;
      const spec = catById[a.program_id];
      if (!spec) continue;
      rd += Math.floor((spec.base_cost_cr / spec.base_duration_quarters) * (factors[a.funding_level] ?? 1));
    }
    return { topBarCommitQ: acq + rd, topBarOutstanding: outstandingTotal };
  }, [campaign, acquisitions, rdActive, rdCatalog]);
  const topBarNetQ = (campaign?.quarterly_grant_cr ?? 0) - topBarCommitQ;
  const outstandingOrderCount = acquisitions.filter((o) => !o.cancelled && o.delivered < o.quantity).length;

  if (!campaign) return <div className="p-6">Loading…</div>;

  return (
    <div className="fixed inset-0 flex flex-col">
      <header className="flex items-center gap-2 px-3 py-2 bg-slate-900 border-b border-slate-800">
        <button
          onClick={() => setShowMenu(true)}
          aria-label="open menu"
          className="text-base px-2.5 py-1.5 rounded bg-slate-800 hover:bg-slate-700 flex-shrink-0"
        >
          ☰
        </button>
        <div className="min-w-0 flex-1">
          <h1 className="text-sm font-bold truncate">{campaign.name}</h1>
          <p className="text-[11px] leading-tight flex flex-wrap items-baseline gap-x-2 gap-y-0.5">
            <span className="opacity-80">{campaign.current_year} Q{campaign.current_quarter}</span>
            <span className="opacity-80">
              💰 <span className="font-semibold">₹{campaign.budget_cr.toLocaleString("en-US")}</span>
            </span>
            <span className={`${topBarNetQ >= 0 ? "text-emerald-300" : "text-rose-300"}`}>
              {topBarNetQ >= 0 ? "+" : ""}₹{topBarNetQ.toLocaleString("en-US")}/q
            </span>
            {outstandingOrderCount > 0 && (
              <span className="opacity-70 text-[10px]" title={`${outstandingOrderCount} active orders`}>
                📜 ₹{topBarOutstanding.toLocaleString("en-US")} outstanding
              </span>
            )}
          </p>
        </div>
        <div className="flex items-center gap-1.5 flex-shrink-0">
          {pendingVignettes.length > 0 && (
            <Link
              to={`/campaign/${campaign.id}/vignette/${pendingVignettes[0].id}`}
              className="bg-red-600 hover:bg-red-500 text-slate-100 text-xs font-semibold rounded px-2 py-1 animate-pulse"
            >
              ⚠ Ops
            </Link>
          )}
          <button
            onClick={handleAdvanceTurn}
            disabled={loading || isCampaignComplete}
            className="bg-amber-600 hover:bg-amber-500 disabled:opacity-50 text-slate-900 font-semibold rounded px-3 py-1.5 text-xs"
          >
            {loading ? "…" : "End Turn"}
          </button>
        </div>
      </header>
      {showMenu && (
        <>
          <div
            className="fixed inset-0 z-40 bg-black/60"
            onClick={() => setShowMenu(false)}
            aria-label="close menu backdrop"
          />
          <aside className="fixed top-0 right-0 bottom-0 z-50 w-72 max-w-[85vw] bg-slate-900 border-l border-slate-800 flex flex-col shadow-xl">
            <div className="flex items-center justify-between px-4 py-3 border-b border-slate-800">
              <div className="text-sm font-bold">Menu</div>
              <button
                onClick={() => setShowMenu(false)}
                aria-label="close menu"
                className="text-slate-400 hover:text-slate-200"
              >✕</button>
            </div>
            <nav className="flex-1 overflow-y-auto p-3 space-y-1">
              <div className="text-[10px] uppercase tracking-wide opacity-60 px-2 pt-1 pb-1">Force</div>
              <Link
                onClick={() => setShowMenu(false)}
                to={`/campaign/${campaign.id}/hangar`}
                className="flex items-center gap-2 text-sm rounded px-3 py-2 hover:bg-slate-800"
              >🛩 Hangar</Link>
              <Link
                onClick={() => setShowMenu(false)}
                to={`/campaign/${campaign.id}/armory`}
                className="flex items-center gap-2 text-sm rounded px-3 py-2 hover:bg-slate-800"
              >🚀 Armory</Link>

              <div className="text-[10px] uppercase tracking-wide opacity-60 px-2 pt-3 pb-1">Operations</div>
              <Link
                onClick={() => setShowMenu(false)}
                to={`/campaign/${campaign.id}/procurement`}
                className="flex items-center gap-2 text-sm rounded px-3 py-2 hover:bg-slate-800"
              >💰 Procurement</Link>
              <Link
                onClick={() => setShowMenu(false)}
                to={`/campaign/${campaign.id}/intel`}
                className="flex items-center gap-2 text-sm rounded px-3 py-2 hover:bg-slate-800"
              >🛰 Intel</Link>
              {isCampaignComplete && (
                <Link
                  onClick={() => setShowMenu(false)}
                  to={`/campaign/${campaign.id}/white-paper`}
                  className="flex items-center gap-2 text-sm rounded px-3 py-2 bg-amber-600 text-slate-900 font-semibold"
                >📰 White Paper</Link>
              )}

              <div className="text-[10px] uppercase tracking-wide opacity-60 px-2 pt-3 pb-1">Settings</div>
              <button
                type="button"
                onClick={() => { setAudioEnabled(!audioOn); setAudioOn(!audioOn); }}
                className="w-full text-left flex items-center gap-2 text-sm rounded px-3 py-2 hover:bg-slate-800"
              >{audioOn ? "🔊 Audio on" : "🔇 Audio off"}</button>
              <div className="px-3 py-2 flex items-center gap-2 text-sm">
                <span>🎨 Theme</span>
                <ThemeToggle />
              </div>
              <button
                type="button"
                onClick={() => { setShowGuide(true); setShowMenu(false); }}
                className="w-full text-left flex items-center gap-2 text-sm rounded px-3 py-2 hover:bg-slate-800"
              >❓ How to play</button>
              <Link
                onClick={() => setShowMenu(false)}
                to={`/campaign/${campaign.id}/raw`}
                className="flex items-center gap-2 text-sm rounded px-3 py-2 hover:bg-slate-800 opacity-60"
              >🛠 Raw state</Link>
              <Link
                onClick={() => setShowMenu(false)}
                to="/"
                className="flex items-center gap-2 text-sm rounded px-3 py-2 hover:bg-slate-800 opacity-60"
              >🏠 Home / Campaigns</Link>
            </nav>
          </aside>
        </>
      )}

      <div className="relative flex-1">
        <SubcontinentMap
          markers={bases}
          onMarkerClick={(bid) => setSelectedBase(bid)}
          onReady={(m) => setMapInstance(m)}
          flashBaseId={flashBaseId}
        />
        {activeLayers.ad_coverage && (
          <ADCoverageLayer
            map={mapInstance}
            bases={bases}
            batteries={adBatteries}
            projectionVersion={projectionVersion}
          />
        )}
        {activeLayers.intel_contacts && (
          <IntelContactsLayer
            map={mapInstance}
            contacts={intelContacts}
            projectionVersion={projectionVersion}
          />
        )}
        <LayerTogglePanel />

        {error && (
          <div className="absolute top-3 left-3 bg-red-900/80 border border-red-800 rounded-lg p-2 text-xs text-red-200 max-w-xs">
            {error}
          </div>
        )}
      </div>

      <BaseSheet
        base={selectedBase}
        platforms={platformsById}
        onClose={() => setSelectedBase(null)}
        onRebaseStart={(sq, baseId) => setRebaseTarget({ squadron: sq, baseId })}
      />

      <RebaseOverlay
        squadron={rebaseTarget?.squadron ?? null}
        bases={bases}
        currentBaseId={rebaseTarget?.baseId ?? 0}
        onRebase={handleRebase}
        onCancel={() => setRebaseTarget(null)}
      />

      <YearEndRecapToast />

      <HowToPlayGuide open={showGuide} onClose={() => setShowGuide(false)} />
    </div>
  );
}
