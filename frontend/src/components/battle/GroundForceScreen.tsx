import { useState, useEffect } from 'react';
import { apiService } from '../../services/api';
import { Loader2, Plane, CheckCircle2, AlertTriangle, Swords, Info, ChevronDown, ChevronUp } from 'lucide-react';
import '../../styles/design-system.css';

interface GroundUnit {
  id: number; name: string; unit_type: string; role: string;
  combat_power: number; anti_armor: number; anti_infantry: number;
  anti_air: number; survivability: number; cost_usd: number;
  upkeep_per_mission: number; image_url: string | null;
}

interface OwnedGroundUnit {
  id: number; ground_unit_id: number; custom_name: string;
  hp_pct: number; battles_fought: number; unit: GroundUnit;
}

interface OwnedAircraft {
  id: number; aircraft_id: number; name: string; origin: string; condition: number;
}

interface MissionTemplate {
  id: number; title: string; description: string | null;
  difficulty: number; risk_level: number; faction: string;
  terrain_type: string | null; enemy_ground_composition: string | null;
  base_payout: number;
}

interface Props {
  missionTemplateId: number;
  onReady: (simulatedState: any) => void;
}

const TERRAIN_LABELS: Record<string, string> = {
  urban: 'Urban', open: 'Open Desert', mountain: 'Mountain', forest: 'Dense Forest',
};

const TERRAIN_TIPS: Record<string, string> = {
  urban: 'Infantry excels. Armor is heavily penalized in tight streets.',
  open: 'Armor and drones dominate open ground. Infantry vulnerable.',
  mountain: 'Artillery and drones gain advantage. Armor struggles.',
  forest: 'Infantry rules the forest. Armor and drones are ineffective.',
};

const UNIT_CATEGORY: Record<string, string> = {
  infantry: 'Infantry', rpg_team: 'Infantry', sniper: 'Infantry',
  manpads: 'Infantry', spec_ops: 'Infantry',
  ifv: 'Armor', light_tank: 'Armor', mbt: 'Armor', tank_destroyer: 'Armor',
  mortar: 'Artillery', sph: 'Artillery', mlrs: 'Artillery',
  drone_isr: 'Drones', drone_attack: 'Drones',
};

type CategoryFilter = 'All' | 'Infantry' | 'Armor' | 'Artillery' | 'Drones';

const CATEGORY_FILTERS: CategoryFilter[] = ['All', 'Infantry', 'Armor', 'Artillery', 'Drones'];

const hpColor = (hp: number) =>
  hp >= 70 ? 'var(--color-green)' : hp >= 40 ? 'var(--color-amber)' : 'var(--color-red)';

const difficultyLabel = (d: number) => d === 1 ? 'EASY' : d === 2 ? 'MEDIUM' : 'HARD';
const difficultyColor = (d: number) =>
  d === 1 ? 'var(--color-green)' : d === 2 ? 'var(--color-amber)' : 'var(--color-red)';

const UNIT_ICONS: Record<string, string> = {
  Infantry: '⚔', Armor: '🛡', Artillery: '💥', Drones: '✈',
};

export const GroundForceScreen = ({ missionTemplateId, onReady }: Props) => {
  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [template, setTemplate] = useState<MissionTemplate | null>(null);
  const [ownedUnits, setOwnedUnits] = useState<OwnedGroundUnit[]>([]);
  const [aircraftList, setAircraftList] = useState<OwnedAircraft[]>([]);
  const [selectedUnitIds, setSelectedUnitIds] = useState<Set<number>>(new Set());
  const [selectedAircraftId, setSelectedAircraftId] = useState<number | null>(null);
  const [categoryFilter, setCategoryFilter] = useState<CategoryFilter>('All');
  const [showAirSupport, setShowAirSupport] = useState(false);

  useEffect(() => {
    (async () => {
      try {
        const [templatesRes, ownedRes, aircraftRes] = await Promise.all([
          apiService.getMissionTemplates(),
          apiService.getOwnedGroundUnits(),
          apiService.getOwnedAircraft().catch(() => ({ data: [] })),
        ]);
        const templates = Array.isArray(templatesRes.data) ? templatesRes.data : [];
        setTemplate(templates.find((t: MissionTemplate) => t.id === missionTemplateId) || null);
        setOwnedUnits(Array.isArray(ownedRes.data) ? ownedRes.data : []);
        setAircraftList(Array.isArray(aircraftRes.data) ? aircraftRes.data : []);
      } catch {
        // ignore
      } finally {
        setLoading(false);
      }
    })();
  }, [missionTemplateId]);

  const toggleUnit = (id: number) => {
    setSelectedUnitIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id); else next.add(id);
      return next;
    });
  };

  const handleExecute = async () => {
    if (selectedUnitIds.size === 0) return;
    setSubmitting(true);
    try {
      const res = await apiService.startGroundBattle({
        mission_template_id: missionTemplateId,
        ground_unit_ids: Array.from(selectedUnitIds),
        owned_aircraft_id: selectedAircraftId ?? undefined,
      });
      onReady(res.data);
    } catch (err: any) {
      alert(err?.response?.data?.detail || 'Failed to start mission');
      setSubmitting(false);
    }
  };

  if (loading) {
    return (
      <div className="min-h-[100dvh] flex items-center justify-center" style={{ background: 'var(--color-base)' }}>
        <div className="flex flex-col items-center gap-3">
          <Loader2 className="w-8 h-8 animate-spin" style={{ color: 'var(--color-amber)' }} />
          <p className="text-sm" style={{ color: 'var(--color-text-muted)' }}>Loading mission data...</p>
        </div>
      </div>
    );
  }

  const terrain = template?.terrain_type || 'open';
  const difficulty = template?.difficulty || 1;
  let enemyComp: Record<string, number> = {};
  try {
    if (template?.enemy_ground_composition) enemyComp = JSON.parse(template.enemy_ground_composition);
  } catch { /* ignore */ }

  const totalEnemyUnits = Object.values(enemyComp).reduce((a, b) => a + b, 0);
  const aliveUnits = ownedUnits.filter((u) => u.hp_pct > 0);

  // Apply category filter
  const filteredUnits = categoryFilter === 'All'
    ? aliveUnits
    : aliveUnits.filter((u) => UNIT_CATEGORY[u.unit.unit_type] === categoryFilter);

  // Count per category for badges
  const categoryCounts: Record<string, number> = { All: aliveUnits.length };
  for (const u of aliveUnits) {
    const cat = UNIT_CATEGORY[u.unit.unit_type] || 'Other';
    categoryCounts[cat] = (categoryCounts[cat] || 0) + 1;
  }

  const canExecute = selectedUnitIds.size > 0 && !submitting;

  return (
    <div className="min-h-[100dvh] flex flex-col" style={{ background: 'var(--color-base)' }}>
      {/* Header */}
      <div className="px-4 pt-safe pt-5 pb-4" style={{ borderBottom: '1px solid var(--color-border)' }}>
        <p className="text-[10px] font-display tracking-widest mb-1" style={{ color: 'var(--color-text-muted)' }}>
          GROUND OPERATIONS — FORCE SELECTION
        </p>
        <h1 className="font-display text-lg leading-tight" style={{ color: 'var(--color-text)' }}>
          {template?.title || 'Unknown Mission'}
        </h1>
        <p className="text-xs mt-1 leading-relaxed" style={{ color: 'var(--color-text-secondary)' }}>
          {template?.description}
        </p>
      </div>

      <div className="flex-1 overflow-y-auto pb-32 scroll-list">
        {/* Intel row */}
        <div className="px-4 pt-4">
          <div className="grid grid-cols-3 gap-2 mb-3">
            <div className="rounded-xl p-3 text-center" style={{ background: 'var(--color-surface)' }}>
              <p className="text-[10px] font-display tracking-wide mb-1" style={{ color: 'var(--color-text-muted)' }}>TERRAIN</p>
              <p className="font-display text-xs" style={{ color: 'var(--color-amber)' }}>{TERRAIN_LABELS[terrain] || terrain}</p>
            </div>
            <div className="rounded-xl p-3 text-center" style={{ background: 'var(--color-surface)' }}>
              <p className="text-[10px] font-display tracking-wide mb-1" style={{ color: 'var(--color-text-muted)' }}>THREAT</p>
              <p className="font-display text-xs" style={{ color: difficultyColor(difficulty) }}>
                {difficultyLabel(difficulty)}
              </p>
            </div>
            <div className="rounded-xl p-3 text-center" style={{ background: 'var(--color-surface)' }}>
              <p className="text-[10px] font-display tracking-wide mb-1" style={{ color: 'var(--color-text-muted)' }}>ENEMY</p>
              <p className="font-display text-xs" style={{ color: 'var(--color-red)' }}>{totalEnemyUnits} UNITS</p>
            </div>
          </div>

          {/* Terrain tip */}
          {TERRAIN_TIPS[terrain] && (
            <div
              className="flex items-start gap-2 rounded-xl p-3 mb-3"
              style={{ background: 'rgba(212,168,67,0.08)', border: '1px solid rgba(212,168,67,0.2)' }}
            >
              <Info className="w-3.5 h-3.5 shrink-0 mt-0.5" style={{ color: 'var(--color-amber)' }} />
              <p className="text-xs" style={{ color: 'var(--color-text-secondary)' }}>{TERRAIN_TIPS[terrain]}</p>
            </div>
          )}

          {/* Enemy composition */}
          {Object.keys(enemyComp).length > 0 && (
            <div className="rounded-xl p-3 mb-3" style={{ background: 'var(--color-surface)' }}>
              <p className="text-[10px] font-display tracking-wide mb-2" style={{ color: 'var(--color-text-muted)' }}>
                CONFIRMED ENEMY COMPOSITION
              </p>
              <div className="flex flex-wrap gap-1.5">
                {Object.entries(enemyComp).map(([type, count]) => (
                  <div
                    key={type}
                    className="flex items-center gap-1 px-2 py-1 rounded-lg"
                    style={{ background: 'rgba(229,62,62,0.1)', border: '1px solid rgba(229,62,62,0.2)' }}
                  >
                    <span className="font-data text-xs font-bold" style={{ color: 'var(--color-red)' }}>{count}×</span>
                    <span className="text-[10px]" style={{ color: 'var(--color-text-secondary)' }}>
                      {type.replace(/_/g, ' ')}
                    </span>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>

        {/* Force selection */}
        <div className="px-4 pt-2">
          <div className="flex items-center justify-between mb-3">
            <p className="text-[10px] font-display tracking-widest" style={{ color: 'var(--color-text-muted)' }}>
              SELECT YOUR FORCES
            </p>
            <span className="font-data text-xs font-semibold" style={{ color: 'var(--color-amber)' }}>
              {selectedUnitIds.size} DEPLOYED
            </span>
          </div>

          {/* Category filter tabs */}
          <div
            className="flex gap-1 p-1 rounded-xl mb-3 overflow-x-auto"
            style={{ background: 'var(--color-surface)' }}
          >
            {CATEGORY_FILTERS.map((cat) => {
              const count = categoryCounts[cat] || 0;
              const isActive = categoryFilter === cat;
              return (
                <button
                  key={cat}
                  onClick={() => setCategoryFilter(cat)}
                  className="flex items-center gap-1 shrink-0 px-2.5 py-1.5 rounded-lg text-xs transition-all"
                  style={{
                    background: isActive ? 'var(--color-amber)' : 'transparent',
                    color: isActive ? 'var(--color-text-inverse)' : 'var(--color-text-muted)',
                  }}
                >
                  <span>{UNIT_ICONS[cat] || ''}</span>
                  <span className="font-display tracking-wide">{cat}</span>
                  {cat !== 'All' && count > 0 && (
                    <span
                      className="font-data text-[10px] font-bold px-1 rounded"
                      style={{
                        background: isActive ? 'rgba(0,0,0,0.2)' : 'var(--color-surface-raised)',
                        color: isActive ? 'var(--color-text-inverse)' : 'var(--color-text-muted)',
                      }}
                    >
                      {count}
                    </span>
                  )}
                </button>
              );
            })}
          </div>

          {aliveUnits.length === 0 ? (
            <div
              className="rounded-xl p-6 text-center"
              style={{ background: 'var(--color-surface)', border: '1px solid var(--color-border)' }}
            >
              <AlertTriangle className="w-8 h-8 mx-auto mb-2" style={{ color: 'var(--color-amber)' }} />
              <p className="font-display text-sm mb-1" style={{ color: 'var(--color-text)' }}>NO GROUND FORCES</p>
              <p className="text-xs" style={{ color: 'var(--color-text-muted)' }}>
                Recruit units in the Barracks before deploying.
              </p>
            </div>
          ) : filteredUnits.length === 0 ? (
            <div
              className="rounded-xl p-4 text-center"
              style={{ background: 'var(--color-surface)', border: '1px solid var(--color-border)' }}
            >
              <p className="text-sm" style={{ color: 'var(--color-text-muted)' }}>
                No {categoryFilter} units in your roster.
              </p>
            </div>
          ) : (
            <div className="space-y-2">
              {filteredUnits.map((owned) => {
                const isSelected = selectedUnitIds.has(owned.id);
                const category = UNIT_CATEGORY[owned.unit.unit_type] || 'Other';
                return (
                  <button
                    key={owned.id}
                    onClick={() => toggleUnit(owned.id)}
                    className="w-full text-left rounded-xl p-3 transition-all"
                    style={{
                      background: isSelected ? 'rgba(212,168,67,0.08)' : 'var(--color-surface)',
                      border: `1px solid ${isSelected ? 'var(--color-amber)' : 'var(--color-border)'}`,
                    }}
                  >
                    <div className="flex items-center gap-3">
                      {/* Selection indicator */}
                      <div
                        className="w-4 h-4 rounded-full border-2 flex items-center justify-center shrink-0 transition-all"
                        style={{ borderColor: isSelected ? 'var(--color-amber)' : 'var(--color-border)' }}
                      >
                        {isSelected && (
                          <div className="w-2 h-2 rounded-full" style={{ background: 'var(--color-amber)' }} />
                        )}
                      </div>

                      {/* Unit icon */}
                      <div
                        className="w-8 h-8 rounded-lg flex items-center justify-center shrink-0 text-sm"
                        style={{ background: 'var(--color-surface-raised)' }}
                      >
                        {UNIT_ICONS[category] || '⚔'}
                      </div>

                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2">
                          <span className="font-display text-sm" style={{ color: 'var(--color-text)' }}>
                            {owned.custom_name}
                          </span>
                          <span className="text-[10px]" style={{ color: 'var(--color-text-muted)' }}>
                            {owned.unit.role}
                          </span>
                        </div>
                        {/* HP bar */}
                        <div className="flex items-center gap-2 mt-1">
                          <div className="flex-1 h-1 rounded-full" style={{ background: 'var(--color-surface-raised)' }}>
                            <div
                              className="h-full rounded-full transition-all"
                              style={{ width: `${owned.hp_pct}%`, background: hpColor(owned.hp_pct) }}
                            />
                          </div>
                          <span className="font-data text-[10px]" style={{ color: hpColor(owned.hp_pct) }}>
                            {owned.hp_pct.toFixed(0)}%
                          </span>
                        </div>
                      </div>

                      {/* Stats */}
                      <div className="flex gap-3 shrink-0">
                        <div className="text-center">
                          <p className="font-data text-[11px] font-bold" style={{ color: 'var(--color-text)' }}>
                            {owned.unit.combat_power}
                          </p>
                          <p className="text-[9px]" style={{ color: 'var(--color-text-muted)' }}>CP</p>
                        </div>
                        <div className="text-center">
                          <p className="font-data text-[11px] font-bold" style={{ color: 'var(--color-text)' }}>
                            {owned.unit.survivability}
                          </p>
                          <p className="text-[9px]" style={{ color: 'var(--color-text-muted)' }}>DEF</p>
                        </div>
                      </div>
                    </div>
                  </button>
                );
              })}
            </div>
          )}
        </div>

        {/* Air support — collapsible optional section */}
        {aircraftList.length > 0 && (
          <div className="px-4 pt-4">
            <button
              onClick={() => setShowAirSupport((v) => !v)}
              className="w-full flex items-center justify-between rounded-xl p-3 transition-all"
              style={{
                background: 'var(--color-surface)',
                border: `1px solid ${showAirSupport ? 'rgba(91,139,160,0.4)' : 'var(--color-border)'}`,
              }}
            >
              <div className="flex items-center gap-2">
                <Plane className="w-4 h-4" style={{ color: showAirSupport ? 'var(--color-blue)' : 'var(--color-text-muted)' }} />
                <span className="font-display text-xs tracking-wide" style={{ color: showAirSupport ? 'var(--color-blue)' : 'var(--color-text-muted)' }}>
                  ADD AIR SUPPORT
                </span>
                <span
                  className="text-[10px] px-1.5 py-0.5 rounded font-display"
                  style={{ background: 'rgba(91,139,160,0.12)', color: 'var(--color-blue)' }}
                >
                  OPTIONAL
                </span>
                {selectedAircraftId !== null && (
                  <CheckCircle2 className="w-3.5 h-3.5" style={{ color: 'var(--color-blue)' }} />
                )}
              </div>
              {showAirSupport ? (
                <ChevronUp className="w-4 h-4" style={{ color: 'var(--color-text-muted)' }} />
              ) : (
                <ChevronDown className="w-4 h-4" style={{ color: 'var(--color-text-muted)' }} />
              )}
            </button>

            {showAirSupport && (
              <div className="mt-2 space-y-2">
                <div
                  className="rounded-xl p-2.5 text-xs"
                  style={{ background: 'rgba(91,139,160,0.08)', color: 'var(--color-text-muted)' }}
                >
                  Attach an aircraft for air support bonus. Fighter +10%, Multirole +20%, Strike/Attack +35% damage.
                </div>

                {/* None option */}
                <button
                  onClick={() => setSelectedAircraftId(null)}
                  className="w-full text-left rounded-xl p-3 transition-all"
                  style={{
                    background: selectedAircraftId === null ? 'rgba(212,168,67,0.06)' : 'var(--color-surface)',
                    border: `1px solid ${selectedAircraftId === null ? 'var(--color-amber)' : 'var(--color-border)'}`,
                  }}
                >
                  <div className="flex items-center gap-3">
                    <div
                      className="w-4 h-4 rounded-full border-2 flex items-center justify-center"
                      style={{ borderColor: selectedAircraftId === null ? 'var(--color-amber)' : 'var(--color-border)' }}
                    >
                      {selectedAircraftId === null && (
                        <div className="w-2 h-2 rounded-full" style={{ background: 'var(--color-amber)' }} />
                      )}
                    </div>
                    <span className="text-sm" style={{ color: 'var(--color-text-muted)' }}>No air support</span>
                  </div>
                </button>

                {aircraftList.map((ac) => {
                  const isSelected = selectedAircraftId === ac.id;
                  return (
                    <button
                      key={ac.id}
                      onClick={() => setSelectedAircraftId(isSelected ? null : ac.id)}
                      className="w-full text-left rounded-xl p-3 transition-all"
                      style={{
                        background: isSelected ? 'rgba(91,139,160,0.08)' : 'var(--color-surface)',
                        border: `1px solid ${isSelected ? 'rgba(91,139,160,0.5)' : 'var(--color-border)'}`,
                      }}
                    >
                      <div className="flex items-center gap-3">
                        <div
                          className="w-4 h-4 rounded-full border-2 flex items-center justify-center"
                          style={{ borderColor: isSelected ? 'var(--color-blue)' : 'var(--color-border)' }}
                        >
                          {isSelected && (
                            <div className="w-2 h-2 rounded-full" style={{ background: 'var(--color-blue)' }} />
                          )}
                        </div>
                        <Plane className="w-4 h-4" style={{ color: isSelected ? 'var(--color-blue)' : 'var(--color-text-muted)' }} />
                        <div className="flex-1 min-w-0">
                          <p className="text-sm" style={{ color: 'var(--color-text)' }}>{ac.name}</p>
                          <p className="text-[11px]" style={{ color: 'var(--color-text-muted)' }}>
                            {ac.origin} · {ac.condition}% condition
                          </p>
                        </div>
                        {isSelected && (
                          <CheckCircle2 className="w-4 h-4 shrink-0" style={{ color: 'var(--color-blue)' }} />
                        )}
                      </div>
                    </button>
                  );
                })}
              </div>
            )}
          </div>
        )}

        <div className="h-4" />
      </div>

      {/* Bottom action bar */}
      <div
        className="fixed bottom-0 left-0 right-0 px-4 pb-safe pb-6 pt-4"
        style={{ background: 'var(--color-base)', borderTop: '1px solid var(--color-border)' }}
      >
        <div className="flex items-center justify-between mb-3">
          <span className="text-xs" style={{ color: 'var(--color-text-muted)' }}>
            {selectedUnitIds.size > 0 ? `${selectedUnitIds.size} unit${selectedUnitIds.size !== 1 ? 's' : ''} ready` : 'Select forces to deploy'}
            {selectedAircraftId !== null ? ' + air support' : ''}
          </span>
          <span className="font-data text-xs font-bold" style={{ color: 'var(--color-amber)' }}>
            ~${(template?.base_payout || 0).toLocaleString()} payout
          </span>
        </div>
        <button
          onClick={handleExecute}
          disabled={!canExecute}
          className="btn-primary w-full flex items-center justify-center gap-2 py-4 text-sm"
          style={{ opacity: canExecute ? 1 : 0.5 }}
        >
          {submitting ? (
            <>
              <Loader2 className="w-4 h-4 animate-spin" />
              SIMULATING BATTLE...
            </>
          ) : (
            <>
              <Swords className="w-4 h-4" />
              EXECUTE MISSION
            </>
          )}
        </button>
      </div>
    </div>
  );
};
