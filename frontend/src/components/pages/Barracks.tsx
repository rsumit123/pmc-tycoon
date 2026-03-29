import { useState, useEffect, useCallback } from 'react';
import { apiService } from '../../services/api';
import { Loader2, ShieldAlert, Wrench, Trash2, Plus, Heart } from 'lucide-react';
import '../../styles/design-system.css';

interface GroundUnit {
  id: number;
  name: string;
  unit_type: string;
  role: string;
  description: string | null;
  origin: string;
  image_url: string | null;
  combat_power: number;
  anti_armor: number;
  anti_infantry: number;
  anti_air: number;
  survivability: number;
  mobility: number;
  cost_usd: number;
  upkeep_per_mission: number;
}

interface OwnedGroundUnit {
  id: number;
  ground_unit_id: number;
  custom_name: string;
  hp_pct: number;
  battles_fought: number;
  kills: number;
  unit: GroundUnit;
  acquired_at: string | null;
}

const UNIT_TYPE_COLORS: Record<string, string> = {
  infantry: 'var(--color-green)',
  rpg_team: 'var(--color-amber)',
  sniper: 'var(--color-blue)',
  manpads: 'var(--color-blue)',
  spec_ops: 'var(--color-red)',
  ifv: 'var(--color-amber)',
  light_tank: 'var(--color-amber)',
  mbt: 'var(--color-red)',
  tank_destroyer: 'var(--color-red)',
  mortar: 'var(--color-green)',
  sph: 'var(--color-amber)',
  mlrs: 'var(--color-red)',
  drone_isr: 'var(--color-blue)',
  drone_attack: 'var(--color-red)',
};

const UNIT_CATEGORY: Record<string, string> = {
  infantry: 'Infantry', rpg_team: 'Infantry', sniper: 'Infantry',
  manpads: 'Infantry', spec_ops: 'Infantry',
  ifv: 'Armor', light_tank: 'Armor', mbt: 'Armor', tank_destroyer: 'Armor',
  mortar: 'Artillery', sph: 'Artillery', mlrs: 'Artillery',
  drone_isr: 'Drones', drone_attack: 'Drones',
};

const hpColor = (hp: number) =>
  hp >= 70 ? 'var(--color-green)' : hp >= 40 ? 'var(--color-amber)' : 'var(--color-red)';

export const Barracks = () => {
  const [tab, setTab] = useState<'roster' | 'recruit'>('roster');
  const [ownedUnits, setOwnedUnits] = useState<OwnedGroundUnit[]>([]);
  const [catalog, setCatalog] = useState<GroundUnit[]>([]);
  const [balance, setBalance] = useState<number>(0);
  const [loading, setLoading] = useState(true);
  const [actionLoading, setActionLoading] = useState<number | null>(null);
  const [confirmSell, setConfirmSell] = useState<OwnedGroundUnit | null>(null);

  const fetchData = useCallback(async () => {
    try {
      const [ownedRes, catalogRes, userRes] = await Promise.all([
        apiService.getOwnedGroundUnits(),
        apiService.getGroundUnitCatalog(),
        apiService.getUser(1),
      ]);
      setOwnedUnits(Array.isArray(ownedRes.data) ? ownedRes.data : []);
      setCatalog(Array.isArray(catalogRes.data) ? catalogRes.data : []);
      setBalance(userRes.data?.balance ?? 0);
    } catch {
      // ignore
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { fetchData(); }, [fetchData]);

  const handlePurchase = async (unit: GroundUnit) => {
    setActionLoading(unit.id);
    try {
      await apiService.purchaseGroundUnit(unit.id);
      await fetchData();
    } catch (err: any) {
      alert(err?.response?.data?.detail || 'Purchase failed');
    } finally {
      setActionLoading(null);
    }
  };

  const handleRepair = async (owned: OwnedGroundUnit) => {
    const damage = 100 - owned.hp_pct;
    const cost = Math.round((damage / 100) * owned.unit.cost_usd * 0.3);
    if (damage <= 0) { alert('Unit is already at full health.'); return; }
    if (!confirm(`Repair ${owned.custom_name} for $${cost.toLocaleString()}?`)) return;
    setActionLoading(owned.id);
    try {
      await apiService.repairGroundUnit(owned.id);
      await fetchData();
    } catch (err: any) {
      alert(err?.response?.data?.detail || 'Repair failed');
    } finally {
      setActionLoading(null);
    }
  };

  const handleSell = async (owned: OwnedGroundUnit) => {
    setActionLoading(owned.id);
    setConfirmSell(null);
    try {
      await apiService.sellGroundUnit(owned.id);
      await fetchData();
    } catch (err: any) {
      alert(err?.response?.data?.detail || 'Sale failed');
    } finally {
      setActionLoading(null);
    }
  };

  // Group catalog by category
  const catalogByCategory: Record<string, GroundUnit[]> = {};
  for (const u of catalog) {
    const cat = UNIT_CATEGORY[u.unit_type] || 'Other';
    if (!catalogByCategory[cat]) catalogByCategory[cat] = [];
    catalogByCategory[cat].push(u);
  }

  if (loading) {
    return (
      <div className="flex items-center justify-center h-full">
        <div className="flex flex-col items-center gap-3">
          <Loader2 className="w-8 h-8 animate-spin" style={{ color: 'var(--color-amber)' }} />
          <p className="text-sm" style={{ color: 'var(--color-text-muted)' }}>Loading barracks...</p>
        </div>
      </div>
    );
  }

  return (
    <div className="px-4 py-5 lg:px-8 lg:py-6 max-w-4xl mx-auto">
      {/* Sell confirm sheet */}
      {confirmSell && (
        <div className="bottom-sheet-backdrop" onClick={() => setConfirmSell(null)}>
          <div className="bottom-sheet p-6" onClick={(e) => e.stopPropagation()}>
            <div className="bottom-sheet-handle mb-4" />
            <h3 className="font-display text-base mb-2" style={{ color: 'var(--color-text)' }}>
              Sell {confirmSell.custom_name}?
            </h3>
            <p className="text-sm mb-5" style={{ color: 'var(--color-text-muted)' }}>
              You'll receive ${Math.round(confirmSell.unit.cost_usd * 0.3 * (confirmSell.hp_pct / 100)).toLocaleString()}.
              This cannot be undone.
            </p>
            <div className="flex gap-3">
              <button className="btn-secondary flex-1" onClick={() => setConfirmSell(null)}>Cancel</button>
              <button
                className="btn-primary flex-1"
                style={{ background: 'var(--color-red)', borderColor: 'var(--color-red)' }}
                onClick={() => handleSell(confirmSell)}
              >
                Confirm Sale
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Header */}
      <div className="flex items-center justify-between mb-5">
        <div>
          <h1 className="font-display text-xl tracking-widest" style={{ color: 'var(--color-text)' }}>
            BARRACKS
          </h1>
          <p className="text-xs mt-0.5" style={{ color: 'var(--color-text-muted)' }}>
            Ground forces management
          </p>
        </div>
        <div className="text-right">
          <p className="text-xs" style={{ color: 'var(--color-text-muted)' }}>BALANCE</p>
          <p className="font-data font-bold text-sm" style={{ color: 'var(--color-amber)' }}>
            ${balance.toLocaleString()}
          </p>
        </div>
      </div>

      {/* Tabs */}
      <div
        className="flex gap-1 p-1 rounded-xl mb-5"
        style={{ background: 'var(--color-surface)' }}
      >
        {(['roster', 'recruit'] as const).map((t) => (
          <button
            key={t}
            onClick={() => setTab(t)}
            className="flex-1 py-2 text-xs font-display tracking-wider rounded-lg transition-all"
            style={{
              background: tab === t ? 'var(--color-amber)' : 'transparent',
              color: tab === t ? 'var(--color-text-inverse)' : 'var(--color-text-muted)',
            }}
          >
            {t === 'roster' ? `ROSTER (${ownedUnits.length})` : 'RECRUIT'}
          </button>
        ))}
      </div>

      {/* Roster */}
      {tab === 'roster' && (
        <>
          {ownedUnits.length === 0 ? (
            <div className="text-center py-16">
              <ShieldAlert className="w-12 h-12 mx-auto mb-3" style={{ color: 'var(--color-text-muted)' }} />
              <p className="font-display text-sm" style={{ color: 'var(--color-text-muted)' }}>
                NO GROUND FORCES
              </p>
              <p className="text-xs mt-1 mb-4" style={{ color: 'var(--color-text-muted)' }}>
                Recruit units from the Recruit tab
              </p>
              <button className="btn-primary text-xs" onClick={() => setTab('recruit')}>
                RECRUIT FORCES
              </button>
            </div>
          ) : (
            <div className="space-y-3">
              {ownedUnits.map((owned) => {
                const typeColor = UNIT_TYPE_COLORS[owned.unit.unit_type] || 'var(--color-text-muted)';
                const repairCost = Math.round((100 - owned.hp_pct) / 100 * owned.unit.cost_usd * 0.3);
                return (
                  <div
                    key={owned.id}
                    className="rounded-xl p-4"
                    style={{ background: 'var(--color-surface)', border: '1px solid var(--color-border)' }}
                  >
                    <div className="flex items-start gap-3">
                      <div
                        className="w-10 h-10 rounded-lg flex items-center justify-center shrink-0 text-lg font-bold"
                        style={{ background: 'var(--color-surface-raised)', color: typeColor }}
                      >
                        {owned.unit.unit_type === 'mbt' || owned.unit.unit_type === 'light_tank' ? '🚀' :
                         owned.unit.unit_type.includes('drone') ? '✈' :
                         owned.unit.unit_type.includes('arty') || owned.unit.unit_type === 'sph' || owned.unit.unit_type === 'mlrs' || owned.unit.unit_type === 'mortar' ? '💥' : '⚔'}
                      </div>
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2 flex-wrap">
                          <span className="font-display text-sm" style={{ color: 'var(--color-text)' }}>
                            {owned.custom_name}
                          </span>
                          <span
                            className="text-[9px] font-display px-1.5 py-0.5 rounded"
                            style={{ background: `${typeColor}20`, color: typeColor }}
                          >
                            {owned.unit.role.toUpperCase()}
                          </span>
                        </div>
                        <p className="text-[11px] mt-0.5" style={{ color: 'var(--color-text-muted)' }}>
                          {owned.unit.origin} · {owned.battles_fought} battles
                        </p>

                        {/* HP bar */}
                        <div className="mt-2 flex items-center gap-2">
                          <Heart className="w-3 h-3 shrink-0" style={{ color: hpColor(owned.hp_pct) }} />
                          <div className="flex-1 h-1.5 rounded-full" style={{ background: 'var(--color-surface-raised)' }}>
                            <div
                              className="h-full rounded-full transition-all"
                              style={{ width: `${owned.hp_pct}%`, background: hpColor(owned.hp_pct) }}
                            />
                          </div>
                          <span className="font-data text-[10px]" style={{ color: hpColor(owned.hp_pct) }}>
                            {owned.hp_pct.toFixed(0)}%
                          </span>
                        </div>

                        {/* Stats row */}
                        <div className="flex gap-3 mt-2">
                          {[
                            { label: 'ATK', val: owned.unit.combat_power },
                            { label: 'ARM', val: owned.unit.anti_armor },
                            { label: 'INF', val: owned.unit.anti_infantry },
                            { label: 'DEF', val: owned.unit.survivability },
                          ].map(({ label, val }) => (
                            <div key={label} className="text-center">
                              <p className="font-data text-[11px] font-semibold" style={{ color: 'var(--color-text)' }}>{val}</p>
                              <p className="text-[9px]" style={{ color: 'var(--color-text-muted)' }}>{label}</p>
                            </div>
                          ))}
                        </div>
                      </div>

                      {/* Actions */}
                      <div className="flex flex-col gap-1.5 shrink-0">
                        {owned.hp_pct < 100 && (
                          <button
                            onClick={() => handleRepair(owned)}
                            disabled={actionLoading === owned.id || balance < repairCost}
                            className="w-8 h-8 rounded-lg flex items-center justify-center"
                            style={{ background: 'rgba(107,174,114,0.15)', color: 'var(--color-green)' }}
                            title={`Repair ($${repairCost.toLocaleString()})`}
                          >
                            {actionLoading === owned.id ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Wrench className="w-3.5 h-3.5" />}
                          </button>
                        )}
                        <button
                          onClick={() => setConfirmSell(owned)}
                          disabled={actionLoading === owned.id}
                          className="w-8 h-8 rounded-lg flex items-center justify-center"
                          style={{ background: 'rgba(229,62,62,0.12)', color: 'var(--color-red)' }}
                          title="Sell unit"
                        >
                          <Trash2 className="w-3.5 h-3.5" />
                        </button>
                      </div>
                    </div>

                    {/* Destroyed badge */}
                    {owned.hp_pct <= 0 && (
                      <div
                        className="mt-2 text-center text-xs font-display py-1 rounded"
                        style={{ background: 'rgba(229,62,62,0.15)', color: 'var(--color-red)' }}
                      >
                        DESTROYED — REPAIR TO RESTORE
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          )}
        </>
      )}

      {/* Recruit */}
      {tab === 'recruit' && (
        <div className="space-y-6">
          {Object.entries(catalogByCategory).map(([category, units]) => (
            <div key={category}>
              <h3 className="font-display text-xs tracking-widest mb-3" style={{ color: 'var(--color-text-muted)' }}>
                — {category.toUpperCase()} —
              </h3>
              <div className="space-y-3">
                {units.map((unit) => {
                  const typeColor = UNIT_TYPE_COLORS[unit.unit_type] || 'var(--color-text-muted)';
                  const canAfford = balance >= unit.cost_usd;
                  return (
                    <div
                      key={unit.id}
                      className="rounded-xl p-4"
                      style={{
                        background: 'var(--color-surface)',
                        border: '1px solid var(--color-border)',
                        opacity: canAfford ? 1 : 0.6,
                      }}
                    >
                      <div className="flex items-start gap-3">
                        {unit.image_url ? (
                          <img
                            src={unit.image_url}
                            alt={unit.name}
                            className="w-14 h-10 object-cover rounded-lg shrink-0"
                            onError={(e) => { (e.target as HTMLImageElement).style.display = 'none'; }}
                          />
                        ) : (
                          <div
                            className="w-14 h-10 rounded-lg flex items-center justify-center shrink-0"
                            style={{ background: 'var(--color-surface-raised)', color: typeColor, fontSize: '20px' }}
                          >
                            ⚔
                          </div>
                        )}
                        <div className="flex-1 min-w-0">
                          <div className="flex items-center gap-2">
                            <span className="font-display text-sm" style={{ color: 'var(--color-text)' }}>{unit.name}</span>
                            <span
                              className="text-[9px] font-display px-1.5 py-0.5 rounded"
                              style={{ background: `${typeColor}20`, color: typeColor }}
                            >
                              {unit.role.toUpperCase()}
                            </span>
                          </div>
                          <p className="text-[11px] mt-0.5" style={{ color: 'var(--color-text-muted)' }}>
                            {unit.origin} · Upkeep: ${unit.upkeep_per_mission.toLocaleString()}/mission
                          </p>
                          {unit.description && (
                            <p className="text-[11px] mt-1 leading-relaxed" style={{ color: 'var(--color-text-secondary)' }}>
                              {unit.description}
                            </p>
                          )}
                          <div className="flex gap-3 mt-2">
                            {[
                              { label: 'ATK', val: unit.combat_power },
                              { label: 'ARM', val: unit.anti_armor },
                              { label: 'INF', val: unit.anti_infantry },
                              { label: 'AA', val: unit.anti_air },
                              { label: 'DEF', val: unit.survivability },
                            ].map(({ label, val }) => (
                              <div key={label} className="text-center">
                                <p className="font-data text-[11px] font-semibold" style={{ color: 'var(--color-text)' }}>{val}</p>
                                <p className="text-[9px]" style={{ color: 'var(--color-text-muted)' }}>{label}</p>
                              </div>
                            ))}
                          </div>
                        </div>
                        <div className="shrink-0 flex flex-col items-end gap-1.5">
                          <span className="font-data text-sm font-bold" style={{ color: canAfford ? 'var(--color-amber)' : 'var(--color-red)' }}>
                            ${unit.cost_usd.toLocaleString()}
                          </span>
                          <button
                            onClick={() => handlePurchase(unit)}
                            disabled={!canAfford || actionLoading === unit.id}
                            className="btn-primary text-xs py-1.5 px-3 flex items-center gap-1"
                          >
                            {actionLoading === unit.id ? (
                              <Loader2 className="w-3 h-3 animate-spin" />
                            ) : (
                              <Plus className="w-3 h-3" />
                            )}
                            RECRUIT
                          </button>
                        </div>
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
};
