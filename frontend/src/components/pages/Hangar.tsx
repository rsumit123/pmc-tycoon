import { useState, useEffect, useCallback } from 'react';
import {
  Wrench,
  ArrowUpRight,
  Trash2,
  Plane,
  Radio,
  Anchor,
  AlertCircle,
  Plus,
  ChevronDown,
  ChevronUp,
  X,
  Loader2,
  ShoppingCart,
} from 'lucide-react';
import { apiService } from '../../services/api';

interface Unit {
  id: number;
  name: string;
  type: string;
  condition: number;
  maintenance: number;
  upgrades: string[];
}

interface UnitTemplate {
  id: number;
  name: string;
  unit_type: string;
  base_cost: number;
  base_attack: number;
  base_defense: number;
  base_speed: number;
  base_range: number;
  base_maintenance_cost: number;
}

const typeIcons: Record<string, typeof Plane> = {
  fighter: Plane,
  drone: Radio,
  submarine: Anchor,
};

const conditionColor = (c: number) => {
  if (c >= 70) return 'bg-emerald-500';
  if (c >= 40) return 'bg-amber-500';
  return 'bg-red-500';
};

const conditionLabel = (c: number) => {
  if (c >= 90) return { text: 'Excellent', color: 'text-emerald-400' };
  if (c >= 70) return { text: 'Good', color: 'text-emerald-400' };
  if (c >= 40) return { text: 'Fair', color: 'text-amber-400' };
  return { text: 'Critical', color: 'text-red-400' };
};

export const Hangar = () => {
  const [units, setUnits] = useState<Unit[]>([]);
  const [templates, setTemplates] = useState<UnitTemplate[]>([]);
  const [loading, setLoading] = useState(true);
  const [expandedId, setExpandedId] = useState<number | null>(null);
  const [showMarketplace, setShowMarketplace] = useState(false);
  const [actionLoading, setActionLoading] = useState<number | null>(null);
  const [balance, setBalance] = useState(0);

  const fetchUnits = useCallback(async () => {
    try {
      const [ownedRes, templateRes, userRes] = await Promise.all([
        apiService.getOwnedUnits(),
        apiService.getUnitTemplates(),
        apiService.getUser(1),
      ]);
      setBalance(userRes.data.balance);

      const owned = Array.isArray(ownedRes.data) ? ownedRes.data : [];
      const tmpls: UnitTemplate[] = Array.isArray(templateRes.data) ? templateRes.data : [];
      setTemplates(tmpls);

      const enriched: Unit[] = owned.map((u: any) => {
        const tmpl = tmpls.find((t) => Number(t.id) === Number(u.template_id));
        return {
          id: u.id,
          name: tmpl?.name ?? 'Unknown Unit',
          type: tmpl?.unit_type ?? 'unknown',
          condition: u.condition ?? 100,
          maintenance: tmpl?.base_maintenance_cost ?? 0,
          upgrades: u.current_upgrades ? JSON.parse(u.current_upgrades) : [],
        };
      });

      setUnits(enriched);
    } catch {
      setUnits([
        { id: 1, name: 'F-16 Fighting Falcon', type: 'fighter', condition: 87, maintenance: 500, upgrades: ['Advanced Radar'] },
        { id: 2, name: 'MQ-9 Reaper Drone', type: 'drone', condition: 62, maintenance: 300, upgrades: [] },
        { id: 3, name: 'Ohio-class Submarine', type: 'submarine', condition: 34, maintenance: 800, upgrades: ['Silent Propulsion'] },
      ]);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchUnits();
  }, [fetchUnits]);

  const handleMaintenance = async (unitId: number) => {
    setActionLoading(unitId);
    const unit = units.find((u) => u.id === unitId);
    const newCondition = Math.min(100, (unit?.condition ?? 0) + 15);
    setUnits((prev) =>
      prev.map((u) => (u.id === unitId ? { ...u, condition: newCondition } : u))
    );
    try {
      await apiService.updateOwnedUnit(unitId, { condition: newCondition });
    } catch { /* optimistic update stays */ }
    finally { setActionLoading(null); }
  };

  const handleRetire = async (unitId: number) => {
    setActionLoading(unitId);
    setUnits((prev) => prev.filter((u) => u.id !== unitId));
    try {
      await apiService.deleteOwnedUnit(unitId);
    } catch { /* already removed */ }
    finally {
      setActionLoading(null);
      setExpandedId(null);
    }
  };

  const handleAcquire = async (template: UnitTemplate) => {
    if (balance < template.base_cost) return;
    setActionLoading(template.id);
    try {
      const newBalance = balance - template.base_cost;
      await Promise.all([
        apiService.createOwnedUnit({
          user_id: 1,
          template_id: template.id,
          condition: 100,
          current_upgrades: '[]',
        }),
        apiService.updateUser(1, { balance: newBalance }),
      ]);
      setBalance(newBalance);
      await fetchUnits();
      setShowMarketplace(false);
    } catch (err) {
      console.error('Failed to acquire unit:', err);
    } finally {
      setActionLoading(null);
    }
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center h-full">
        <div className="flex flex-col items-center gap-3">
          <div className="w-8 h-8 border-2 border-emerald-500 border-t-transparent rounded-full animate-spin" />
          <p className="text-sm text-gray-500">Loading hangar...</p>
        </div>
      </div>
    );
  }

  return (
    <div className="px-4 py-5 lg:px-8 lg:py-6 max-w-4xl mx-auto">
      {/* Marketplace Modal */}
      {showMarketplace && (
        <div className="fixed inset-0 bg-black/70 backdrop-blur-sm z-[60] flex items-end sm:items-center justify-center" onClick={() => setShowMarketplace(false)}>
          <div
            className="bg-gray-900 rounded-t-2xl sm:rounded-2xl border-t sm:border border-gray-800 w-full sm:max-w-md max-h-[80vh] overflow-hidden flex flex-col"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-center justify-between p-4 border-b border-gray-800">
              <div>
                <h2 className="text-lg font-bold text-white">Acquire Unit</h2>
                <p className="text-xs text-gray-500">Balance: ${balance.toLocaleString()}</p>
              </div>
              <button onClick={() => setShowMarketplace(false)} className="w-8 h-8 rounded-lg bg-gray-800 flex items-center justify-center text-gray-400">
                <X className="w-4 h-4" />
              </button>
            </div>
            <div className="overflow-y-auto p-4 space-y-3">
              {templates.length === 0 ? (
                <p className="text-sm text-gray-500 text-center py-8">No units available for purchase.</p>
              ) : (
                templates.map((tmpl) => {
                  const Icon = typeIcons[tmpl.unit_type] ?? Plane;
                  const isLoading = actionLoading === tmpl.id;
                  return (
                    <div key={tmpl.id} className="bg-gray-800/50 rounded-xl p-4">
                      <div className="flex items-center gap-3 mb-3">
                        <div className="w-10 h-10 rounded-xl bg-emerald-500/15 flex items-center justify-center">
                          <Icon className="w-5 h-5 text-emerald-400" />
                        </div>
                        <div className="flex-1 min-w-0">
                          <h3 className="text-sm font-semibold text-white">{tmpl.name}</h3>
                          <p className="text-xs text-gray-500 capitalize">{tmpl.unit_type}</p>
                        </div>
                      </div>
                      <div className="grid grid-cols-4 gap-2 mb-3 text-center">
                        <div>
                          <p className="text-[10px] text-gray-500">ATK</p>
                          <p className="text-sm font-bold text-white">{tmpl.base_attack}</p>
                        </div>
                        <div>
                          <p className="text-[10px] text-gray-500">DEF</p>
                          <p className="text-sm font-bold text-white">{tmpl.base_defense}</p>
                        </div>
                        <div>
                          <p className="text-[10px] text-gray-500">SPD</p>
                          <p className="text-sm font-bold text-white">{tmpl.base_speed}</p>
                        </div>
                        <div>
                          <p className="text-[10px] text-gray-500">RNG</p>
                          <p className="text-sm font-bold text-white">{tmpl.base_range}</p>
                        </div>
                      </div>
                      <div className="flex items-center justify-between">
                        <div>
                          <span className="text-xs text-white font-semibold">${tmpl.base_cost.toLocaleString()}</span>
                          <span className="text-xs text-gray-500 ml-1">· ${tmpl.base_maintenance_cost}/day</span>
                        </div>
                        <button
                          onClick={() => handleAcquire(tmpl)}
                          disabled={isLoading || balance < tmpl.base_cost}
                          className={`flex items-center gap-1.5 font-semibold text-xs py-2 px-4 rounded-lg transition-colors ${
                            balance >= tmpl.base_cost
                              ? 'bg-emerald-500 text-white active:bg-emerald-600 disabled:opacity-60'
                              : 'bg-gray-700 text-gray-500 cursor-not-allowed'
                          }`}
                        >
                          {isLoading ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <ShoppingCart className="w-3.5 h-3.5" />}
                          {balance >= tmpl.base_cost ? 'Buy' : 'Can\'t afford'}
                        </button>
                      </div>
                    </div>
                  );
                })
              )}
            </div>
          </div>
        </div>
      )}

      {/* Header */}
      <div className="flex items-center justify-between mb-5">
        <div>
          <h1 className="text-xl font-bold text-white lg:text-2xl">Hangar</h1>
          <p className="text-sm text-gray-500 mt-0.5">
            {units.length} unit{units.length !== 1 ? 's' : ''} deployed
          </p>
        </div>
        <button
          onClick={() => setShowMarketplace(true)}
          className="w-10 h-10 rounded-xl bg-emerald-500/15 flex items-center justify-center text-emerald-400 active:bg-emerald-500/25 transition-colors"
        >
          <Plus className="w-5 h-5" />
        </button>
      </div>

      {/* Units list */}
      {units.length === 0 ? (
        <div className="flex flex-col items-center justify-center py-16 text-center">
          <div className="w-16 h-16 rounded-2xl bg-gray-800 flex items-center justify-center mb-4">
            <Plane className="w-8 h-8 text-gray-600" />
          </div>
          <p className="text-gray-400 font-medium">No units in hangar</p>
          <p className="text-sm text-gray-600 mt-1 mb-4">Acquire units to begin operations</p>
          <button
            onClick={() => setShowMarketplace(true)}
            className="flex items-center gap-2 bg-emerald-500 text-white font-semibold text-sm py-2.5 px-5 rounded-xl active:bg-emerald-600 transition-colors"
          >
            <Plus className="w-4 h-4" />
            Browse Marketplace
          </button>
        </div>
      ) : (
        <div className="space-y-3">
          {units.map((unit) => {
            const Icon = typeIcons[unit.type] ?? Plane;
            const cond = conditionLabel(unit.condition);
            const isExpanded = expandedId === unit.id;

            return (
              <div
                key={unit.id}
                className="bg-gray-900 rounded-2xl border border-gray-800/60 overflow-hidden card-press"
              >
                {/* Main row */}
                <button
                  onClick={() => setExpandedId(isExpanded ? null : unit.id)}
                  className="w-full flex items-center gap-3.5 p-4 text-left"
                >
                  <div className={`
                    w-11 h-11 rounded-xl flex items-center justify-center shrink-0
                    ${unit.condition >= 70 ? 'bg-emerald-500/15' : unit.condition >= 40 ? 'bg-amber-500/15' : 'bg-red-500/15'}
                  `}>
                    <Icon className={`w-5 h-5 ${
                      unit.condition >= 70 ? 'text-emerald-400' : unit.condition >= 40 ? 'text-amber-400' : 'text-red-400'
                    }`} />
                  </div>

                  <div className="flex-1 min-w-0">
                    <h3 className="text-sm font-semibold text-white truncate">{unit.name}</h3>
                    <div className="flex items-center gap-2 mt-1">
                      <span className="text-xs text-gray-500 capitalize">{unit.type}</span>
                      <span className="text-gray-700">·</span>
                      <span className={`text-xs font-medium ${cond.color}`}>{cond.text}</span>
                    </div>
                  </div>

                  <div className="flex items-center gap-2.5 shrink-0">
                    <span className="text-sm font-bold text-white">{unit.condition}%</span>
                    {isExpanded
                      ? <ChevronUp className="w-4 h-4 text-gray-600" />
                      : <ChevronDown className="w-4 h-4 text-gray-600" />
                    }
                  </div>
                </button>

                {/* Condition bar */}
                <div className="px-4 pb-3 -mt-1">
                  <div className="w-full h-1.5 bg-gray-800 rounded-full overflow-hidden">
                    <div
                      className={`h-full rounded-full transition-all duration-500 ${conditionColor(unit.condition)}`}
                      style={{ width: `${unit.condition}%` }}
                    />
                  </div>
                </div>

                {/* Expanded details */}
                {isExpanded && (
                  <div className="px-4 pb-4 border-t border-gray-800/60 pt-3 space-y-3">
                    <div className="flex gap-3">
                      <div className="flex-1 bg-gray-800/50 rounded-xl p-3">
                        <p className="text-[10px] text-gray-500 uppercase tracking-wider">Maintenance</p>
                        <p className="text-sm font-semibold text-white mt-0.5">${unit.maintenance}/day</p>
                      </div>
                      <div className="flex-1 bg-gray-800/50 rounded-xl p-3">
                        <p className="text-[10px] text-gray-500 uppercase tracking-wider">Upgrades</p>
                        <p className="text-sm font-semibold text-white mt-0.5">
                          {unit.upgrades.length > 0 ? unit.upgrades.length : 'None'}
                        </p>
                      </div>
                    </div>

                    {unit.upgrades.length > 0 && (
                      <div className="flex flex-wrap gap-1.5">
                        {unit.upgrades.map((upgrade, i) => (
                          <span key={i} className="text-xs bg-violet-500/15 text-violet-300 px-2.5 py-1 rounded-lg font-medium">
                            {upgrade}
                          </span>
                        ))}
                      </div>
                    )}

                    {unit.condition < 40 && (
                      <div className="flex items-center gap-2 bg-red-500/10 rounded-xl px-3 py-2.5">
                        <AlertCircle className="w-4 h-4 text-red-400 shrink-0" />
                        <p className="text-xs text-red-300">Condition critical. Repair before deployment.</p>
                      </div>
                    )}

                    <div className="flex gap-2">
                      <button
                        onClick={(e) => { e.stopPropagation(); handleMaintenance(unit.id); }}
                        disabled={actionLoading === unit.id || unit.condition >= 100}
                        className="flex-1 flex items-center justify-center gap-1.5 bg-emerald-500/15 text-emerald-400 font-medium text-sm py-2.5 rounded-xl active:bg-emerald-500/25 disabled:opacity-40 transition-colors"
                      >
                        {actionLoading === unit.id
                          ? <Loader2 className="w-4 h-4 animate-spin" />
                          : <Wrench className="w-4 h-4" />
                        }
                        Repair
                      </button>
                      <button
                        onClick={(e) => e.stopPropagation()}
                        className="flex-1 flex items-center justify-center gap-1.5 bg-blue-500/15 text-blue-400 font-medium text-sm py-2.5 rounded-xl active:bg-blue-500/25 transition-colors"
                      >
                        <ArrowUpRight className="w-4 h-4" />
                        Upgrade
                      </button>
                      <button
                        onClick={(e) => { e.stopPropagation(); handleRetire(unit.id); }}
                        disabled={actionLoading === unit.id}
                        className="flex items-center justify-center gap-1.5 bg-gray-800 text-gray-400 font-medium text-sm py-2.5 px-4 rounded-xl active:bg-gray-700 transition-colors"
                      >
                        <Trash2 className="w-4 h-4" />
                      </button>
                    </div>
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
};
