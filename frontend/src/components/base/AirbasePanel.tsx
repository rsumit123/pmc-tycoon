import { useState } from "react";
import { api } from "../../lib/api";

interface AirbasePanelProps {
  campaignId: number;
  baseTemplateId: string;
  baseName: string;
  shelterCount: number;
  fuelDepotSize: number;
  adIntegrationLevel: number;
  runwayClass: string;
  budgetCr: number;
  onUpgraded: () => void;
}

interface UpgradeOption {
  key: string;
  label: string;
  cost: number;
  current: string | number;
  max: string | number;
  atMax: boolean;
}

const UPGRADE_COSTS: Record<string, number> = {
  shelter: 5000,
  fuel_depot: 3000,
  ad_integration: 8000,
  runway: 10000,
};

const RUNWAY_LEVELS: Record<string, number> = { light: 1, medium: 2, heavy: 3 };

export function AirbasePanel({
  campaignId,
  baseTemplateId,
  baseName,
  shelterCount,
  fuelDepotSize,
  adIntegrationLevel,
  runwayClass,
  budgetCr,
  onUpgraded,
}: AirbasePanelProps) {
  const [loading, setLoading] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const upgradeOptions: UpgradeOption[] = [
    {
      key: "shelter",
      label: "Hardened Shelters",
      cost: UPGRADE_COSTS.shelter,
      current: shelterCount,
      max: 36,
      atMax: shelterCount >= 36,
    },
    {
      key: "fuel_depot",
      label: "Fuel Depot",
      cost: UPGRADE_COSTS.fuel_depot,
      current: fuelDepotSize,
      max: 5,
      atMax: fuelDepotSize >= 5,
    },
    {
      key: "ad_integration",
      label: "AD Integration",
      cost: UPGRADE_COSTS.ad_integration,
      current: adIntegrationLevel,
      max: 3,
      atMax: adIntegrationLevel >= 3,
    },
    {
      key: "runway",
      label: "Runway Class",
      cost: UPGRADE_COSTS.runway,
      current: runwayClass,
      max: "heavy",
      atMax: (RUNWAY_LEVELS[runwayClass] ?? 2) >= 3,
    },
  ];

  async function handleUpgrade(upgradeType: string) {
    setLoading(upgradeType);
    setError(null);
    try {
      await api.upgradeBase(campaignId, baseTemplateId, upgradeType);
      onUpgraded();
    } catch (err: unknown) {
      const msg =
        err instanceof Error ? err.message : "Upgrade failed";
      setError(msg);
    } finally {
      setLoading(null);
    }
  }

  return (
    <div className="p-4 space-y-4">
      <h2 className="text-lg font-bold">{baseName}</h2>
      <p className="text-sm text-gray-500">
        Treasury: ₹{budgetCr.toLocaleString("en-US")} cr
      </p>

      {error && (
        <p className="text-red-500 text-sm">{error}</p>
      )}

      <div className="space-y-3">
        {upgradeOptions.map((opt) => {
          const canAfford = budgetCr >= opt.cost;
          const disabled = opt.atMax || !canAfford || loading !== null;

          return (
            <div
              key={opt.key}
              className="flex items-center justify-between gap-4 rounded border border-gray-200 p-3"
            >
              <div className="flex-1 min-w-0">
                <div className="font-medium text-sm">{opt.label}</div>
                <div className="text-xs text-gray-500">
                  {opt.atMax
                    ? `Max (${opt.max})`
                    : `Current: ${opt.current} / ${opt.max}`}
                </div>
              </div>
              <div className="flex items-center gap-2 shrink-0">
                <span className="text-xs text-gray-400">
                  ₹{opt.cost.toLocaleString("en-US")} cr
                </span>
                <button
                  onClick={() => handleUpgrade(opt.key)}
                  disabled={disabled}
                  className={`px-3 py-1 rounded text-sm font-medium transition-colors
                    ${disabled
                      ? "bg-gray-100 text-gray-400 cursor-not-allowed"
                      : "bg-blue-600 text-white hover:bg-blue-700 active:bg-blue-800"
                    }`}
                >
                  {loading === opt.key
                    ? "..."
                    : opt.atMax
                    ? "Max"
                    : "Upgrade"}
                </button>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
