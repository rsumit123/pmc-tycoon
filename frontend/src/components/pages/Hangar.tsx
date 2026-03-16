import { useState, useEffect, useCallback } from 'react';
import {
  Plane,
  Anchor,
  Crosshair,
  Plus,
  Minus,
  X,
  Loader2,
  ShoppingCart,
  Wrench,
  Trash2,
  ChevronRight,
  Package,
  ArrowLeft,
  RotateCw,
} from 'lucide-react';
import { apiService } from '../../services/api';
import { AircraftDiagram } from '../hangar/AircraftDiagram';
import '../../styles/design-system.css';

// ─── Types ───

interface AircraftCatalog {
  id: number; name: string; origin: string; role: string; generation: string;
  image_url: string | null; radar_range_km: number; rcs_m2: number; ecm_rating: number;
  hardpoints: number; max_payload_kg: number; thrust_to_weight_clean: number;
  max_speed_mach: number; combat_radius_km: number; unlock_cost: number; maintenance_cost: number;
}

interface OwnedAircraftData {
  id: number; aircraft_id: number; name: string; origin: string; role: string;
  condition: number; unlock_cost: number; maintenance_cost: number;
}

interface ShipCatalog {
  id: number; name: string; class_name: string; origin: string; ship_type: string;
  image_url: string | null; displacement_tons: number; max_speed_knots: number;
  radar_range_km: number; ecm_rating: number; unlock_cost: number; maintenance_cost: number;
}

interface OwnedShipData {
  id: number; ship_id: number; name: string; origin: string; condition: number;
  unlock_cost: number; maintenance_cost: number;
}

interface WeaponCatalog {
  id: number; name: string; origin: string; weapon_type: string; image_url: string | null;
  weight_kg: number; max_range_km: number; base_pk: number; guidance: string; cost_per_unit: number;
}

interface OwnedWeaponData {
  id: number; weapon_id: number; name: string; origin: string; weapon_type: string;
  image_url: string | null; quantity: number; cost_per_unit: number; weight_kg: number;
  max_range_km: number; base_pk: number; guidance: string;
}

interface SubsystemData {
  id: number;
  slot_type: string;
  module: {
    id: number; name: string; slot_type: string; tier: number; origin: string;
    description: string | null; stats: Record<string, any>; cost: number;
    maintenance_cost: number; is_default: boolean; image_url?: string | null;
  };
  condition_pct: number;
}

interface ModuleData {
  id: number; name: string; slot_type: string; tier: number; origin: string;
  description: string | null; stats: Record<string, any>; cost: number;
  maintenance_cost: number; compatible_aircraft: number[] | null; is_default: boolean;
  image_url?: string | null;
}

type Tab = 'aircraft' | 'weapons' | 'ships';

const typeLabel: Record<string, string> = { BVR_AAM: 'BVR', IR_AAM: 'WVR', ASM: 'Anti-Ship', SAM: 'SAM', CIWS: 'CIWS', GUN: 'Gun' };
const typeBg: Record<string, string> = {
  BVR_AAM: 'bg-accent-blue/20 text-accent-blue border-accent-blue/30',
  IR_AAM: 'bg-accent-red/20 text-accent-red border-accent-red/30',
  ASM: 'bg-accent-amber/20 text-accent-amber border-accent-amber/30',
  SAM: 'bg-accent-green/20 text-accent-green border-accent-green/30',
  CIWS: 'bg-ink-faint/40 text-ink-secondary border-border', GUN: 'bg-ink-faint/40 text-ink-secondary border-border',
};
const roleLabel: Record<string, string> = { multirole: 'Multirole', air_superiority: 'Air Superiority', interceptor: 'Interceptor', strike: 'Strike' };

const conditionColor = (c: number) => c >= 70 ? 'text-accent-green' : c >= 40 ? 'text-accent-amber' : 'text-accent-red';
const conditionBg = (c: number) => c >= 70 ? 'gauge-fill-green' : c >= 40 ? 'gauge-fill-amber' : 'gauge-fill-red';
const tierBadge = (t: number) => t >= 3 ? 'bg-accent-amber/20 text-accent-amber border-accent-amber/30' : t >= 2 ? 'bg-accent-blue/20 text-accent-blue border-accent-blue/30' : 'bg-ink-faint/40 text-ink-secondary border-border';

const SLOT_LABELS: Record<string, string> = { radar: 'RADAR', engine: 'ENGINE', ecm: 'ECM SUITE', countermeasures: 'COUNTERMEAS.', computer: 'COMPUTER', airframe: 'AIRFRAME' };
const SLOT_ORDER = ['radar', 'engine', 'ecm', 'countermeasures', 'computer', 'airframe'];

const slotStatDisplay = (slot: string, stats: Record<string, any>): string => {
  switch (slot) {
    case 'radar': return `${stats.radar_range_km || 0}km`;
    case 'engine': return `TWR ${stats.thrust_to_weight_mod || 1.0}`;
    case 'ecm': return `Rating ${stats.ecm_rating || 0}`;
    case 'countermeasures': return `${stats.chaff_count || 0}CH/${stats.flare_count || 0}FL`;
    case 'computer': return stats.pk_bonus ? `Pk+${(stats.pk_bonus * 100).toFixed(0)}%` : 'Base';
    case 'airframe': return `${stats.max_g_mod || 9.0}G · RCS×${stats.rcs_mod || 1.0}`;
    default: return '';
  }
};

export const Hangar = () => {
  const [tab, setTab] = useState<Tab>('aircraft');
  const [loading, setLoading] = useState(true);
  const [balance, setBalance] = useState(0);
  const [actionLoading, setActionLoading] = useState<string | null>(null);

  const [aircraftCatalog, setAircraftCatalog] = useState<AircraftCatalog[]>([]);
  const [ownedAircraft, setOwnedAircraft] = useState<OwnedAircraftData[]>([]);
  const [showAircraftShop, setShowAircraftShop] = useState(false);
  const [shipCatalog, setShipCatalog] = useState<ShipCatalog[]>([]);
  const [ownedShips, setOwnedShips] = useState<OwnedShipData[]>([]);
  const [showShipShop, setShowShipShop] = useState(false);
  const [weaponCatalog, setWeaponCatalog] = useState<WeaponCatalog[]>([]);
  const [ownedWeapons, setOwnedWeapons] = useState<OwnedWeaponData[]>([]);
  const [showWeaponShop, setShowWeaponShop] = useState(false);
  const [buyQty, setBuyQty] = useState<Record<number, number>>({});

  // Aircraft detail view
  const [detailAircraft, setDetailAircraft] = useState<OwnedAircraftData | null>(null);
  const [subsystems, setSubsystems] = useState<SubsystemData[]>([]);
  const [swapSlot, setSwapSlot] = useState<string | null>(null);
  const [availableModules, setAvailableModules] = useState<ModuleData[]>([]);
  const [subsystemsLoading, setSubsystemsLoading] = useState(false);
  const [computedStats, setComputedStats] = useState<any>(null);
  const [selectedDiagramSlot, setSelectedDiagramSlot] = useState<string | null>('radar');

  const fetchData = useCallback(async () => {
    try {
      const [userRes, acCatRes, ownedAcRes, shipCatRes, ownedShipRes, wpnCatRes, ownedWpnRes] = await Promise.all([
        apiService.getUser(1),
        apiService.getAircraft().catch(() => ({ data: [] })),
        apiService.getOwnedAircraft().catch(() => ({ data: [] })),
        apiService.getShips().catch(() => ({ data: [] })),
        apiService.getOwnedShips().catch(() => ({ data: [] })),
        apiService.getWeapons().catch(() => ({ data: [] })),
        apiService.getOwnedWeapons().catch(() => ({ data: [] })),
      ]);
      setBalance(userRes.data.balance);
      setAircraftCatalog(Array.isArray(acCatRes.data) ? acCatRes.data : []);
      setOwnedAircraft(Array.isArray(ownedAcRes.data) ? ownedAcRes.data : []);
      setShipCatalog(Array.isArray(shipCatRes.data) ? shipCatRes.data : []);
      setOwnedShips(Array.isArray(ownedShipRes.data) ? ownedShipRes.data : []);
      setWeaponCatalog(Array.isArray(wpnCatRes.data) ? wpnCatRes.data : []);
      setOwnedWeapons(Array.isArray(ownedWpnRes.data) ? ownedWpnRes.data : []);
    } catch { /* keep state */ } finally { setLoading(false); }
  }, []);

  useEffect(() => { fetchData(); }, [fetchData]);

  // ─── Open aircraft detail ───
  const openAircraftDetail = async (ac: OwnedAircraftData) => {
    setDetailAircraft(ac);
    setSubsystemsLoading(true);
    setComputedStats(null);
    try {
      const res = await apiService.getAircraftSubsystems(ac.id);
      setSubsystems(res.data.subsystems || []);
    } catch { setSubsystems([]); }
    finally { setSubsystemsLoading(false); }
    const statsRes = await apiService.getAircraftComputedStats(ac.id).catch(() => ({ data: null }));
    if (statsRes.data) setComputedStats(statsRes.data);
  };

  // ─── Open swap drawer ───
  const openSwapDrawer = async (slotType: string) => {
    setSwapSlot(slotType);
    try {
      const res = await apiService.getSubsystemModules(slotType);
      setAvailableModules(res.data || []);
    } catch { setAvailableModules([]); }
  };

  // ─── Swap module ───
  const handleSwap = async (moduleId: number) => {
    if (!detailAircraft || !swapSlot) return;
    const slotBeingSwapped = swapSlot;
    setActionLoading(`swap-${swapSlot}`);
    try {
      await apiService.swapModule(detailAircraft.id, swapSlot, moduleId);
      // Re-fetch subsystems AND computed stats
      const [subsRes, statsRes] = await Promise.all([
        apiService.getAircraftSubsystems(detailAircraft.id),
        apiService.getAircraftComputedStats(detailAircraft.id).catch(() => ({ data: null })),
      ]);
      setSubsystems(subsRes.data.subsystems || []);
      if (statsRes.data) setComputedStats(statsRes.data);
      setSwapSlot(null);
      // Keep the diagram focused on the slot we just swapped
      setSelectedDiagramSlot(slotBeingSwapped);
    } catch (err) { console.error('Swap failed:', err); }
    finally { setActionLoading(null); }
  };

  // ─── Repair ───
  const handleRepairAll = async () => {
    if (!detailAircraft) return;
    setActionLoading('repair');
    try {
      const res = await apiService.repairSubsystems(detailAircraft.id, undefined, true);
      setBalance(res.data.new_balance);
      setSubsystems(res.data.subsystems || []);
    } catch (err) { console.error('Repair failed:', err); }
    finally { setActionLoading(null); }
  };

  // ─── Buy/Sell actions (unchanged logic) ───
  const handleBuyAircraft = async (ac: AircraftCatalog) => {
    if (balance < ac.unlock_cost) return;
    setActionLoading(`buy-ac-${ac.id}`);
    try { const res = await apiService.purchaseAircraft(ac.id); setBalance(res.data.new_balance); await fetchData(); setShowAircraftShop(false); }
    catch (err) { console.error('Purchase failed:', err); } finally { setActionLoading(null); }
  };
  const handleSellAircraft = async (ownedId: number) => {
    setActionLoading(`sell-ac-${ownedId}`);
    try { await apiService.sellAircraft(ownedId); await fetchData(); setDetailAircraft(null); }
    catch (err) { console.error('Sell failed:', err); } finally { setActionLoading(null); }
  };
  const handleBuyShip = async (ship: ShipCatalog) => {
    if (balance < ship.unlock_cost) return;
    setActionLoading(`buy-ship-${ship.id}`);
    try { const res = await apiService.purchaseShip(ship.id); setBalance(res.data.new_balance); await fetchData(); setShowShipShop(false); }
    catch (err) { console.error('Purchase failed:', err); } finally { setActionLoading(null); }
  };
  const handleBuyWeapons = async (wpn: WeaponCatalog) => {
    const qty = buyQty[wpn.id] || 1;
    if (balance < wpn.cost_per_unit * qty) return;
    setActionLoading(`buy-wpn-${wpn.id}`);
    try { const res = await apiService.purchaseWeapons(wpn.id, qty); setBalance(res.data.new_balance); setBuyQty(p => ({ ...p, [wpn.id]: 1 })); await fetchData(); }
    catch (err) { console.error('Purchase failed:', err); } finally { setActionLoading(null); }
  };

  const repairCost = subsystems.reduce((sum, s) => {
    if (s.condition_pct >= 100) return sum;
    return sum + Math.round(((100 - s.condition_pct) / 100) * s.module.maintenance_cost);
  }, 0);

  if (loading) return (
    <div className="flex items-center justify-center h-full">
      <div className="flex flex-col items-center gap-3">
        <Loader2 className="w-6 h-6 animate-spin" style={{ color: 'var(--color-amber)' }} />
        <p className="text-sm" style={{ color: 'var(--color-text-muted)' }}>Loading dossier...</p>
      </div>
    </div>
  );

  // ═══════════════════════════════════════════════
  // AIRCRAFT DETAIL VIEW (full screen)
  // ═══════════════════════════════════════════════
  if (detailAircraft) {
    const catalog = aircraftCatalog.find(c => c.id === detailAircraft.aircraft_id);
    const sortedSubs = SLOT_ORDER.map(slot => subsystems.find(s => s.slot_type === slot)).filter(Boolean) as SubsystemData[];

    return (
      <div className="px-4 py-4 lg:px-8 lg:py-6 max-w-4xl mx-auto" style={{ color: 'var(--color-text)' }}>
        {/* Back button */}
        <button onClick={() => { setDetailAircraft(null); setSwapSlot(null); }} className="flex items-center gap-1.5 mb-4 text-sm" style={{ color: 'var(--color-text-secondary)' }}>
          <ArrowLeft className="w-4 h-4" /> Back to Fleet
        </button>

        {/* Header */}
        <div className="card-dossier-tab p-0 mb-4 overflow-hidden">
          {catalog?.image_url && (
            <div className="relative h-40 overflow-hidden">
              <img src={catalog.image_url} alt={detailAircraft.name} className="w-full h-full object-cover" />
              <div className="absolute inset-0" style={{ background: 'linear-gradient(to top, var(--color-surface) 0%, transparent 60%)' }} />
            </div>
          )}
          <div className="p-4 -mt-8 relative">
            <div className="flex items-start justify-between">
              <div>
                <span className="stamp stamp-confidential text-[10px] mb-2 inline-block">CLASSIFIED</span>
                <h1 className="font-display text-xl tracking-wider" style={{ color: 'var(--color-text)' }}>{detailAircraft.name}</h1>
                <p className="text-xs mt-0.5" style={{ color: 'var(--color-text-secondary)' }}>
                  {detailAircraft.origin} · {roleLabel[detailAircraft.role] || detailAircraft.role}
                  {catalog && <> · Gen {catalog.generation}</>}
                </p>
              </div>
            </div>
            {/* Hull condition */}
            <div className="mt-3 flex items-center gap-3">
              <span className="label-section">HULL</span>
              <div className="flex-1 gauge-bar">
                <div className={`gauge-fill ${conditionBg(detailAircraft.condition)}`} style={{ width: `${detailAircraft.condition}%` }} />
              </div>
              <span className={`font-data text-sm font-bold ${conditionColor(detailAircraft.condition)}`}>{detailAircraft.condition}%</span>
            </div>
          </div>
        </div>

        {/* Subsystems — Aircraft Diagram */}
        <div className="mb-4">
          <p className="label-section mb-2">SUBSYSTEMS</p>
          {subsystemsLoading ? (
            <div className="flex items-center justify-center py-8">
              <Loader2 className="w-5 h-5 animate-spin" style={{ color: 'var(--color-amber)' }} />
            </div>
          ) : (
            <>
              {/* Interactive aircraft diagram */}
              <div className="card-dossier p-3 mb-3">
                <AircraftDiagram
                  slots={sortedSubs.map(sub => ({
                    slot_type: sub.slot_type,
                    module_name: sub.module.name.replace(` (${detailAircraft.name})`, ''),
                    key_stat: slotStatDisplay(sub.slot_type, sub.module.stats),
                    condition_pct: sub.condition_pct,
                  }))}
                  selectedSlot={swapSlot || selectedDiagramSlot}
                  onSlotSelect={(slotType) => setSelectedDiagramSlot(slotType)}
                />
              </div>

              {/* Selected slot detail card */}
              {(() => {
                const activeSlot = swapSlot || selectedDiagramSlot;
                const sub = activeSlot ? sortedSubs.find(s => s.slot_type === activeSlot) : null;
                if (!sub) return null;
                return (
                  <div className="card-dossier p-3 mb-3" style={{ borderLeft: `3px solid ${sub.condition_pct > 70 ? 'var(--color-green)' : sub.condition_pct > 40 ? 'var(--color-amber)' : 'var(--color-red)'}` }}>
                    <div className="flex gap-3">
                      {/* Module image */}
                      {sub.module.image_url ? (
                        <img src={sub.module.image_url} alt={sub.module.name} className="w-16 h-16 rounded-lg object-cover shrink-0" />
                      ) : (
                        <div className="w-16 h-16 rounded-lg shrink-0 flex items-center justify-center text-xs font-display tracking-wider" style={{ background: 'var(--color-surface-raised)', color: 'var(--color-text-muted)' }}>
                          {(SLOT_LABELS[sub.slot_type] || sub.slot_type).slice(0, 3)}
                        </div>
                      )}
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center justify-between mb-0.5">
                          <span className="font-display text-[10px] tracking-wider" style={{ color: 'var(--color-amber)' }}>
                            {SLOT_LABELS[sub.slot_type] || sub.slot_type}
                          </span>
                          {sub.module.tier > 1 && (
                            <span className={`text-[8px] font-bold px-1.5 py-0.5 rounded border font-display ${tierBadge(sub.module.tier)}`}>
                              TIER {sub.module.tier}
                            </span>
                          )}
                        </div>
                        <p className="font-data text-sm font-medium truncate" style={{ color: 'var(--color-text)' }}>
                          {sub.module.name.replace(` (${detailAircraft.name})`, '')}
                        </p>
                        <p className="font-data text-xs mt-0.5" style={{ color: 'var(--color-text-secondary)' }}>
                          {slotStatDisplay(sub.slot_type, sub.module.stats)}
                        </p>
                      </div>
                    </div>
                    <div className="mt-2 flex items-center gap-2">
                      <div className="flex-1 gauge-bar" style={{ height: '5px' }}>
                        <div className={`gauge-fill ${conditionBg(sub.condition_pct)}`} style={{ width: `${sub.condition_pct}%` }} />
                      </div>
                      <span className={`font-data text-[11px] font-bold ${conditionColor(sub.condition_pct)}`}>{sub.condition_pct}%</span>
                    </div>
                    <button
                      onClick={() => openSwapDrawer(sub.slot_type)}
                      className="btn-secondary mt-2 w-full flex items-center justify-center gap-1 text-xs py-2"
                    >
                      <RotateCw className="w-3.5 h-3.5" /> SWAP MODULE
                    </button>
                  </div>
                );
              })()}
            </>
          )}
        </div>

        {/* Performance summary */}
        {computedStats && (
          <div className="mb-4">
            <p className="label-section mb-2">PERFORMANCE SUMMARY</p>
            <div className="grid grid-cols-3 gap-2">
              {[
                { label: 'DETECT', value: `${computedStats.radar_range_km}km`, color: 'var(--color-blue)' },
                { label: 'ECM', value: `${computedStats.ecm_rating}`, color: 'var(--color-amber)' },
                { label: 'CHAFF', value: `${computedStats.chaff_count}`, color: 'var(--color-text-secondary)' },
                { label: 'FLARE', value: `${computedStats.flare_count}`, color: 'var(--color-text-secondary)' },
                { label: 'G-LIM', value: `${computedStats.max_g_mod}G`, color: 'var(--color-text-secondary)' },
                { label: 'Pk+', value: `${(computedStats.pk_bonus * 100).toFixed(0)}%`, color: 'var(--color-green)' },
              ].map(s => (
                <div key={s.label} className="card-dossier p-2 text-center">
                  <p className="text-[9px] font-display tracking-wider" style={{ color: 'var(--color-text-muted)' }}>{s.label}</p>
                  <p className="font-data text-sm font-bold" style={{ color: s.color }}>{s.value}</p>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* Actions */}
        <div className="flex gap-2.5">
          <button onClick={handleRepairAll} disabled={repairCost === 0 || actionLoading === 'repair' || balance < repairCost}
            className="btn-primary flex-1 flex items-center justify-center gap-2 text-sm">
            {actionLoading === 'repair' ? <Loader2 className="w-4 h-4 animate-spin" /> : <Wrench className="w-4 h-4" />}
            {repairCost > 0 ? `REPAIR ALL — $${repairCost.toLocaleString()}` : 'ALL SYSTEMS NOMINAL'}
          </button>
          <button onClick={() => handleSellAircraft(detailAircraft.id)} disabled={!!actionLoading}
            className="btn-danger flex items-center justify-center gap-1.5 text-sm px-4">
            {actionLoading === `sell-ac-${detailAircraft.id}` ? <Loader2 className="w-4 h-4 animate-spin" /> : <Trash2 className="w-4 h-4" />}
            SELL
          </button>
        </div>

        {/* Module Swap Bottom Sheet */}
        {swapSlot && (
          <>
            <div className="bottom-sheet-backdrop" onClick={() => setSwapSlot(null)} />
            <div className="bottom-sheet p-4">
              <div className="bottom-sheet-handle" />
              <div className="flex items-center justify-between mb-4">
                <h3 className="font-display text-base tracking-wider" style={{ color: 'var(--color-amber)' }}>
                  SWAP {SLOT_LABELS[swapSlot] || swapSlot}
                </h3>
                <button onClick={() => setSwapSlot(null)} className="w-8 h-8 rounded-lg flex items-center justify-center" style={{ background: 'var(--color-surface)', color: 'var(--color-text-muted)' }}>
                  <X className="w-4 h-4" />
                </button>
              </div>

              {/* Current module */}
              {(() => {
                const current = subsystems.find(s => s.slot_type === swapSlot);
                if (!current) return null;
                return (
                  <div className="card-dossier p-3 mb-3">
                    <p className="text-[10px] font-display tracking-wider mb-1" style={{ color: 'var(--color-text-muted)' }}>CURRENTLY INSTALLED</p>
                    <p className="font-data text-sm" style={{ color: 'var(--color-text)' }}>{current.module.name.replace(` (${detailAircraft.name})`, '')}</p>
                    <p className="font-data text-xs" style={{ color: 'var(--color-text-secondary)' }}>{slotStatDisplay(swapSlot, current.module.stats)} · {current.condition_pct}% condition</p>
                  </div>
                );
              })()}

              <p className="text-[10px] font-display tracking-wider mb-2" style={{ color: 'var(--color-text-muted)' }}>AVAILABLE MODULES</p>
              <div className="space-y-2 max-h-[50vh] overflow-y-auto scroll-list">
                {availableModules.filter(m => {
                  const current = subsystems.find(s => s.slot_type === swapSlot);
                  return !current || m.id !== current.module.id;
                }).map(mod => {
                  const current = subsystems.find(s => s.slot_type === swapSlot);
                  const isInstalled = current?.module.id === mod.id;
                  return (
                    <div key={mod.id} className="card-dossier p-3">
                      <div className="flex items-start gap-3">
                        {/* Module image */}
                        {mod.image_url ? (
                          <img src={mod.image_url} alt={mod.name} className="w-12 h-12 rounded-lg object-cover shrink-0" />
                        ) : (
                          <div className="w-12 h-12 rounded-lg shrink-0 flex items-center justify-center text-[9px] font-display" style={{ background: 'var(--color-surface-raised)', color: 'var(--color-text-muted)' }}>
                            {(swapSlot || '').slice(0, 3).toUpperCase()}
                          </div>
                        )}
                        <div className="flex-1 min-w-0">
                          <div className="flex items-center gap-2">
                            <p className="font-data text-sm font-medium truncate" style={{ color: 'var(--color-text)' }}>{mod.name}</p>
                            <span className={`text-[8px] font-bold px-1.5 py-0.5 rounded border font-display ${tierBadge(mod.tier)}`}>T{mod.tier}</span>
                          </div>
                          <p className="font-data text-xs mt-0.5" style={{ color: 'var(--color-text-secondary)' }}>
                            {slotStatDisplay(swapSlot, mod.stats)}
                          </p>
                          {mod.description && <p className="text-xs mt-1" style={{ color: 'var(--color-text-muted)' }}>{mod.description}</p>}
                          {/* Stat diff */}
                          {current && swapSlot === 'radar' && (
                            <StatDiff label="Range" current={current.module.stats.radar_range_km} next={mod.stats.radar_range_km} unit="km" />
                          )}
                          {current && swapSlot === 'ecm' && (
                            <StatDiff label="ECM Rating" current={current.module.stats.ecm_rating} next={mod.stats.ecm_rating} />
                          )}
                          {current && swapSlot === 'engine' && (
                            <StatDiff label="TWR" current={current.module.stats.thrust_to_weight_mod} next={mod.stats.thrust_to_weight_mod} />
                          )}
                        </div>
                        <button
                          onClick={() => handleSwap(mod.id)}
                          disabled={isInstalled || actionLoading === `swap-${swapSlot}`}
                          className="btn-secondary text-xs px-3 py-2 shrink-0 mt-1"
                        >
                          {actionLoading === `swap-${swapSlot}` ? <Loader2 className="w-3 h-3 animate-spin" /> : 'INSTALL'}
                        </button>
                        </div>
                    </div>
                  );
                })}
                {availableModules.length <= 1 && (
                  <p className="text-center text-xs py-4" style={{ color: 'var(--color-text-muted)' }}>No other modules available for this slot</p>
                )}
              </div>
            </div>
          </>
        )}
      </div>
    );
  }

  // ═══════════════════════════════════════════════
  // MAIN HANGAR LIST VIEW
  // ═══════════════════════════════════════════════
  return (
    <div className="px-4 py-5 lg:px-8 lg:py-6 max-w-4xl mx-auto" style={{ color: 'var(--color-text)' }}>
      {/* Header */}
      <div className="flex items-center justify-between mb-1">
        <div>
          <h1 className="font-display text-xl tracking-wider">EQUIPMENT DOSSIER</h1>
          <p className="text-xs mt-0.5" style={{ color: 'var(--color-text-secondary)' }}>
            Treasury: <span className="font-data font-bold" style={{ color: 'var(--color-amber)' }}>${balance.toLocaleString()}</span>
          </p>
        </div>
        <span className="stamp stamp-confidential text-[9px]">CLASSIFIED</span>
      </div>

      <div className="divider" />

      {/* Tabs */}
      <div className="tab-bar mb-4">
        {([
          { key: 'aircraft' as Tab, label: 'Aircraft', icon: Plane, count: ownedAircraft.length },
          { key: 'weapons' as Tab, label: 'Arsenal', icon: Crosshair, count: ownedWeapons.reduce((s, w) => s + w.quantity, 0) },
          { key: 'ships' as Tab, label: 'Fleet', icon: Anchor, count: ownedShips.length },
        ]).map(t => (
          <button key={t.key} onClick={() => setTab(t.key)} className={`tab-item ${tab === t.key ? 'tab-item-active' : ''}`}>
            <t.icon className="w-3.5 h-3.5" />
            {t.label}
            <span className="tab-count">{t.count}</span>
          </button>
        ))}
      </div>

      {/* ═══ AIRCRAFT TAB ═══ */}
      {tab === 'aircraft' && (
        <>
          <div className="flex items-center justify-between mb-3">
            <p className="label-section">{ownedAircraft.length} aircraft in fleet</p>
            <button onClick={() => setShowAircraftShop(true)} className="btn-secondary text-xs flex items-center gap-1.5 py-2 px-3">
              <ShoppingCart className="w-3.5 h-3.5" /> PROCURE
            </button>
          </div>

          {ownedAircraft.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-16 text-center">
              <Plane className="w-12 h-12 mb-3" style={{ color: 'var(--color-text-muted)' }} />
              <p className="text-sm font-medium" style={{ color: 'var(--color-text-secondary)' }}>No aircraft in fleet</p>
              <p className="text-xs mt-1" style={{ color: 'var(--color-text-muted)' }}>Procure aircraft to deploy on missions</p>
            </div>
          ) : (
            <div className="space-y-2.5">
              {ownedAircraft.map(ac => {
                const catalog = aircraftCatalog.find(c => c.id === ac.aircraft_id);
                return (
                  <button key={ac.id} onClick={() => openAircraftDetail(ac)} className="card-dossier-tab w-full text-left card-press">
                    <div className="flex gap-3 p-3">
                      {catalog?.image_url ? (
                        <img src={catalog.image_url} alt={ac.name} className="w-20 h-14 rounded object-cover shrink-0" />
                      ) : (
                        <div className="w-20 h-14 rounded flex items-center justify-center shrink-0" style={{ background: 'var(--color-surface-raised)' }}>
                          <Plane className="w-6 h-6" style={{ color: 'var(--color-text-muted)' }} />
                        </div>
                      )}
                      <div className="flex-1 min-w-0">
                        <h3 className="text-sm font-semibold truncate" style={{ color: 'var(--color-text)' }}>{ac.name}</h3>
                        <div className="flex items-center gap-2 mt-0.5">
                          <span className="text-[11px]" style={{ color: 'var(--color-text-muted)' }}>{ac.origin}</span>
                          {catalog && (
                            <span className="text-[10px] font-display tracking-wider" style={{ color: 'var(--color-text-muted)' }}>
                              GEN {catalog.generation} · {roleLabel[catalog.role] || catalog.role}
                            </span>
                          )}
                        </div>
                        <div className="flex items-center gap-2 mt-1.5">
                          <div className="flex-1 gauge-bar" style={{ height: '4px', maxWidth: '80px' }}>
                            <div className={`gauge-fill ${conditionBg(ac.condition)}`} style={{ width: `${ac.condition}%` }} />
                          </div>
                          <span className={`font-data text-[11px] font-bold ${conditionColor(ac.condition)}`}>{ac.condition}%</span>
                        </div>
                      </div>
                      <div className="shrink-0 flex items-center">
                        <ChevronRight className="w-4 h-4" style={{ color: 'var(--color-text-muted)' }} />
                      </div>
                    </div>
                  </button>
                );
              })}
            </div>
          )}

          {/* Aircraft Shop */}
          {showAircraftShop && (
            <ShopModal title="PROCURE AIRCRAFT" subtitle={`Treasury: $${balance.toLocaleString()}`} onClose={() => setShowAircraftShop(false)}>
              {aircraftCatalog.map(ac => {
                const alreadyOwned = ownedAircraft.some(o => o.aircraft_id === ac.id);
                return (
                  <div key={ac.id} className="card-dossier overflow-hidden">
                    {ac.image_url && <img src={ac.image_url} alt={ac.name} className="w-full h-28 object-cover" />}
                    <div className="p-3">
                      <h3 className="text-sm font-semibold" style={{ color: 'var(--color-text)' }}>{ac.name}</h3>
                      <p className="text-[10px] mt-0.5" style={{ color: 'var(--color-text-muted)' }}>{ac.origin} · Gen {ac.generation} · {roleLabel[ac.role] || ac.role}</p>
                      <div className="grid grid-cols-4 gap-1.5 my-2.5 text-center">
                        {[
                          { label: 'RADAR', value: `${ac.radar_range_km}km` },
                          { label: 'RCS', value: `${ac.rcs_m2}m²` },
                          { label: 'ECM', value: `${ac.ecm_rating}` },
                          { label: 'HP', value: `${ac.hardpoints}` },
                        ].map(s => (
                          <div key={s.label} className="rounded p-1" style={{ background: 'var(--color-surface-raised)' }}>
                            <p className="text-[8px] font-display tracking-wider" style={{ color: 'var(--color-text-muted)' }}>{s.label}</p>
                            <p className="font-data text-[11px] font-bold" style={{ color: 'var(--color-text)' }}>{s.value}</p>
                          </div>
                        ))}
                      </div>
                      <div className="flex items-center justify-between">
                        <span className="font-data text-sm font-bold" style={{ color: 'var(--color-text)' }}>${ac.unlock_cost.toLocaleString()}</span>
                        <button onClick={() => handleBuyAircraft(ac)} disabled={!!actionLoading || balance < ac.unlock_cost || alreadyOwned}
                          className={alreadyOwned ? 'btn-secondary text-xs py-2 px-4 opacity-50' : 'btn-primary text-xs py-2 px-4'}>
                          {actionLoading === `buy-ac-${ac.id}` ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> :
                            alreadyOwned ? 'OWNED' : balance >= ac.unlock_cost ? 'PROCURE' : "INSUFFICIENT FUNDS"}
                        </button>
                      </div>
                    </div>
                  </div>
                );
              })}
            </ShopModal>
          )}
        </>
      )}

      {/* ═══ WEAPONS TAB ═══ */}
      {tab === 'weapons' && (
        <>
          <div className="flex items-center justify-between mb-3">
            <p className="label-section">{ownedWeapons.reduce((s, w) => s + w.quantity, 0)} weapons in stock</p>
            <button onClick={() => setShowWeaponShop(true)} className="btn-secondary text-xs flex items-center gap-1.5 py-2 px-3">
              <ShoppingCart className="w-3.5 h-3.5" /> PROCURE
            </button>
          </div>

          {ownedWeapons.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-16 text-center">
              <Crosshair className="w-12 h-12 mb-3" style={{ color: 'var(--color-text-muted)' }} />
              <p className="text-sm font-medium" style={{ color: 'var(--color-text-secondary)' }}>No weapons in stock</p>
            </div>
          ) : (
            <div className="space-y-2">
              {ownedWeapons.map(w => (
                <div key={w.id} className="card-dossier p-3">
                  <div className="flex items-center gap-3">
                    {w.image_url ? (
                      <img src={w.image_url} alt={w.name} className="w-14 h-10 rounded object-cover shrink-0" />
                    ) : (
                      <div className={`w-14 h-10 rounded flex items-center justify-center border text-[10px] font-bold shrink-0 ${typeBg[w.weapon_type] || 'bg-ink-faint/40 text-ink-secondary border-border'}`}>
                        {typeLabel[w.weapon_type] || w.weapon_type}
                      </div>
                    )}
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-semibold truncate" style={{ color: 'var(--color-text)' }}>{w.name}</p>
                      <div className="flex items-center gap-1.5 mt-0.5">
                        <span className={`text-[9px] font-bold px-1.5 py-0.5 rounded border ${typeBg[w.weapon_type] || ''}`}>
                          {typeLabel[w.weapon_type] || w.weapon_type}
                        </span>
                        <span className="font-data text-[10px]" style={{ color: 'var(--color-text-muted)' }}>{w.max_range_km}km · Pk {(w.base_pk * 100).toFixed(0)}%</span>
                      </div>
                    </div>
                    <div className="shrink-0 text-right">
                      <div className="flex items-center gap-1">
                        <Package className="w-3 h-3" style={{ color: 'var(--color-amber)' }} />
                        <span className="font-data text-lg font-bold" style={{ color: 'var(--color-amber)' }}>{w.quantity}</span>
                      </div>
                      <p className="font-data text-[9px]" style={{ color: 'var(--color-text-muted)' }}>${w.cost_per_unit.toLocaleString()} ea</p>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          )}

          {showWeaponShop && (
            <ShopModal title="PROCURE WEAPONS" subtitle={`Treasury: $${balance.toLocaleString()}`} onClose={() => setShowWeaponShop(false)}>
              {weaponCatalog.filter(w => ['BVR_AAM', 'IR_AAM', 'ASM'].includes(w.weapon_type)).map(wpn => {
                const qty = buyQty[wpn.id] || 1;
                const totalCost = wpn.cost_per_unit * qty;
                return (
                  <div key={wpn.id} className="card-dossier p-3">
                    <div className="flex items-center gap-3 mb-2">
                      <div className={`w-12 h-9 rounded flex items-center justify-center border text-[9px] font-bold shrink-0 ${typeBg[wpn.weapon_type] || ''}`}>
                        {typeLabel[wpn.weapon_type] || wpn.weapon_type}
                      </div>
                      <div className="flex-1 min-w-0">
                        <h3 className="text-sm font-semibold truncate" style={{ color: 'var(--color-text)' }}>{wpn.name}</h3>
                        <p className="font-data text-[10px]" style={{ color: 'var(--color-text-muted)' }}>{wpn.origin} · {wpn.max_range_km}km · Pk {(wpn.base_pk * 100).toFixed(0)}%</p>
                      </div>
                    </div>
                    <div className="flex items-center justify-between">
                      <div className="flex items-center gap-2">
                        <span className="font-data text-xs" style={{ color: 'var(--color-text-secondary)' }}>${wpn.cost_per_unit.toLocaleString()}/ea</span>
                        <div className="flex items-center gap-1">
                          <button onClick={() => setBuyQty(p => ({ ...p, [wpn.id]: Math.max(1, (p[wpn.id] || 1) - 1) }))}
                            className="w-7 h-7 rounded flex items-center justify-center" style={{ background: 'var(--color-surface-raised)', color: 'var(--color-text-secondary)' }}>
                            <Minus className="w-3 h-3" />
                          </button>
                          <span className="font-data w-6 text-center text-sm font-bold" style={{ color: 'var(--color-text)' }}>{qty}</span>
                          <button onClick={() => setBuyQty(p => ({ ...p, [wpn.id]: (p[wpn.id] || 1) + 1 }))}
                            className="w-7 h-7 rounded flex items-center justify-center" style={{ background: 'var(--color-surface-raised)', color: 'var(--color-text-secondary)' }}>
                            <Plus className="w-3 h-3" />
                          </button>
                        </div>
                        <span className="font-data text-xs font-bold" style={{ color: 'var(--color-text)' }}>= ${totalCost.toLocaleString()}</span>
                      </div>
                      <button onClick={() => handleBuyWeapons(wpn)} disabled={!!actionLoading || balance < totalCost} className="btn-primary text-xs py-2 px-3">
                        {actionLoading === `buy-wpn-${wpn.id}` ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : 'BUY'}
                      </button>
                    </div>
                  </div>
                );
              })}
            </ShopModal>
          )}
        </>
      )}

      {/* ═══ SHIPS TAB ═══ */}
      {tab === 'ships' && (
        <>
          <div className="flex items-center justify-between mb-3">
            <p className="label-section">{ownedShips.length} ships in fleet</p>
            <button onClick={() => setShowShipShop(true)} className="btn-secondary text-xs flex items-center gap-1.5 py-2 px-3">
              <ShoppingCart className="w-3.5 h-3.5" /> PROCURE
            </button>
          </div>

          {ownedShips.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-16 text-center">
              <Anchor className="w-12 h-12 mb-3" style={{ color: 'var(--color-text-muted)' }} />
              <p className="text-sm font-medium" style={{ color: 'var(--color-text-secondary)' }}>No ships in fleet</p>
            </div>
          ) : (
            <div className="space-y-2.5">
              {ownedShips.map(ship => {
                const catalog = shipCatalog.find(c => c.id === ship.ship_id);
                return (
                  <div key={ship.id} className="card-dossier-tab p-3">
                    <div className="flex gap-3">
                      {catalog?.image_url ? (
                        <img src={catalog.image_url} alt={ship.name} className="w-20 h-14 rounded object-cover shrink-0" />
                      ) : (
                        <div className="w-20 h-14 rounded flex items-center justify-center shrink-0" style={{ background: 'var(--color-surface-raised)' }}>
                          <Anchor className="w-6 h-6" style={{ color: 'var(--color-text-muted)' }} />
                        </div>
                      )}
                      <div className="flex-1 min-w-0">
                        <h3 className="text-sm font-semibold truncate" style={{ color: 'var(--color-text)' }}>{ship.name}</h3>
                        <p className="text-[11px] mt-0.5" style={{ color: 'var(--color-text-muted)' }}>{ship.origin}</p>
                        {catalog && (
                          <span className="text-[10px] font-display tracking-wider capitalize" style={{ color: 'var(--color-blue)' }}>
                            {catalog.ship_type} · {catalog.displacement_tons.toLocaleString()}t
                          </span>
                        )}
                        <div className="flex items-center gap-2 mt-1">
                          <div className="flex-1 gauge-bar" style={{ height: '4px', maxWidth: '80px' }}>
                            <div className={`gauge-fill ${conditionBg(ship.condition)}`} style={{ width: `${ship.condition}%` }} />
                          </div>
                          <span className={`font-data text-[11px] font-bold ${conditionColor(ship.condition)}`}>{ship.condition}%</span>
                        </div>
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          )}

          {showShipShop && (
            <ShopModal title="PROCURE VESSEL" subtitle={`Treasury: $${balance.toLocaleString()}`} onClose={() => setShowShipShop(false)}>
              {shipCatalog.map(ship => {
                const alreadyOwned = ownedShips.some(o => o.ship_id === ship.id);
                return (
                  <div key={ship.id} className="card-dossier overflow-hidden">
                    {ship.image_url && <img src={ship.image_url} alt={ship.name} className="w-full h-28 object-cover" />}
                    <div className="p-3">
                      <h3 className="text-sm font-semibold" style={{ color: 'var(--color-text)' }}>{ship.name}</h3>
                      <p className="text-[10px] mt-0.5" style={{ color: 'var(--color-text-muted)' }}>{ship.origin} · {ship.class_name} · {ship.ship_type}</p>
                      <div className="flex items-center justify-between mt-3">
                        <span className="font-data text-sm font-bold" style={{ color: 'var(--color-text)' }}>${ship.unlock_cost.toLocaleString()}</span>
                        <button onClick={() => handleBuyShip(ship)} disabled={!!actionLoading || balance < ship.unlock_cost || alreadyOwned}
                          className={alreadyOwned ? 'btn-secondary text-xs py-2 px-4 opacity-50' : 'btn-primary text-xs py-2 px-4'}>
                          {actionLoading === `buy-ship-${ship.id}` ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> :
                            alreadyOwned ? 'OWNED' : 'PROCURE'}
                        </button>
                      </div>
                    </div>
                  </div>
                );
              })}
            </ShopModal>
          )}
        </>
      )}
    </div>
  );
};


// ─── Shared Components ───

function ShopModal({ title, subtitle, onClose, children }: { title: string; subtitle: string; onClose: () => void; children: React.ReactNode }) {
  return (
    <>
      <div className="bottom-sheet-backdrop" onClick={onClose} />
      <div className="bottom-sheet p-0">
        <div className="bottom-sheet-handle" />
        <div className="flex items-center justify-between p-4" style={{ borderBottom: '1px solid var(--color-border)' }}>
          <div>
            <h2 className="font-display text-base tracking-wider" style={{ color: 'var(--color-amber)' }}>{title}</h2>
            <p className="font-data text-xs" style={{ color: 'var(--color-text-muted)' }}>{subtitle}</p>
          </div>
          <button onClick={onClose} className="w-8 h-8 rounded-lg flex items-center justify-center" style={{ background: 'var(--color-surface)', color: 'var(--color-text-muted)' }}>
            <X className="w-4 h-4" />
          </button>
        </div>
        <div className="overflow-y-auto p-4 space-y-3 scroll-list" style={{ maxHeight: '65vh' }}>
          {children}
        </div>
      </div>
    </>
  );
}

function StatDiff({ label, current, next, unit = '' }: { label: string; current: number; next: number; unit?: string }) {
  const diff = next - current;
  if (Math.abs(diff) < 0.001) return null;
  return (
    <div className="mt-1">
      <span className={diff > 0 ? 'stat-up' : 'stat-down'}>
        {diff > 0 ? '+' : ''}{typeof current === 'number' && current % 1 !== 0 ? diff.toFixed(2) : diff}{unit} {label}
      </span>
    </div>
  );
}
