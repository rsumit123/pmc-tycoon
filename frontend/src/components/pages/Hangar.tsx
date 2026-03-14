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
  Radar,
  Shield,
  Zap,
  Wrench,
  Trash2,
  ChevronDown,
  ChevronUp,
  Package,
} from 'lucide-react';
import { apiService } from '../../services/api';

// ─── Types ───

interface AircraftCatalog {
  id: number;
  name: string;
  origin: string;
  role: string;
  generation: string;
  image_url: string | null;
  radar_range_km: number;
  rcs_m2: number;
  ecm_rating: number;
  hardpoints: number;
  max_payload_kg: number;
  thrust_to_weight_clean: number;
  max_speed_mach: number;
  combat_radius_km: number;
  unlock_cost: number;
  maintenance_cost: number;
}

interface OwnedAircraftData {
  id: number;
  aircraft_id: number;
  name: string;
  origin: string;
  role: string;
  condition: number;
  unlock_cost: number;
  maintenance_cost: number;
}

interface ShipCatalog {
  id: number;
  name: string;
  class_name: string;
  origin: string;
  ship_type: string;
  image_url: string | null;
  displacement_tons: number;
  max_speed_knots: number;
  radar_range_km: number;
  ecm_rating: number;
  unlock_cost: number;
  maintenance_cost: number;
}

interface OwnedShipData {
  id: number;
  ship_id: number;
  name: string;
  origin: string;
  condition: number;
  unlock_cost: number;
  maintenance_cost: number;
}

interface WeaponCatalog {
  id: number;
  name: string;
  origin: string;
  weapon_type: string;
  image_url: string | null;
  weight_kg: number;
  max_range_km: number;
  base_pk: number;
  guidance: string;
  cost_per_unit: number;
}

interface OwnedWeaponData {
  id: number;
  weapon_id: number;
  name: string;
  origin: string;
  weapon_type: string;
  image_url: string | null;
  quantity: number;
  cost_per_unit: number;
  weight_kg: number;
  max_range_km: number;
  base_pk: number;
  guidance: string;
}

type Tab = 'aircraft' | 'weapons' | 'ships';

const typeLabel: Record<string, string> = {
  BVR_AAM: 'BVR',
  IR_AAM: 'WVR',
  ASM: 'Anti-Ship',
  SAM: 'SAM',
  CIWS: 'CIWS',
  GUN: 'Gun',
};

const typeBg: Record<string, string> = {
  BVR_AAM: 'bg-blue-500/20 text-blue-400 border-blue-500/30',
  IR_AAM: 'bg-red-500/20 text-red-400 border-red-500/30',
  ASM: 'bg-amber-500/20 text-amber-400 border-amber-500/30',
  SAM: 'bg-emerald-500/20 text-emerald-400 border-emerald-500/30',
  CIWS: 'bg-gray-500/20 text-gray-400 border-gray-500/30',
  GUN: 'bg-gray-500/20 text-gray-400 border-gray-500/30',
};

const roleLabel: Record<string, string> = {
  multirole: 'Multirole',
  air_superiority: 'Air Superiority',
  interceptor: 'Interceptor',
  strike: 'Strike',
};

const conditionColor = (c: number) => {
  if (c >= 70) return 'text-emerald-400';
  if (c >= 40) return 'text-amber-400';
  return 'text-red-400';
};

export const Hangar = () => {
  const [tab, setTab] = useState<Tab>('aircraft');
  const [loading, setLoading] = useState(true);
  const [balance, setBalance] = useState(0);
  const [actionLoading, setActionLoading] = useState<string | null>(null);

  // Aircraft state
  const [aircraftCatalog, setAircraftCatalog] = useState<AircraftCatalog[]>([]);
  const [ownedAircraft, setOwnedAircraft] = useState<OwnedAircraftData[]>([]);
  const [showAircraftShop, setShowAircraftShop] = useState(false);

  // Ships state
  const [shipCatalog, setShipCatalog] = useState<ShipCatalog[]>([]);
  const [ownedShips, setOwnedShips] = useState<OwnedShipData[]>([]);
  const [showShipShop, setShowShipShop] = useState(false);

  // Weapons state
  const [weaponCatalog, setWeaponCatalog] = useState<WeaponCatalog[]>([]);
  const [ownedWeapons, setOwnedWeapons] = useState<OwnedWeaponData[]>([]);
  const [showWeaponShop, setShowWeaponShop] = useState(false);
  const [buyQty, setBuyQty] = useState<Record<number, number>>({});

  const [expandedId, setExpandedId] = useState<string | null>(null);

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
    } catch {
      // keep state
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { fetchData(); }, [fetchData]);

  // ─── Aircraft actions ───

  const handleBuyAircraft = async (ac: AircraftCatalog) => {
    if (balance < ac.unlock_cost) return;
    setActionLoading(`buy-ac-${ac.id}`);
    try {
      const res = await apiService.purchaseAircraft(ac.id);
      setBalance(res.data.new_balance);
      await fetchData();
      setShowAircraftShop(false);
    } catch (err) {
      console.error('Purchase failed:', err);
    } finally {
      setActionLoading(null);
    }
  };

  const handleSellAircraft = async (ownedId: number) => {
    setActionLoading(`sell-ac-${ownedId}`);
    try {
      await apiService.sellAircraft(ownedId);
      await fetchData();
      setExpandedId(null);
    } catch (err) {
      console.error('Sell failed:', err);
    } finally {
      setActionLoading(null);
    }
  };

  // ─── Ship actions ───

  const handleBuyShip = async (ship: ShipCatalog) => {
    if (balance < ship.unlock_cost) return;
    setActionLoading(`buy-ship-${ship.id}`);
    try {
      const res = await apiService.purchaseShip(ship.id);
      setBalance(res.data.new_balance);
      await fetchData();
      setShowShipShop(false);
    } catch (err) {
      console.error('Purchase failed:', err);
    } finally {
      setActionLoading(null);
    }
  };

  // ─── Weapon actions ───

  const handleBuyWeapons = async (wpn: WeaponCatalog) => {
    const qty = buyQty[wpn.id] || 1;
    const totalCost = wpn.cost_per_unit * qty;
    if (balance < totalCost) return;
    setActionLoading(`buy-wpn-${wpn.id}`);
    try {
      const res = await apiService.purchaseWeapons(wpn.id, qty);
      setBalance(res.data.new_balance);
      setBuyQty((prev) => ({ ...prev, [wpn.id]: 1 }));
      await fetchData();
    } catch (err) {
      console.error('Purchase failed:', err);
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
      {/* Header */}
      <div className="flex items-center justify-between mb-4">
        <div>
          <h1 className="text-xl font-bold text-white lg:text-2xl">Hangar</h1>
          <p className="text-sm text-gray-500 mt-0.5">
            Balance: <span className="text-emerald-400 font-semibold">${balance.toLocaleString()}</span>
          </p>
        </div>
      </div>

      {/* Tabs */}
      <div className="flex gap-1 bg-gray-900 rounded-xl p-1 mb-4">
        {([
          { key: 'aircraft' as Tab, label: 'Aircraft', icon: Plane, count: ownedAircraft.length },
          { key: 'weapons' as Tab, label: 'Arsenal', icon: Crosshair, count: ownedWeapons.reduce((s, w) => s + w.quantity, 0) },
          { key: 'ships' as Tab, label: 'Fleet', icon: Anchor, count: ownedShips.length },
        ]).map((t) => (
          <button
            key={t.key}
            onClick={() => setTab(t.key)}
            className={`flex-1 flex items-center justify-center gap-1.5 py-2 rounded-lg text-xs font-semibold transition-colors ${
              tab === t.key
                ? 'bg-emerald-500/20 text-emerald-400'
                : 'text-gray-500 hover:text-gray-300'
            }`}
          >
            <t.icon className="w-3.5 h-3.5" />
            {t.label}
            <span className={`text-[10px] px-1.5 py-0.5 rounded-full ${
              tab === t.key ? 'bg-emerald-500/30' : 'bg-gray-800'
            }`}>{t.count}</span>
          </button>
        ))}
      </div>

      {/* ═══ AIRCRAFT TAB ═══ */}
      {tab === 'aircraft' && (
        <>
          <div className="flex items-center justify-between mb-3">
            <p className="text-xs text-gray-500">{ownedAircraft.length} aircraft in fleet</p>
            <button
              onClick={() => setShowAircraftShop(true)}
              className="flex items-center gap-1.5 text-xs font-semibold text-emerald-400 bg-emerald-500/15 px-3 py-1.5 rounded-lg active:bg-emerald-500/25"
            >
              <ShoppingCart className="w-3.5 h-3.5" />
              Buy Aircraft
            </button>
          </div>

          {ownedAircraft.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-16 text-center">
              <Plane className="w-12 h-12 text-gray-700 mb-3" />
              <p className="text-gray-400 font-medium">No aircraft</p>
              <p className="text-sm text-gray-600 mt-1">Purchase aircraft to deploy on missions</p>
            </div>
          ) : (
            <div className="space-y-3">
              {ownedAircraft.map((ac) => {
                const catalog = aircraftCatalog.find((c) => c.id === ac.aircraft_id);
                const isExpanded = expandedId === `ac-${ac.id}`;
                return (
                  <div key={ac.id} className="bg-gray-900 rounded-2xl border border-gray-800/60 overflow-hidden">
                    <button
                      onClick={() => setExpandedId(isExpanded ? null : `ac-${ac.id}`)}
                      className="w-full text-left"
                    >
                      <div className="flex gap-3 p-3">
                        {catalog?.image_url ? (
                          <img src={catalog.image_url} alt={ac.name} className="w-20 h-14 rounded-lg object-cover shrink-0" />
                        ) : (
                          <div className="w-20 h-14 rounded-lg bg-gray-800 flex items-center justify-center shrink-0">
                            <Plane className="w-6 h-6 text-gray-600" />
                          </div>
                        )}
                        <div className="flex-1 min-w-0">
                          <h3 className="text-sm font-semibold text-white truncate">{ac.name}</h3>
                          <div className="flex items-center gap-2 mt-0.5">
                            <span className="text-[10px] text-gray-500">{ac.origin}</span>
                            <span className="text-gray-700">·</span>
                            <span className={`text-[10px] font-semibold ${conditionColor(ac.condition)}`}>
                              {ac.condition}%
                            </span>
                          </div>
                          {catalog && (
                            <div className="flex items-center gap-2 mt-1">
                              <span className="text-[9px] text-emerald-400/60 bg-emerald-500/10 px-1.5 py-0.5 rounded">
                                Gen {catalog.generation}
                              </span>
                              <span className="text-[9px] text-gray-500">
                                {roleLabel[catalog.role] || catalog.role}
                              </span>
                            </div>
                          )}
                        </div>
                        <div className="shrink-0 flex items-center">
                          {isExpanded ? <ChevronUp className="w-4 h-4 text-gray-600" /> : <ChevronDown className="w-4 h-4 text-gray-600" />}
                        </div>
                      </div>
                    </button>

                    {isExpanded && catalog && (
                      <div className="px-3 pb-3 border-t border-gray-800/60 pt-3 space-y-3">
                        <div className="grid grid-cols-4 gap-2">
                          {[
                            { icon: Radar, label: 'RADAR', value: `${catalog.radar_range_km}km`, color: 'text-emerald-400' },
                            { icon: Shield, label: 'RCS', value: `${catalog.rcs_m2}m²`, color: 'text-cyan-400' },
                            { icon: Zap, label: 'ECM', value: `${catalog.ecm_rating}`, color: 'text-amber-400' },
                            { icon: Crosshair, label: 'HP', value: `${catalog.hardpoints}`, color: 'text-violet-400' },
                          ].map((s) => (
                            <div key={s.label} className="bg-gray-800/50 rounded-lg p-2 text-center">
                              <s.icon className={`w-3.5 h-3.5 mx-auto ${s.color}`} />
                              <p className="text-[8px] text-gray-500 mt-0.5">{s.label}</p>
                              <p className={`text-xs font-bold ${s.color}`}>{s.value}</p>
                            </div>
                          ))}
                        </div>
                        <div className="flex gap-2">
                          <div className="flex-1 bg-gray-800/50 rounded-lg p-2">
                            <p className="text-[9px] text-gray-500">MAINT</p>
                            <p className="text-xs font-semibold text-white">${catalog.maintenance_cost.toLocaleString()}/day</p>
                          </div>
                          <div className="flex-1 bg-gray-800/50 rounded-lg p-2">
                            <p className="text-[9px] text-gray-500">TWR</p>
                            <p className="text-xs font-semibold text-white">{catalog.thrust_to_weight_clean}</p>
                          </div>
                          <div className="flex-1 bg-gray-800/50 rounded-lg p-2">
                            <p className="text-[9px] text-gray-500">SPEED</p>
                            <p className="text-xs font-semibold text-white">M{catalog.max_speed_mach}</p>
                          </div>
                        </div>
                        <div className="flex gap-2">
                          <button
                            disabled
                            className="flex-1 flex items-center justify-center gap-1.5 bg-emerald-500/15 text-emerald-400 font-medium text-xs py-2.5 rounded-xl opacity-40"
                          >
                            <Wrench className="w-3.5 h-3.5" />
                            Repair
                          </button>
                          <button
                            onClick={() => handleSellAircraft(ac.id)}
                            disabled={actionLoading === `sell-ac-${ac.id}`}
                            className="flex items-center justify-center gap-1.5 bg-gray-800 text-gray-400 font-medium text-xs py-2.5 px-4 rounded-xl active:bg-gray-700"
                          >
                            {actionLoading === `sell-ac-${ac.id}` ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Trash2 className="w-3.5 h-3.5" />}
                            Sell
                          </button>
                        </div>
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          )}

          {/* Aircraft Shop Modal */}
          {showAircraftShop && (
            <ShopModal title="Purchase Aircraft" subtitle={`Balance: $${balance.toLocaleString()}`} onClose={() => setShowAircraftShop(false)}>
              {aircraftCatalog.map((ac) => {
                const alreadyOwned = ownedAircraft.some((o) => o.aircraft_id === ac.id);
                return (
                  <div key={ac.id} className="bg-gray-800/50 rounded-xl overflow-hidden">
                    {ac.image_url && (
                      <img src={ac.image_url} alt={ac.name} className="w-full h-28 object-cover" />
                    )}
                    <div className="p-3">
                      <div className="flex items-center justify-between mb-2">
                        <div>
                          <h3 className="text-sm font-semibold text-white">{ac.name}</h3>
                          <p className="text-[10px] text-gray-500">{ac.origin} · Gen {ac.generation} · {roleLabel[ac.role] || ac.role}</p>
                        </div>
                      </div>
                      <div className="grid grid-cols-4 gap-1.5 mb-3 text-center">
                        <div className="bg-gray-900/60 rounded p-1">
                          <p className="text-[8px] text-gray-500">RADAR</p>
                          <p className="text-[10px] font-bold text-emerald-400">{ac.radar_range_km}km</p>
                        </div>
                        <div className="bg-gray-900/60 rounded p-1">
                          <p className="text-[8px] text-gray-500">RCS</p>
                          <p className="text-[10px] font-bold text-cyan-400">{ac.rcs_m2}m²</p>
                        </div>
                        <div className="bg-gray-900/60 rounded p-1">
                          <p className="text-[8px] text-gray-500">ECM</p>
                          <p className="text-[10px] font-bold text-amber-400">{ac.ecm_rating}</p>
                        </div>
                        <div className="bg-gray-900/60 rounded p-1">
                          <p className="text-[8px] text-gray-500">HP</p>
                          <p className="text-[10px] font-bold text-violet-400">{ac.hardpoints}</p>
                        </div>
                      </div>
                      <div className="flex items-center justify-between">
                        <div>
                          <span className="text-xs text-white font-semibold">${ac.unlock_cost.toLocaleString()}</span>
                          <span className="text-[10px] text-gray-500 ml-1">· ${ac.maintenance_cost.toLocaleString()}/day</span>
                        </div>
                        <button
                          onClick={() => handleBuyAircraft(ac)}
                          disabled={actionLoading === `buy-ac-${ac.id}` || balance < ac.unlock_cost || alreadyOwned}
                          className={`flex items-center gap-1.5 font-semibold text-xs py-2 px-4 rounded-lg transition-colors ${
                            alreadyOwned
                              ? 'bg-gray-700 text-gray-500 cursor-not-allowed'
                              : balance >= ac.unlock_cost
                              ? 'bg-emerald-500 text-white active:bg-emerald-600 disabled:opacity-60'
                              : 'bg-gray-700 text-gray-500 cursor-not-allowed'
                          }`}
                        >
                          {actionLoading === `buy-ac-${ac.id}` ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <ShoppingCart className="w-3.5 h-3.5" />}
                          {alreadyOwned ? 'Owned' : balance >= ac.unlock_cost ? 'Buy' : "Can't afford"}
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
            <p className="text-xs text-gray-500">{ownedWeapons.reduce((s, w) => s + w.quantity, 0)} weapons in stock</p>
            <button
              onClick={() => setShowWeaponShop(true)}
              className="flex items-center gap-1.5 text-xs font-semibold text-emerald-400 bg-emerald-500/15 px-3 py-1.5 rounded-lg active:bg-emerald-500/25"
            >
              <ShoppingCart className="w-3.5 h-3.5" />
              Buy Weapons
            </button>
          </div>

          {ownedWeapons.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-16 text-center">
              <Crosshair className="w-12 h-12 text-gray-700 mb-3" />
              <p className="text-gray-400 font-medium">No weapons in stock</p>
              <p className="text-sm text-gray-600 mt-1">Purchase missiles and ordnance for battle</p>
            </div>
          ) : (
            <div className="space-y-2">
              {ownedWeapons.map((w) => (
                <div key={w.id} className="bg-gray-900 rounded-xl border border-gray-800/60 p-3">
                  <div className="flex items-center gap-3">
                    {w.image_url ? (
                      <img src={w.image_url} alt={w.name} className="w-14 h-10 rounded-lg object-cover shrink-0" />
                    ) : (
                      <div className={`w-14 h-10 rounded-lg flex items-center justify-center border text-[10px] font-bold shrink-0 ${typeBg[w.weapon_type] || 'bg-gray-800 text-gray-400 border-gray-700'}`}>
                        {typeLabel[w.weapon_type] || w.weapon_type}
                      </div>
                    )}
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-semibold text-white truncate">{w.name}</p>
                      <div className="flex items-center gap-1.5 mt-0.5">
                        <span className={`text-[9px] font-bold px-1.5 py-0.5 rounded border ${typeBg[w.weapon_type] || 'bg-gray-800 text-gray-400 border-gray-700'}`}>
                          {typeLabel[w.weapon_type] || w.weapon_type}
                        </span>
                        <span className="text-[10px] text-gray-500">{w.max_range_km}km</span>
                        <span className="text-gray-700">·</span>
                        <span className="text-[10px] text-gray-500">Pk {(w.base_pk * 100).toFixed(0)}%</span>
                      </div>
                    </div>
                    <div className="shrink-0 text-right">
                      <div className="flex items-center gap-1">
                        <Package className="w-3 h-3 text-emerald-400" />
                        <span className="text-lg font-bold text-emerald-400">{w.quantity}</span>
                      </div>
                      <p className="text-[9px] text-gray-500">${w.cost_per_unit.toLocaleString()} ea</p>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          )}

          {/* Weapon Shop Modal */}
          {showWeaponShop && (
            <ShopModal title="Purchase Weapons" subtitle={`Balance: $${balance.toLocaleString()}`} onClose={() => setShowWeaponShop(false)}>
              {weaponCatalog
                .filter((w) => ['BVR_AAM', 'IR_AAM', 'ASM'].includes(w.weapon_type))
                .map((wpn) => {
                  const qty = buyQty[wpn.id] || 1;
                  const totalCost = wpn.cost_per_unit * qty;
                  const owned = ownedWeapons.find((o) => o.weapon_id === wpn.id);
                  return (
                    <div key={wpn.id} className="bg-gray-800/50 rounded-xl p-3">
                      <div className="flex items-center gap-3 mb-2">
                        {wpn.image_url ? (
                          <img src={wpn.image_url} alt={wpn.name} className="w-14 h-10 rounded-lg object-cover shrink-0" />
                        ) : (
                          <div className={`w-14 h-10 rounded-lg flex items-center justify-center border text-[10px] font-bold shrink-0 ${typeBg[wpn.weapon_type] || 'bg-gray-800 text-gray-400 border-gray-700'}`}>
                            {typeLabel[wpn.weapon_type] || wpn.weapon_type}
                          </div>
                        )}
                        <div className="flex-1 min-w-0">
                          <h3 className="text-sm font-semibold text-white truncate">{wpn.name}</h3>
                          <div className="flex items-center gap-1.5 mt-0.5">
                            <span className={`text-[9px] font-bold px-1.5 py-0.5 rounded border ${typeBg[wpn.weapon_type] || 'bg-gray-800 text-gray-400 border-gray-700'}`}>
                              {typeLabel[wpn.weapon_type] || wpn.weapon_type}
                            </span>
                            <span className="text-[10px] text-gray-500">{wpn.origin}</span>
                          </div>
                        </div>
                        {owned && (
                          <div className="shrink-0 text-right">
                            <p className="text-[9px] text-gray-500">In stock</p>
                            <p className="text-sm font-bold text-emerald-400">{owned.quantity}</p>
                          </div>
                        )}
                      </div>
                      <div className="grid grid-cols-3 gap-1.5 mb-3 text-center">
                        <div className="bg-gray-900/60 rounded p-1">
                          <p className="text-[8px] text-gray-500">RANGE</p>
                          <p className="text-[10px] font-bold text-white">{wpn.max_range_km}km</p>
                        </div>
                        <div className="bg-gray-900/60 rounded p-1">
                          <p className="text-[8px] text-gray-500">Pk</p>
                          <p className="text-[10px] font-bold text-white">{(wpn.base_pk * 100).toFixed(0)}%</p>
                        </div>
                        <div className="bg-gray-900/60 rounded p-1">
                          <p className="text-[8px] text-gray-500">WEIGHT</p>
                          <p className="text-[10px] font-bold text-white">{wpn.weight_kg}kg</p>
                        </div>
                      </div>
                      <div className="flex items-center justify-between">
                        <div className="flex items-center gap-2">
                          <span className="text-xs text-gray-400">${wpn.cost_per_unit.toLocaleString()}/ea</span>
                          <div className="flex items-center gap-1">
                            <button
                              onClick={() => setBuyQty((prev) => ({ ...prev, [wpn.id]: Math.max(1, (prev[wpn.id] || 1) - 1) }))}
                              className="w-6 h-6 rounded bg-gray-700 flex items-center justify-center text-gray-400 active:bg-gray-600"
                            >
                              <Minus className="w-3 h-3" />
                            </button>
                            <span className="w-6 text-center text-sm font-bold text-white">{qty}</span>
                            <button
                              onClick={() => setBuyQty((prev) => ({ ...prev, [wpn.id]: (prev[wpn.id] || 1) + 1 }))}
                              className="w-6 h-6 rounded bg-gray-700 flex items-center justify-center text-gray-400 active:bg-gray-600"
                            >
                              <Plus className="w-3 h-3" />
                            </button>
                          </div>
                          <span className="text-xs font-semibold text-white">= ${totalCost.toLocaleString()}</span>
                        </div>
                        <button
                          onClick={() => handleBuyWeapons(wpn)}
                          disabled={actionLoading === `buy-wpn-${wpn.id}` || balance < totalCost}
                          className={`flex items-center gap-1.5 font-semibold text-xs py-2 px-3 rounded-lg transition-colors ${
                            balance >= totalCost
                              ? 'bg-emerald-500 text-white active:bg-emerald-600 disabled:opacity-60'
                              : 'bg-gray-700 text-gray-500 cursor-not-allowed'
                          }`}
                        >
                          {actionLoading === `buy-wpn-${wpn.id}` ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <ShoppingCart className="w-3.5 h-3.5" />}
                          Buy
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
            <p className="text-xs text-gray-500">{ownedShips.length} ships in fleet</p>
            <button
              onClick={() => setShowShipShop(true)}
              className="flex items-center gap-1.5 text-xs font-semibold text-emerald-400 bg-emerald-500/15 px-3 py-1.5 rounded-lg active:bg-emerald-500/25"
            >
              <ShoppingCart className="w-3.5 h-3.5" />
              Buy Ship
            </button>
          </div>

          {ownedShips.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-16 text-center">
              <Anchor className="w-12 h-12 text-gray-700 mb-3" />
              <p className="text-gray-400 font-medium">No ships</p>
              <p className="text-sm text-gray-600 mt-1">Purchase warships for naval operations</p>
            </div>
          ) : (
            <div className="space-y-3">
              {ownedShips.map((ship) => {
                const catalog = shipCatalog.find((c) => c.id === ship.ship_id);
                return (
                  <div key={ship.id} className="bg-gray-900 rounded-2xl border border-gray-800/60 overflow-hidden">
                    <div className="flex gap-3 p-3">
                      {catalog?.image_url ? (
                        <img src={catalog.image_url} alt={ship.name} className="w-20 h-14 rounded-lg object-cover shrink-0" />
                      ) : (
                        <div className="w-20 h-14 rounded-lg bg-gray-800 flex items-center justify-center shrink-0">
                          <Anchor className="w-6 h-6 text-gray-600" />
                        </div>
                      )}
                      <div className="flex-1 min-w-0">
                        <h3 className="text-sm font-semibold text-white truncate">{ship.name}</h3>
                        <div className="flex items-center gap-2 mt-0.5">
                          <span className="text-[10px] text-gray-500">{ship.origin}</span>
                          <span className="text-gray-700">·</span>
                          <span className={`text-[10px] font-semibold ${conditionColor(ship.condition)}`}>
                            {ship.condition}%
                          </span>
                        </div>
                        {catalog && (
                          <div className="flex items-center gap-2 mt-1">
                            <span className="text-[9px] text-blue-400/60 bg-blue-500/10 px-1.5 py-0.5 rounded capitalize">
                              {catalog.ship_type}
                            </span>
                            <span className="text-[9px] text-gray-500">{catalog.displacement_tons.toLocaleString()}t</span>
                          </div>
                        )}
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          )}

          {/* Ship Shop Modal */}
          {showShipShop && (
            <ShopModal title="Purchase Ship" subtitle={`Balance: $${balance.toLocaleString()}`} onClose={() => setShowShipShop(false)}>
              {shipCatalog.map((ship) => {
                const alreadyOwned = ownedShips.some((o) => o.ship_id === ship.id);
                return (
                  <div key={ship.id} className="bg-gray-800/50 rounded-xl overflow-hidden">
                    {ship.image_url && (
                      <img src={ship.image_url} alt={ship.name} className="w-full h-28 object-cover" />
                    )}
                    <div className="p-3">
                      <div className="flex items-center justify-between mb-2">
                        <div>
                          <h3 className="text-sm font-semibold text-white">{ship.name}</h3>
                          <p className="text-[10px] text-gray-500">{ship.origin} · {ship.class_name} class · {ship.ship_type}</p>
                        </div>
                      </div>
                      <div className="grid grid-cols-3 gap-1.5 mb-3 text-center">
                        <div className="bg-gray-900/60 rounded p-1">
                          <p className="text-[8px] text-gray-500">DISP</p>
                          <p className="text-[10px] font-bold text-white">{ship.displacement_tons.toLocaleString()}t</p>
                        </div>
                        <div className="bg-gray-900/60 rounded p-1">
                          <p className="text-[8px] text-gray-500">RADAR</p>
                          <p className="text-[10px] font-bold text-emerald-400">{ship.radar_range_km}km</p>
                        </div>
                        <div className="bg-gray-900/60 rounded p-1">
                          <p className="text-[8px] text-gray-500">SPEED</p>
                          <p className="text-[10px] font-bold text-white">{ship.max_speed_knots}kn</p>
                        </div>
                      </div>
                      <div className="flex items-center justify-between">
                        <div>
                          <span className="text-xs text-white font-semibold">${ship.unlock_cost.toLocaleString()}</span>
                          <span className="text-[10px] text-gray-500 ml-1">· ${ship.maintenance_cost.toLocaleString()}/day</span>
                        </div>
                        <button
                          onClick={() => handleBuyShip(ship)}
                          disabled={actionLoading === `buy-ship-${ship.id}` || balance < ship.unlock_cost || alreadyOwned}
                          className={`flex items-center gap-1.5 font-semibold text-xs py-2 px-4 rounded-lg transition-colors ${
                            alreadyOwned
                              ? 'bg-gray-700 text-gray-500 cursor-not-allowed'
                              : balance >= ship.unlock_cost
                              ? 'bg-emerald-500 text-white active:bg-emerald-600 disabled:opacity-60'
                              : 'bg-gray-700 text-gray-500 cursor-not-allowed'
                          }`}
                        >
                          {actionLoading === `buy-ship-${ship.id}` ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <ShoppingCart className="w-3.5 h-3.5" />}
                          {alreadyOwned ? 'Owned' : balance >= ship.unlock_cost ? 'Buy' : "Can't afford"}
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

// ─── Shared Shop Modal ───

function ShopModal({ title, subtitle, onClose, children }: { title: string; subtitle: string; onClose: () => void; children: React.ReactNode }) {
  return (
    <div className="fixed inset-0 bg-black/70 backdrop-blur-sm z-[60] flex items-end sm:items-center justify-center" onClick={onClose}>
      <div
        className="bg-gray-900 rounded-t-2xl sm:rounded-2xl border-t sm:border border-gray-800 w-full sm:max-w-md max-h-[85vh] overflow-hidden flex flex-col"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between p-4 border-b border-gray-800">
          <div>
            <h2 className="text-lg font-bold text-white">{title}</h2>
            <p className="text-xs text-gray-500">{subtitle}</p>
          </div>
          <button onClick={onClose} className="w-8 h-8 rounded-lg bg-gray-800 flex items-center justify-center text-gray-400">
            <X className="w-4 h-4" />
          </button>
        </div>
        <div className="overflow-y-auto p-4 space-y-3">
          {children}
        </div>
      </div>
    </div>
  );
}
