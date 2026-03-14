import { useState } from 'react';
import {
  Crosshair,
  Radar,
  Minus,
  Plus,
  ChevronRight,
  Loader2,
  Fuel,
  Shield,
  Zap,
} from 'lucide-react';
import { apiService } from '../../services/api';
import './animations.css';

interface WeaponOption {
  id: number;
  name: string;
  type: string;
  image_url: string | null;
  weight_kg: number;
  max_range_km: number;
  no_escape_range_km: number;
  base_pk: number;
  guidance: string;
  cost_per_unit: number;
}

interface LoadoutScreenProps {
  battleId: number;
  aircraft: {
    id: number;
    name: string;
    image_url: string | null;
    max_payload_kg: number;
    hardpoints: number;
    radar_type: string;
    radar_range_km: number;
    rcs_m2: number;
    ecm_suite: string;
    ecm_rating: number;
    internal_fuel_kg: number;
    thrust_to_weight_clean: number;
  };
  enemy: { id: number; name: string; image_url: string | null; origin: string; generation: string };
  weapons: WeaponOption[];
  onReady: (stateData: any) => void;
}

const typeLabel: Record<string, string> = {
  BVR_AAM: 'BVR',
  IR_AAM: 'WVR',
  ASM: 'A/S',
};

const typeBg: Record<string, string> = {
  BVR_AAM: 'bg-blue-500/20 text-blue-400 border-blue-500/30',
  IR_AAM: 'bg-red-500/20 text-red-400 border-red-500/30',
  ASM: 'bg-amber-500/20 text-amber-400 border-amber-500/30',
};

export const LoadoutScreen = ({ battleId, aircraft, enemy, weapons, onReady }: LoadoutScreenProps) => {
  const [selected, setSelected] = useState<Record<number, number>>({});
  const [fuelPct, setFuelPct] = useState(85);
  const [submitting, setSubmitting] = useState(false);

  const totalWeaponWeight = Object.entries(selected).reduce((sum, [id, qty]) => {
    const w = weapons.find((w) => w.id === Number(id));
    return sum + (w ? w.weight_kg * qty : 0);
  }, 0);
  const fuelWeight = Math.round((aircraft.internal_fuel_kg * fuelPct) / 100);
  const totalWeight = totalWeaponWeight + fuelWeight;
  const totalHardpoints = Object.values(selected).reduce((sum, qty) => sum + qty, 0);
  const overWeight = totalWeight > aircraft.max_payload_kg;
  const overHardpoints = totalHardpoints > aircraft.hardpoints;
  const hasWeapons = totalHardpoints > 0;

  // TWR impact
  const loadedWeight = aircraft.max_payload_kg > 0 ? totalWeight / aircraft.max_payload_kg : 0;
  const twrModifier = Math.max(0.6, 1.0 - loadedWeight * 0.3);

  const adjust = (weaponId: number, delta: number) => {
    setSelected((prev) => {
      const current = prev[weaponId] || 0;
      const next = Math.max(0, current + delta);
      if (next === 0) {
        const { [weaponId]: _, ...rest } = prev;
        return rest;
      }
      return { ...prev, [weaponId]: next };
    });
  };

  const handleSubmit = async () => {
    if (!hasWeapons || overWeight || overHardpoints) return;
    setSubmitting(true);
    try {
      const weaponsList = Object.entries(selected).map(([id, qty]) => ({
        weapon_id: Number(id),
        quantity: qty,
      }));
      const res = await apiService.submitLoadout(battleId, { weapons: weaponsList });
      onReady(res.data);
    } catch (err) {
      console.error('Loadout submit failed:', err);
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="min-h-[100dvh] bg-gray-950 flex flex-col">
      {/* Aircraft hero header with photo */}
      <div className="relative h-48 overflow-hidden">
        {aircraft.image_url ? (
          <img
            src={aircraft.image_url}
            alt={aircraft.name}
            className="w-full h-full object-cover"
          />
        ) : (
          <div className="w-full h-full bg-gray-900" />
        )}
        <div className="absolute inset-0 bg-gradient-to-t from-gray-950 via-gray-950/60 to-transparent" />
        <div className="absolute bottom-0 left-0 right-0 px-4 pb-3">
          <p className="text-[10px] text-emerald-400 uppercase tracking-widest font-bold hud-text hud-glow">Mission Loadout</p>
          <h1 className="text-xl font-bold text-white">{aircraft.name}</h1>
          <p className="text-xs text-gray-400">
            vs <span className="text-red-400 font-semibold">{enemy.name}</span>
            <span className="text-gray-600 ml-1">({enemy.origin})</span>
          </p>
        </div>
      </div>

      {/* HUD stats strip */}
      <div className="flex gap-1.5 px-3 py-2.5 overflow-x-auto border-b border-emerald-500/10 bg-gray-950">
        {[
          { icon: Radar, label: 'RADAR', value: `${aircraft.radar_range_km}km`, color: 'text-emerald-400' },
          { icon: Shield, label: 'RCS', value: `${aircraft.rcs_m2}m²`, color: 'text-cyan-400' },
          { icon: Zap, label: 'ECM', value: `${aircraft.ecm_rating}`, color: 'text-amber-400' },
          { icon: Crosshair, label: 'HP', value: `${totalHardpoints}/${aircraft.hardpoints}`, color: 'text-violet-400' },
        ].map((s) => (
          <div key={s.label} className="flex items-center gap-1.5 bg-gray-900/80 hud-border rounded-lg px-2.5 py-1.5 shrink-0">
            <s.icon className={`w-3 h-3 ${s.color}`} />
            <span className="text-[9px] text-gray-500 hud-text">{s.label}</span>
            <span className={`text-xs font-bold hud-text ${s.color}`}>{s.value}</span>
          </div>
        ))}
      </div>

      {/* Weapon list */}
      <div className="flex-1 overflow-y-auto px-3 py-3 space-y-2">
        <p className="text-[9px] text-emerald-400/60 uppercase tracking-widest font-bold hud-text mb-1">Select Armament</p>
        {weapons.map((w) => {
          const qty = selected[w.id] || 0;
          return (
            <div
              key={w.id}
              className={`rounded-xl border p-3 transition-all ${
                qty > 0
                  ? 'bg-emerald-500/5 hud-border'
                  : 'bg-gray-900/60 border-gray-800/40'
              }`}
            >
              <div className="flex items-center gap-3">
                {/* Weapon image or type badge */}
                {w.image_url ? (
                  <img src={w.image_url} alt={w.name} className="w-12 h-12 rounded-lg object-cover shrink-0" />
                ) : (
                  <div className={`w-12 h-12 rounded-lg flex items-center justify-center border text-xs font-bold hud-text shrink-0 ${typeBg[w.type] || 'bg-gray-800 text-gray-400 border-gray-700'}`}>
                    {typeLabel[w.type] || w.type}
                  </div>
                )}

                {/* Info */}
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-semibold text-white truncate">{w.name}</p>
                  <div className="flex items-center gap-1.5 mt-0.5 flex-wrap">
                    <span className={`text-[9px] font-bold px-1.5 py-0.5 rounded border ${typeBg[w.type] || 'bg-gray-800 text-gray-400 border-gray-700'}`}>
                      {typeLabel[w.type] || w.type}
                    </span>
                    <span className="text-[10px] text-gray-500">{w.max_range_km}km</span>
                    <span className="text-gray-700">·</span>
                    <span className="text-[10px] text-gray-500">Pk {(w.base_pk * 100).toFixed(0)}%</span>
                    <span className="text-gray-700">·</span>
                    <span className="text-[10px] text-gray-500">{w.weight_kg}kg</span>
                  </div>
                </div>

                {/* Qty controls */}
                <div className="flex items-center gap-1 shrink-0">
                  <button
                    onClick={() => adjust(w.id, -1)}
                    disabled={qty === 0}
                    className="w-8 h-8 rounded-lg bg-gray-800/80 border border-gray-700/50 flex items-center justify-center text-gray-400 disabled:opacity-20 active:bg-gray-700"
                  >
                    <Minus className="w-3.5 h-3.5" />
                  </button>
                  <span className={`w-7 text-center text-sm font-bold hud-text ${qty > 0 ? 'text-emerald-400 hud-glow' : 'text-gray-700'}`}>
                    {qty}
                  </span>
                  <button
                    onClick={() => adjust(w.id, 1)}
                    className="w-8 h-8 rounded-lg bg-gray-800/80 border border-gray-700/50 flex items-center justify-center text-gray-400 active:bg-gray-700"
                  >
                    <Plus className="w-3.5 h-3.5" />
                  </button>
                </div>
              </div>
            </div>
          );
        })}
      </div>

      {/* Bottom bar: fuel + payload + deploy */}
      <div className="border-t border-emerald-500/10 px-4 pt-3 pb-6 sm:pb-4 space-y-3 bg-gray-950">
        {/* Fuel slider */}
        <div>
          <div className="flex items-center justify-between mb-1.5">
            <div className="flex items-center gap-1.5">
              <Fuel className="w-3.5 h-3.5 text-amber-400" />
              <span className="text-[10px] text-amber-400 hud-text font-bold">FUEL</span>
            </div>
            <span className="text-xs font-bold text-amber-400 hud-text hud-glow-amber">{fuelPct}% · {fuelWeight.toLocaleString()}kg</span>
          </div>
          <input
            type="range"
            min={50}
            max={100}
            step={5}
            value={fuelPct}
            onChange={(e) => setFuelPct(Number(e.target.value))}
            className="w-full h-1.5 bg-gray-800 rounded-full appearance-none cursor-pointer accent-amber-500"
          />
          <div className="flex justify-between mt-1">
            <span className="text-[9px] text-gray-600">Light (better TWR)</span>
            <span className={`text-[9px] font-bold hud-text ${twrModifier > 0.85 ? 'text-emerald-400' : twrModifier > 0.7 ? 'text-amber-400' : 'text-red-400'}`}>
              TWR ×{twrModifier.toFixed(2)}
            </span>
            <span className="text-[9px] text-gray-600">Heavy (more endurance)</span>
          </div>
        </div>

        {/* Payload bar */}
        <div>
          <div className="flex items-center justify-between mb-1">
            <span className="text-[10px] text-gray-500 hud-text">PAYLOAD</span>
            <span className={`text-[10px] font-bold hud-text ${overWeight ? 'text-red-400 hud-glow-red' : 'text-white'}`}>
              {totalWeight.toLocaleString()} / {aircraft.max_payload_kg.toLocaleString()} kg
            </span>
          </div>
          <div className="h-2.5 bg-gray-800 rounded-full overflow-hidden flex">
            {/* Weapons portion */}
            <div
              className="h-full bg-emerald-500 transition-all duration-300"
              style={{ width: `${Math.min(100, (totalWeaponWeight / aircraft.max_payload_kg) * 100)}%` }}
            />
            {/* Fuel portion */}
            <div
              className="h-full bg-amber-500 transition-all duration-300"
              style={{ width: `${Math.min(100 - (totalWeaponWeight / aircraft.max_payload_kg) * 100, (fuelWeight / aircraft.max_payload_kg) * 100)}%` }}
            />
          </div>
          <div className="flex gap-3 mt-1">
            <span className="text-[9px] text-emerald-400 flex items-center gap-1"><span className="w-2 h-2 rounded-sm bg-emerald-500 inline-block" /> Weapons {totalWeaponWeight.toLocaleString()}kg</span>
            <span className="text-[9px] text-amber-400 flex items-center gap-1"><span className="w-2 h-2 rounded-sm bg-amber-500 inline-block" /> Fuel {fuelWeight.toLocaleString()}kg</span>
          </div>
        </div>

        {/* Deploy button */}
        <button
          onClick={handleSubmit}
          disabled={!hasWeapons || overWeight || overHardpoints || submitting}
          className="w-full flex items-center justify-center gap-2 bg-emerald-500 text-black font-bold text-sm py-3.5 rounded-xl active:bg-emerald-400 disabled:opacity-30 disabled:cursor-not-allowed transition-colors hud-text tracking-wider"
        >
          {submitting ? (
            <Loader2 className="w-4 h-4 animate-spin" />
          ) : (
            <>
              <ChevronRight className="w-5 h-5" />
              DEPLOY — BEGIN BATTLE
            </>
          )}
        </button>
        {overWeight && <p className="text-[10px] text-red-400 text-center hud-text hud-glow-red">OVERWEIGHT — REDUCE PAYLOAD</p>}
      </div>
    </div>
  );
};
