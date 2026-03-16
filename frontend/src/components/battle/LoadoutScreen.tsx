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
import '../../styles/design-system.css';
import './animations.css';

interface WeaponOption {
  id: number; name: string; type: string; image_url: string | null;
  weight_kg: number; max_range_km: number; no_escape_range_km: number;
  base_pk: number; guidance: string; cost_per_unit: number; stock: number;
}

interface LoadoutScreenProps {
  battleId: number;
  aircraft: {
    id: number; name: string; image_url: string | null; max_payload_kg: number;
    hardpoints: number; radar_type: string; radar_range_km: number; rcs_m2: number;
    ecm_suite: string; ecm_rating: number; internal_fuel_kg: number; thrust_to_weight_clean: number;
  };
  enemy: { id: number; name: string; image_url: string | null; origin: string; generation: string };
  weapons: WeaponOption[];
  onReady: (stateData: any) => void;
}

const typeLabel: Record<string, string> = { BVR_AAM: 'BVR', IR_AAM: 'WVR', ASM: 'A/S' };
const typeBg: Record<string, string> = {
  BVR_AAM: 'bg-accent-blue/20 text-accent-blue border-accent-blue/30',
  IR_AAM: 'bg-accent-red/20 text-accent-red border-accent-red/30',
  ASM: 'bg-accent-amber/20 text-accent-amber border-accent-amber/30',
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
  const loadedWeight = aircraft.max_payload_kg > 0 ? totalWeight / aircraft.max_payload_kg : 0;
  const twrModifier = Math.max(0.6, 1.0 - loadedWeight * 0.3);

  const adjust = (weaponId: number, delta: number) => {
    setSelected((prev) => {
      const current = prev[weaponId] || 0;
      const next = Math.max(0, current + delta);
      if (next === 0) { const { [weaponId]: _, ...rest } = prev; return rest; }
      return { ...prev, [weaponId]: next };
    });
  };

  const handleSubmit = async () => {
    if (!hasWeapons || overWeight || overHardpoints) return;
    setSubmitting(true);
    try {
      const weaponsList = Object.entries(selected).map(([id, qty]) => ({ weapon_id: Number(id), quantity: qty }));
      const res = await apiService.submitLoadout(battleId, { weapons: weaponsList, fuel_pct: fuelPct });
      onReady(res.data);
    } catch (err) { console.error('Loadout submit failed:', err); }
    finally { setSubmitting(false); }
  };

  return (
    <div className="min-h-[100dvh] flex flex-col" style={{ background: 'var(--color-base)' }}>
      {/* Aircraft hero header */}
      <div className="relative h-48 overflow-hidden">
        {aircraft.image_url ? (
          <img src={aircraft.image_url} alt={aircraft.name} className="w-full h-full object-cover" />
        ) : (
          <div className="w-full h-full" style={{ background: 'var(--color-surface)' }} />
        )}
        <div className="absolute inset-0" style={{ background: 'linear-gradient(to top, var(--color-base) 0%, rgba(12,14,18,0.6) 40%, transparent 100%)' }} />
        <div className="absolute bottom-0 left-0 right-0 px-4 pb-3">
          <span className="stamp stamp-confidential text-[9px] mb-1 inline-block">MISSION BRIEFING</span>
          <h1 className="font-display text-xl tracking-wider" style={{ color: 'var(--color-text)' }}>{aircraft.name}</h1>
          <p className="text-xs" style={{ color: 'var(--color-text-secondary)' }}>
            vs <span className="font-semibold" style={{ color: 'var(--color-red)' }}>{enemy.name}</span>
            <span className="ml-1" style={{ color: 'var(--color-text-muted)' }}>({enemy.origin})</span>
          </p>
        </div>
      </div>

      {/* Stats strip */}
      <div className="flex gap-1.5 px-3 py-2.5 overflow-x-auto" style={{ borderBottom: '1px solid var(--color-border)', background: 'var(--color-base)' }}>
        {[
          { icon: Radar, label: 'RADAR', value: `${aircraft.radar_range_km}km`, color: 'var(--color-blue)' },
          { icon: Shield, label: 'RCS', value: `${aircraft.rcs_m2}m²`, color: 'var(--color-blue)' },
          { icon: Zap, label: 'ECM', value: `${aircraft.ecm_rating}`, color: 'var(--color-amber)' },
          { icon: Crosshair, label: 'HP', value: `${totalHardpoints}/${aircraft.hardpoints}`, color: 'var(--color-amber)' },
        ].map((s) => (
          <div key={s.label} className="flex items-center gap-1.5 rounded-lg px-2.5 py-1.5 shrink-0" style={{ background: 'var(--color-surface)', border: '1px solid var(--color-border)' }}>
            <s.icon className="w-3 h-3" style={{ color: s.color }} />
            <span className="text-[10px] font-display tracking-wider" style={{ color: 'var(--color-text-muted)' }}>{s.label}</span>
            <span className="text-xs font-data font-bold" style={{ color: s.color }}>{s.value}</span>
          </div>
        ))}
      </div>

      {/* Weapon list */}
      <div className="flex-1 overflow-y-auto px-3 py-3 space-y-2">
        <p className="label-section mb-1">SELECT ARMAMENT</p>
        {weapons.map((w) => {
          const qty = selected[w.id] || 0;
          return (
            <div key={w.id} className="card-dossier p-3 transition-all" style={qty > 0 ? { borderColor: 'var(--color-amber-dim)' } : {}}>
              <div className="flex items-center gap-3">
                {w.image_url ? (
                  <img src={w.image_url} alt={w.name} className="w-12 h-12 rounded-lg object-cover shrink-0" />
                ) : (
                  <div className={`w-12 h-12 rounded-lg flex items-center justify-center border text-xs font-bold font-data shrink-0 ${typeBg[w.type] || 'bg-ink-faint/40 text-ink-secondary border-border'}`}>
                    {typeLabel[w.type] || w.type}
                  </div>
                )}
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-semibold truncate" style={{ color: 'var(--color-text)' }}>{w.name}</p>
                  <div className="flex items-center gap-1.5 mt-0.5 flex-wrap">
                    <span className={`text-[9px] font-bold px-1.5 py-0.5 rounded border ${typeBg[w.type] || ''}`}>
                      {typeLabel[w.type] || w.type}
                    </span>
                    <span className="font-data text-[10px]" style={{ color: 'var(--color-text-muted)' }}>{w.max_range_km}km · Pk {(w.base_pk * 100).toFixed(0)}% · {w.weight_kg}kg</span>
                  </div>
                  {w.stock !== undefined && (
                    <p className="text-[10px] mt-0.5" style={{ color: w.stock > 0 ? 'var(--color-green)' : 'var(--color-red)' }}>
                      Stock: {w.stock}
                    </p>
                  )}
                </div>
                <div className="flex items-center gap-1 shrink-0">
                  <button onClick={() => adjust(w.id, -1)} disabled={qty === 0}
                    className="w-8 h-8 rounded-lg flex items-center justify-center disabled:opacity-20"
                    style={{ background: 'var(--color-surface-raised)', color: 'var(--color-text-secondary)', border: '1px solid var(--color-border)' }}>
                    <Minus className="w-3.5 h-3.5" />
                  </button>
                  <span className="w-7 text-center text-sm font-bold font-data" style={{ color: qty > 0 ? 'var(--color-amber)' : 'var(--color-text-muted)' }}>
                    {qty}
                  </span>
                  <button onClick={() => adjust(w.id, 1)} disabled={w.stock !== undefined && qty >= w.stock}
                    className="w-8 h-8 rounded-lg flex items-center justify-center disabled:opacity-20"
                    style={{ background: 'var(--color-surface-raised)', color: 'var(--color-text-secondary)', border: '1px solid var(--color-border)' }}>
                    <Plus className="w-3.5 h-3.5" />
                  </button>
                </div>
              </div>
            </div>
          );
        })}
      </div>

      {/* Bottom bar: fuel + payload + deploy */}
      <div className="px-4 pt-3 pb-6 sm:pb-4 space-y-3" style={{ borderTop: '1px solid var(--color-border)', background: 'var(--color-base)' }}>
        {/* Fuel slider */}
        <div>
          <div className="flex items-center justify-between mb-1.5">
            <div className="flex items-center gap-1.5">
              <Fuel className="w-3.5 h-3.5" style={{ color: 'var(--color-amber)' }} />
              <span className="text-[10px] font-display tracking-wider font-bold" style={{ color: 'var(--color-amber)' }}>FUEL</span>
            </div>
            <span className="text-xs font-bold font-data" style={{ color: 'var(--color-amber)' }}>{fuelPct}% · {fuelWeight.toLocaleString()}kg</span>
          </div>
          <input type="range" min={50} max={100} step={5} value={fuelPct}
            onChange={(e) => setFuelPct(Number(e.target.value))}
            className="w-full h-1.5 rounded-full appearance-none cursor-pointer"
            style={{ background: 'var(--color-border)', accentColor: '#D4A843' }} />
          <div className="flex justify-between mt-1">
            <span className="text-[10px]" style={{ color: 'var(--color-text-muted)' }}>Light (better TWR)</span>
            <span className="text-[10px] font-bold font-data" style={{ color: twrModifier > 0.85 ? 'var(--color-green)' : twrModifier > 0.7 ? 'var(--color-amber)' : 'var(--color-red)' }}>
              TWR ×{twrModifier.toFixed(2)}
            </span>
            <span className="text-[10px]" style={{ color: 'var(--color-text-muted)' }}>Heavy (endurance)</span>
          </div>
        </div>

        {/* Payload bar */}
        <div>
          <div className="flex items-center justify-between mb-1">
            <span className="text-[10px] font-display tracking-wider" style={{ color: 'var(--color-text-muted)' }}>PAYLOAD</span>
            <span className="text-[10px] font-bold font-data" style={{ color: overWeight ? 'var(--color-red)' : 'var(--color-text)' }}>
              {totalWeight.toLocaleString()} / {aircraft.max_payload_kg.toLocaleString()} kg
            </span>
          </div>
          <div className="h-2.5 rounded-full overflow-hidden flex" style={{ background: 'var(--color-border)' }}>
            <div className="h-full transition-all duration-300" style={{ width: `${Math.min(100, (totalWeaponWeight / aircraft.max_payload_kg) * 100)}%`, background: 'var(--color-green)' }} />
            <div className="h-full transition-all duration-300" style={{ width: `${Math.min(100 - (totalWeaponWeight / aircraft.max_payload_kg) * 100, (fuelWeight / aircraft.max_payload_kg) * 100)}%`, background: 'var(--color-amber)' }} />
          </div>
          <div className="flex gap-3 mt-1">
            <span className="text-[10px] flex items-center gap-1" style={{ color: 'var(--color-green)' }}><span className="w-2 h-2 rounded-sm inline-block" style={{ background: 'var(--color-green)' }} /> Weapons {totalWeaponWeight.toLocaleString()}kg</span>
            <span className="text-[10px] flex items-center gap-1" style={{ color: 'var(--color-amber)' }}><span className="w-2 h-2 rounded-sm inline-block" style={{ background: 'var(--color-amber)' }} /> Fuel {fuelWeight.toLocaleString()}kg</span>
          </div>
        </div>

        {/* Deploy button */}
        <button onClick={handleSubmit} disabled={!hasWeapons || overWeight || overHardpoints || submitting}
          className="btn-primary w-full flex items-center justify-center gap-2 text-sm py-3.5">
          {submitting ? <Loader2 className="w-4 h-4 animate-spin" /> : (
            <>
              <ChevronRight className="w-5 h-5" />
              LAUNCH SORTIE
            </>
          )}
        </button>
        {overWeight && <p className="text-[10px] text-center font-display tracking-wider" style={{ color: 'var(--color-red)' }}>OVERWEIGHT — REDUCE PAYLOAD</p>}
      </div>
    </div>
  );
};
