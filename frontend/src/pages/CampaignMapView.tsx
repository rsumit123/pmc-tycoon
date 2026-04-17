import { useEffect, useMemo, useState } from "react";
import { Link, useParams } from "react-router-dom";
import type { Map as MLMap } from "maplibre-gl";

import { useCampaignStore } from "../store/campaignStore";
import { useMapStore } from "../store/mapStore";

import { SubcontinentMap } from "../components/map/SubcontinentMap";
import { ADCoverageLayer } from "../components/map/ADCoverageLayer";
import { IntelContactsLayer } from "../components/map/IntelContactsLayer";
import { LayerTogglePanel } from "../components/map/LayerTogglePanel";
import { BaseSheet } from "../components/map/BaseSheet";

export function CampaignMapView() {
  const { id } = useParams<{ id: string }>();
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

  const selectedBaseId = useMapStore((s) => s.selectedBaseId);
  const setSelectedBase = useMapStore((s) => s.setSelectedBase);
  const activeLayers = useMapStore((s) => s.activeLayers);

  const [mapInstance, setMapInstance] = useState<MLMap | null>(null);
  const [projectionVersion, setProjectionVersion] = useState(0);

  useEffect(() => {
    if (id && (!campaign || campaign.id !== Number(id))) {
      loadCampaign(Number(id));
    }
  }, [id, campaign, loadCampaign]);

  useEffect(() => {
    if (campaign) {
      loadBases(campaign.id);
      loadPlatforms();
    }
  }, [campaign, loadBases, loadPlatforms]);

  useEffect(() => {
    if (campaign) {
      loadPendingVignettes(campaign.id);
    }
  }, [campaign, loadPendingVignettes]);

  useEffect(() => {
    if (!mapInstance) return;
    const bump = () => setProjectionVersion((v) => v + 1);
    mapInstance.on("move", bump);
    return () => { mapInstance.off("move", bump); };
  }, [mapInstance]);

  const selectedBase = useMemo(
    () => bases.find((b) => b.id === selectedBaseId) ?? null,
    [bases, selectedBaseId],
  );

  if (!campaign) return <div className="p-6">Loading…</div>;

  return (
    <div className="fixed inset-0 flex flex-col">
      <header className="flex items-center justify-between gap-3 px-4 py-3 bg-slate-900 border-b border-slate-800">
        <div>
          <h1 className="text-base font-bold">{campaign.name}</h1>
          <p className="text-xs opacity-70">
            {campaign.current_year} • Q{campaign.current_quarter} • ₹
            {campaign.budget_cr.toLocaleString()} cr
          </p>
        </div>
        <div className="flex items-center gap-2">
          {pendingVignettes.length > 0 && (
            <Link
              to={`/campaign/${campaign.id}/vignette/${pendingVignettes[0].id}`}
              className="bg-red-600 hover:bg-red-500 text-slate-100 text-xs font-semibold rounded-lg px-3 py-1.5 animate-pulse"
            >
              ⚠ Pending vignette
            </Link>
          )}
          <Link
            to={`/campaign/${campaign.id}/intel`}
            className="bg-slate-800 hover:bg-slate-700 text-slate-100 text-xs font-semibold rounded-lg px-3 py-1.5"
          >
            Intel
          </Link>
          <Link
            to={`/campaign/${campaign.id}/procurement`}
            className="bg-slate-800 hover:bg-slate-700 text-slate-100 text-xs font-semibold rounded-lg px-3 py-1.5"
          >
            Procurement
          </Link>
          <Link
            to={`/campaign/${campaign.id}/raw`}
            className="text-xs opacity-60 hover:opacity-100 underline"
          >
            raw
          </Link>
          <button
            onClick={advanceTurn}
            disabled={loading}
            className="bg-amber-600 hover:bg-amber-500 disabled:opacity-50 text-slate-900 font-semibold rounded-lg px-3 py-1.5 text-sm"
          >
            {loading ? "Ending…" : "End Turn"}
          </button>
        </div>
      </header>

      <div className="relative flex-1">
        <SubcontinentMap
          markers={bases}
          onMarkerClick={(bid) => setSelectedBase(bid)}
          onReady={(m) => setMapInstance(m)}
        />
        {activeLayers.ad_coverage && (
          <ADCoverageLayer
            map={mapInstance}
            bases={bases}
            projectionVersion={projectionVersion}
          />
        )}
        {activeLayers.intel_contacts && (
          <IntelContactsLayer
            map={mapInstance}
            contacts={[]}
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
      />
    </div>
  );
}
