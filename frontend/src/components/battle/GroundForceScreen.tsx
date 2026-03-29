import { useState, useEffect } from 'react';
import { apiService } from '../../services/api';
import { Loader2, Plane, CheckCircle2, AlertTriangle, Swords, Info } from 'lucide-react';
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
  role?: string;
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
  urban: 'Infantry excels. Armor is vulnerable.',
  open: 'Armor dominates. Drones have full coverage.',
  mountain: 'Artillery advantage. Drones effective.',
  forest: 'Infantry rules. Armor and drones limited.',
};

const hpColor = (hp: number) =>
  hp >= 70 ? 'var(--color-green)' : hp >= 40 ? 'var(--color-amber)' : 'var(--color-red)';

const difficultyLabel = (d: number) => d === 1 ? 'EASY' : d === 2 ? 'MEDIUM' : 'HARD';
const difficultyColor = (d: number) =>
  d === 1 ? 'var(--color-green)' : d === 2 ? 'var(--color-amber)' : 'var(--color-red)';

export const GroundForceScreen = ({ missionTemplateId, onReady }: Props) => {
  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [template, setTemplate] = useState<MissionTemplate | null>(null);
  const [ownedUnits, setOwnedUnits] = useState<OwnedGroundUnit[]>([]);
  const [aircraftList, setAircraftList] = useState<OwnedAircraft[]>([]);
  const [selectedUnitIds, setSelectedUnitIds] = useState<Set<number>>(new Set());
  const [selectedAircraftId, setSelectedAircraftId] = useState<number | null>(null);

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
        <p className="text-xs mt-1" style={{ color: 'var(--color-text-secondary)' }}>
          {template?.description}
        </p>
      </div>

      <div className="flex-1 overflow-y-auto pb-32 scroll-list">
        {/* Intel section */}
        <div className="px-4 pt-4 space-y-3">
          <div className="grid grid-cols-3 gap-2">
            {/* Terrain */}
            <div className="rounded-xl p-3 text-center" style={{ background: 'var(--color-surface)' }}>
              <p className="text-[10px] font-display tracking-wide mb-1" style={{ color: 'var(--color-text-muted)' }}>TERRAIN</p>
              <p className="font-display text-xs" style={{ color: 'var(--color-amber)' }}>{TERRAIN_LABELS[terrain] || terrain}</p>
            </div>
            {/* Difficulty */}
            <div className="rounded-xl p-3 text-center" style={{ background: 'var(--color-surface)' }}>
              <p className="text-[10px] font-display tracking-wide mb-1" style={{ color: 'var(--color-text-muted)' }}>THREAT</p>
              <p className="font-display text-xs" style={{ color: difficultyColor(difficulty) }}>
                {difficultyLabel(difficulty)}
              </p>
            </div>
            {/* Enemy size */}
            <div className="rounded-xl p-3 text-center" style={{ background: 'var(--color-surface)' }}>
              <p className="text-[10px] font-display tracking-wide mb-1" style={{ color: 'var(--color-text-muted)' }}>ENEMY</p>
              <p className="font-display text-xs" style={{ color: 'var(--color-red)' }}>
                {totalEnemyUnits} UNITS
              </p>
            </div>
          </div>

          {/* Terrain tip */}
          {TERRAIN_TIPS[terrain] && (
            <div
              className="flex items-start gap-2 rounded-xl p-3"
              style={{ background: 'rgba(212,168,67,0.08)', border: '1px solid rgba(212,168,67,0.2)' }}
            >
              <Info className="w-3.5 h-3.5 shrink-0 mt-0.5" style={{ color: 'var(--color-amber)' }} />
              <p className="text-xs" style={{ color: 'var(--color-text-secondary)' }}>{TERRAIN_TIPS[terrain]}</p>
            </div>
          )}

          {/* Enemy composition */}
          {Object.keys(enemyComp).length > 0 && (
            <div className="rounded-xl p-3" style={{ background: 'var(--color-surface)' }}>
              <p className="text-[10px] font-display tracking-wide mb-2" style={{ color: 'var(--color-text-muted)' }}>
                ENEMY COMPOSITION (CONFIRMED)
              </p>
              <div className="flex flex-wrap gap-2">
                {Object.entries(enemyComp).map(([type, count]) => (
                  <div
                    key={type}
                    className="flex items-center gap-1 px-2 py-1 rounded-lg"
                    style={{ background: 'rgba(229,62,62,0.1)', border: '1px solid rgba(229,62,62,0.25)' }}
                  >
                    <span className="font-data text-xs font-bold" style={{ color: 'var(--color-red)' }}>{count}×</span>
                    <span className="text-[11px]" style={{ color: 'var(--color-text-secondary)' }}>
                      {type.replace(/_/g, ' ')}
                    </span>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>

        {/* Ground force selection */}
        <div className="px-4 pt-5">
          <div className="flex items-center justify-between mb-3">
            <p className="text-[10px] font-display tracking-widest" style={{ color: 'var(--color-text-muted)' }}>
              SELECT GROUND FORCES
            </p>
            <span className="font-data text-xs" style={{ color: 'var(--color-amber)' }}>
              {selectedUnitIds.size} SELECTED
            </span>
          </div>

          {aliveUnits.length === 0 ? (
            <div
              className="rounded-xl p-5 text-center"
              style={{ background: 'var(--color-surface)', border: '1px solid var(--color-border)' }}
            >
              <AlertTriangle className="w-8 h-8 mx-auto mb-2" style={{ color: 'var(--color-amber)' }} />
              <p className="font-display text-sm mb-1" style={{ color: 'var(--color-text)' }}>NO GROUND FORCES</p>
              <p className="text-xs" style={{ color: 'var(--color-text-muted)' }}>
                Recruit units from the Barracks before deploying.
              </p>
            </div>
          ) : (
            <div className="space-y-2">
              {aliveUnits.map((owned) => {
                const isSelected = selectedUnitIds.has(owned.id);
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
                      <div
                        className="w-4 h-4 rounded-full border-2 flex items-center justify-center shrink-0"
                        style={{ borderColor: isSelected ? 'var(--color-amber)' : 'var(--color-border)' }}
                      >
                        {isSelected && (
                          <div className="w-2 h-2 rounded-full" style={{ background: 'var(--color-amber)' }} />
                        )}
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
                              className="h-full rounded-full"
                              style={{ width: `${owned.hp_pct}%`, background: hpColor(owned.hp_pct) }}
                            />
                          </div>
                          <span className="font-data text-[10px]" style={{ color: hpColor(owned.hp_pct) }}>
                            {owned.hp_pct.toFixed(0)}%
                          </span>
                        </div>
                      </div>
                      <div className="flex gap-2 shrink-0">
                        {[
                          { label: 'CP', val: owned.unit.combat_power },
                          { label: 'DEF', val: owned.unit.survivability },
                        ].map(({ label, val }) => (
                          <div key={label} className="text-center">
                            <p className="font-data text-[11px] font-bold" style={{ color: 'var(--color-text)' }}>{val}</p>
                            <p className="text-[9px]" style={{ color: 'var(--color-text-muted)' }}>{label}</p>
                          </div>
                        ))}
                      </div>
                    </div>
                  </button>
                );
              })}
            </div>
          )}
        </div>

        {/* Air support selection */}
        {aircraftList.length > 0 && (
          <div className="px-4 pt-5">
            <p className="text-[10px] font-display tracking-widest mb-3" style={{ color: 'var(--color-text-muted)' }}>
              AIR SUPPORT (OPTIONAL)
            </p>
            <div className="space-y-2">
              {/* None option */}
              <button
                onClick={() => setSelectedAircraftId(null)}
                className="w-full text-left rounded-xl p-3 transition-all"
                style={{
                  background: selectedAircraftId === null ? 'rgba(212,168,67,0.08)' : 'var(--color-surface)',
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
                      background: isSelected ? 'rgba(212,168,67,0.08)' : 'var(--color-surface)',
                      border: `1px solid ${isSelected ? 'var(--color-amber)' : 'var(--color-border)'}`,
                    }}
                  >
                    <div className="flex items-center gap-3">
                      <div
                        className="w-4 h-4 rounded-full border-2 flex items-center justify-center"
                        style={{ borderColor: isSelected ? 'var(--color-amber)' : 'var(--color-border)' }}
                      >
                        {isSelected && (
                          <div className="w-2 h-2 rounded-full" style={{ background: 'var(--color-amber)' }} />
                        )}
                      </div>
                      <Plane className="w-4 h-4 shrink-0" style={{ color: isSelected ? 'var(--color-amber)' : 'var(--color-text-muted)' }} />
                      <div className="flex-1 min-w-0">
                        <p className="text-sm" style={{ color: 'var(--color-text)' }}>{ac.name}</p>
                        <p className="text-[11px]" style={{ color: 'var(--color-text-muted)' }}>
                          {ac.origin} · {ac.condition}% condition
                        </p>
                      </div>
                      {isSelected && (
                        <CheckCircle2 className="w-4 h-4 shrink-0" style={{ color: 'var(--color-amber)' }} />
                      )}
                    </div>
                  </button>
                );
              })}
            </div>
          </div>
        )}
      </div>

      {/* Bottom action bar */}
      <div
        className="fixed bottom-0 left-0 right-0 px-4 pb-safe pb-6 pt-4"
        style={{ background: 'var(--color-base)', borderTop: '1px solid var(--color-border)' }}
      >
        <div className="flex items-center justify-between mb-3">
          <span className="text-xs" style={{ color: 'var(--color-text-muted)' }}>
            {selectedUnitIds.size} unit{selectedUnitIds.size !== 1 ? 's' : ''} selected
            {selectedAircraftId !== null ? ' · Air support attached' : ''}
          </span>
          <span className="font-data text-xs" style={{ color: 'var(--color-amber)' }}>
            ~${(template?.base_payout || 0).toLocaleString()} payout
          </span>
        </div>
        <button
          onClick={handleExecute}
          disabled={!canExecute}
          className="btn-primary w-full flex items-center justify-center gap-2 py-4"
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
