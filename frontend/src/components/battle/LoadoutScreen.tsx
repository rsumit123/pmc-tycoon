import { useState } from 'react';
import {
  Crosshair,
  Shield,
  Radar,
  Weight,
  Minus,
  Plus,
  ChevronRight,
  Loader2,
  Plane,
} from 'lucide-react';
import { apiService } from '../../services/api';

interface WeaponOption {
  id: number;
  name: string;
  type: string;
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
    max_payload_kg: number;
    hardpoints: number;
    radar_type: string;
    radar_range_km: number;
    rcs_m2: number;
    ecm_suite: string;
    ecm_rating: number;
  };
  enemy: { id: number; name: string; origin: string; generation: string };
  weapons: WeaponOption[];
  onReady: (stateData: any) => void;
}

const typeLabel: Record<string, string> = {
  BVR_AAM: 'BVR',
  IR_AAM: 'IR',
  ASM: 'A/S',
};

const typeBg: Record<string, string> = {
  BVR_AAM: 'bg-blue-500/15 text-blue-400',
  IR_AAM: 'bg-red-500/15 text-red-400',
  ASM: 'bg-amber-500/15 text-amber-400',
};

export const LoadoutScreen = ({ battleId, aircraft, enemy, weapons, onReady }: LoadoutScreenProps) => {
  const [selected, setSelected] = useState<Record<number, number>>({});
  const [submitting, setSubmitting] = useState(false);

  const totalWeight = Object.entries(selected).reduce((sum, [id, qty]) => {
    const w = weapons.find((w) => w.id === Number(id));
    return sum + (w ? w.weight_kg * qty : 0);
  }, 0);

  const totalHardpoints = Object.values(selected).reduce((sum, qty) => sum + qty, 0);
  const weightPct = aircraft.max_payload_kg > 0 ? (totalWeight / aircraft.max_payload_kg) * 100 : 0;
  const overWeight = totalWeight > aircraft.max_payload_kg;
  const overHardpoints = totalHardpoints > aircraft.hardpoints;
  const hasWeapons = totalHardpoints > 0;

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
      {/* Header */}
      <div className="px-4 pt-5 pb-3 border-b border-gray-800/60">
        <p className="text-[10px] text-gray-500 uppercase tracking-widest">Mission Loadout</p>
        <h1 className="text-lg font-bold text-white mt-0.5">
          {aircraft.name} <span className="text-gray-500 font-normal">vs</span> {enemy.name}
        </h1>
      </div>

      {/* Aircraft stats strip */}
      <div className="flex gap-2 px-4 py-3 border-b border-gray-800/40 overflow-x-auto">
        {[
          { icon: Radar, label: 'Radar', value: `${aircraft.radar_range_km}km` },
          { icon: Shield, label: 'RCS', value: `${aircraft.rcs_m2}m²` },
          { icon: Crosshair, label: 'ECM', value: `${aircraft.ecm_rating}` },
          { icon: Plane, label: 'Hardpoints', value: `${totalHardpoints}/${aircraft.hardpoints}` },
        ].map((s) => (
          <div key={s.label} className="flex items-center gap-1.5 bg-gray-900 rounded-lg px-2.5 py-1.5 shrink-0">
            <s.icon className="w-3 h-3 text-gray-500" />
            <span className="text-[10px] text-gray-500">{s.label}</span>
            <span className="text-xs font-bold text-white">{s.value}</span>
          </div>
        ))}
      </div>

      {/* Weapon list */}
      <div className="flex-1 overflow-y-auto px-4 py-3 space-y-2.5">
        {weapons.map((w) => {
          const qty = selected[w.id] || 0;
          return (
            <div
              key={w.id}
              className={`bg-gray-900 rounded-xl border p-3.5 transition-colors ${
                qty > 0 ? 'border-emerald-500/30' : 'border-gray-800/60'
              }`}
            >
              <div className="flex items-center gap-3">
                {/* Type badge */}
                <span className={`text-[10px] font-bold px-2 py-0.5 rounded ${typeBg[w.type] || 'bg-gray-700 text-gray-400'}`}>
                  {typeLabel[w.type] || w.type}
                </span>
                {/* Name + stats */}
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-semibold text-white truncate">{w.name}</p>
                  <div className="flex items-center gap-2 mt-0.5">
                    <span className="text-[10px] text-gray-500">{w.max_range_km}km</span>
                    <span className="text-gray-700">·</span>
                    <span className="text-[10px] text-gray-500">Pk {(w.base_pk * 100).toFixed(0)}%</span>
                    <span className="text-gray-700">·</span>
                    <span className="text-[10px] text-gray-500">{w.weight_kg}kg</span>
                  </div>
                </div>
                {/* Quantity controls */}
                <div className="flex items-center gap-1.5 shrink-0">
                  <button
                    onClick={() => adjust(w.id, -1)}
                    disabled={qty === 0}
                    className="w-8 h-8 rounded-lg bg-gray-800 flex items-center justify-center text-gray-400 disabled:opacity-30 active:bg-gray-700"
                  >
                    <Minus className="w-3.5 h-3.5" />
                  </button>
                  <span className={`w-6 text-center text-sm font-bold ${qty > 0 ? 'text-emerald-400' : 'text-gray-600'}`}>
                    {qty}
                  </span>
                  <button
                    onClick={() => adjust(w.id, 1)}
                    className="w-8 h-8 rounded-lg bg-gray-800 flex items-center justify-center text-gray-400 active:bg-gray-700"
                  >
                    <Plus className="w-3.5 h-3.5" />
                  </button>
                </div>
              </div>
            </div>
          );
        })}
      </div>

      {/* Bottom bar: payload + submit */}
      <div className="border-t border-gray-800 px-4 py-4 pb-6 sm:pb-4 space-y-3 bg-gray-900/80 backdrop-blur-lg">
        {/* Payload bar */}
        <div>
          <div className="flex items-center justify-between mb-1.5">
            <div className="flex items-center gap-1.5">
              <Weight className="w-3.5 h-3.5 text-gray-500" />
              <span className="text-xs text-gray-400">Payload</span>
            </div>
            <span className={`text-xs font-bold ${overWeight ? 'text-red-400' : 'text-white'}`}>
              {totalWeight.toLocaleString()} / {aircraft.max_payload_kg.toLocaleString()} kg
            </span>
          </div>
          <div className="h-2 bg-gray-800 rounded-full overflow-hidden">
            <div
              className={`h-full rounded-full transition-all duration-300 ${
                overWeight ? 'bg-red-500' : weightPct > 80 ? 'bg-amber-500' : 'bg-emerald-500'
              }`}
              style={{ width: `${Math.min(100, weightPct)}%` }}
            />
          </div>
        </div>

        {/* Submit */}
        <button
          onClick={handleSubmit}
          disabled={!hasWeapons || overWeight || overHardpoints || submitting}
          className="w-full flex items-center justify-center gap-2 bg-emerald-500 text-white font-semibold text-sm py-3.5 rounded-xl active:bg-emerald-600 disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
        >
          {submitting ? (
            <Loader2 className="w-4 h-4 animate-spin" />
          ) : (
            <>
              <ChevronRight className="w-4 h-4" />
              Deploy — Begin Battle
            </>
          )}
        </button>
        {overWeight && <p className="text-xs text-red-400 text-center">Loadout exceeds maximum payload</p>}
        {overHardpoints && <p className="text-xs text-red-400 text-center">Not enough hardpoints</p>}
      </div>
    </div>
  );
};
