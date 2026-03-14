import { useState, useRef, useEffect } from 'react';
import {
  Crosshair,
  Fuel,
  Loader2,
  AlertTriangle,
  RotateCw,
} from 'lucide-react';
import { apiService } from '../../services/api';
import './animations.css';

interface BattleState {
  phase: number;
  phase_name: string;
  player_name: string;
  enemy_name: string;
  range_km: number;
  player_ammo: Array<{ weapon_name: string; remaining: number; type: string }>;
  player_fuel_pct: number;
  player_damage_pct: number;
  enemy_damage_pct: number;
  available_choices: Array<{ key: string; label: string; description: string; risk_hint: string }>;
  status: string;
}

interface PhaseResultData {
  phase_number: number;
  phase_name: string;
  player_choice: string;
  choice_quality: string;
  factors: Array<{ name: string; value: string; impact: string; description: string }>;
  outcome: any;
  narrative: string;
  next_choices: Array<{ key: string; label: string; description: string; risk_hint: string }>;
  battle_complete: boolean;
  final_report?: any;
}

interface LogEntry {
  prefix: string;
  color: string;
  text: string;
}

interface BattleScreenProps {
  battleId: number;
  battleType: string;
  initialState: BattleState;
  onComplete: (report: any) => void;
}

const riskColors: Record<string, string> = {
  low: 'border-emerald-500/40 text-emerald-400',
  medium: 'border-amber-500/40 text-amber-400',
  high: 'border-red-500/40 text-red-400',
};

const choiceIcons: Record<string, string> = {
  aggressive_scan: '📡', passive_irst: '👁', early_ecm: '📴',
  fire_at_rmax: '🚀', close_to_rne: '🎯', hold_and_maneuver: '🛡',
  chaff_break: '💨', notch_beam: '↗️', ecm_decoy: '🔰',
  ir_missile: '🔥', guns_engage: '🔫', disengage: '🏃',
  press_attack: '⚔️', rtb: '🏠', call_reinforcements: '📻',
  helicopter_recon: '🚁', passive_sonar: '🔇', full_radar_sweep: '📡',
  full_salvo: '🚀', half_salvo: '🎯', sea_skim_profile: '🌊',
  observe: '👁', ecm_support: '📴', second_wave: '🚀',
  sam_priority: '🛡', ciws_reserve: '🔫', ecm_decoys: '🔰',
  pursue: '⚔️', withdraw: '🏃', damage_control: '🔧',
};

export const BattleScreen = ({ battleId, battleType: _battleType, initialState, onComplete }: BattleScreenProps) => {
  const [state, setState] = useState<BattleState>(initialState);
  const [phaseResult, setPhaseResult] = useState<PhaseResultData | null>(null);
  const [choosing, setChoosing] = useState(false);
  const [selectedChoice, setSelectedChoice] = useState<string | null>(null);
  const [showingResult, setShowingResult] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [combatLog, setCombatLog] = useState<LogEntry[]>([
    { prefix: 'SYS', color: 'text-emerald-400', text: `BATTLE INITIATED — ${initialState.player_name} vs ${initialState.enemy_name}` },
    { prefix: 'SYS', color: 'text-gray-500', text: `Range: ${initialState.range_km}km — Awaiting orders...` },
  ]);
  const [screenEffect, setScreenEffect] = useState<string | null>(null);
  const [missileAnim, setMissileAnim] = useState<'fwd' | 'rev' | null>(null);
  const [nextPhaseLoading, setNextPhaseLoading] = useState(false);
  const logRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (logRef.current) {
      logRef.current.scrollTop = logRef.current.scrollHeight;
    }
  }, [combatLog]);

  const addLog = (prefix: string, color: string, text: string) => {
    setCombatLog((prev) => [...prev, { prefix, color, text }]);
  };

  const handleChoice = async (choiceKey: string) => {
    setChoosing(true);
    setSelectedChoice(choiceKey);
    setError(null);
    addLog('CMD', 'text-cyan-400', `Order: ${choiceKey.replace(/_/g, ' ').toUpperCase()}`);

    try {
      const res = await apiService.submitChoice(battleId, choiceKey);
      const data: PhaseResultData = res.data;
      setPhaseResult(data);
      setShowingResult(true);

      // Add log entries based on result
      addLog(data.phase_name.substring(0, 3).toUpperCase(), 'text-emerald-400', data.narrative);

      // Decision impact
      const qualityLabel = data.choice_quality === 'optimal' ? 'OPTIMAL' :
        data.choice_quality === 'good' ? 'GOOD' :
        data.choice_quality === 'neutral' ? 'NEUTRAL' : 'POOR';
      const qualityColor = data.choice_quality === 'optimal' ? 'text-emerald-400' :
        data.choice_quality === 'good' ? 'text-blue-400' :
        data.choice_quality === 'neutral' ? 'text-gray-400' : 'text-red-400';
      addLog('IMPACT', qualityColor, `Decision rated: ${qualityLabel}`);

      // Factor logs
      for (const f of data.factors) {
        if (f.impact === 'positive') {
          addLog('+', 'text-emerald-400', `${f.name}: ${f.value}`);
        } else if (f.impact === 'negative') {
          addLog('!', 'text-red-400', `${f.name}: ${f.value}`);
        }
      }

      // Animations based on outcome
      const shot = data.outcome?.player_shot;
      if (shot) {
        setMissileAnim('fwd');
        setTimeout(() => {
          setMissileAnim(null);
          if (shot.hit) {
            setScreenEffect('hit-flash-green');
            addLog('HIT', 'text-emerald-400', `${shot.weapon} — TARGET HIT (Pk ${(shot.pk * 100).toFixed(0)}%, roll ${shot.roll})`);
          } else {
            addLog('MISS', 'text-red-400', `${shot.weapon} — MISS (Pk ${(shot.pk * 100).toFixed(0)}%, roll ${shot.roll})`);
          }
          setTimeout(() => setScreenEffect(null), 800);
        }, 1500);
      }

      // Naval salvo hits
      if (data.outcome?.hits !== undefined && data.outcome?.damage !== undefined) {
        if (data.outcome.hits > 0) {
          setMissileAnim('fwd');
          setTimeout(() => {
            setMissileAnim(null);
            setScreenEffect('hit-flash-green');
            addLog('HIT', 'text-emerald-400', `${data.outcome.hits} missile(s) struck target — ${data.outcome.damage.toFixed(0)}% damage`);
            setTimeout(() => setScreenEffect(null), 800);
          }, 1500);
        }
      }

      // Naval incoming hits
      if (data.outcome?.hits_taken !== undefined && data.outcome.hits_taken > 0) {
        setTimeout(() => {
          setMissileAnim('rev');
          setTimeout(() => {
            setMissileAnim(null);
            setScreenEffect('damage-vignette');
            addLog('DMG', 'text-red-400', `${data.outcome.hits_taken} missile(s) hit — ${data.outcome.damage?.toFixed(0) || '?'}% damage taken`);
            setTimeout(() => setScreenEffect(null), 1000);
          }, 1200);
        }, 500);
      }

      // Incoming missile (air combat)
      if (data.outcome?.enemy_shot?.hit && !data.outcome?.survived) {
        setTimeout(() => {
          setMissileAnim('rev');
          setTimeout(() => {
            setMissileAnim(null);
            setScreenEffect('damage-vignette');
            addLog('DMG', 'text-red-400', `HIT TAKEN — Hull integrity: ${(100 - (data.outcome?.player_damage_pct || 0)).toFixed(0)}%`);
            setTimeout(() => setScreenEffect(null), 1000);
          }, 1200);
        }, 2000);
      }

      // Update state from factors
      if (data.outcome?.player_damage_pct !== undefined) {
        setState((prev) => ({ ...prev, player_damage_pct: data.outcome.player_damage_pct }));
      }
      if (data.outcome?.enemy_damage_pct !== undefined) {
        setState((prev) => ({ ...prev, enemy_damage_pct: data.outcome.enemy_damage_pct }));
      }
      // Update damage from naval "damage" field
      if (data.outcome?.damage !== undefined && data.outcome?.hits !== undefined) {
        setState((prev) => ({ ...prev, enemy_damage_pct: prev.enemy_damage_pct + data.outcome.damage }));
      }

    } catch (err: any) {
      console.error('Choice failed:', err);
      const msg = err?.response?.data?.detail || 'Connection error — check your network';
      setError(msg);
      addLog('ERR', 'text-red-400', `COMMS FAILURE: ${msg}`);
    } finally {
      setChoosing(false);
      setSelectedChoice(null);
    }
  };

  const handleRetry = () => {
    setError(null);
  };

  const handleNextPhase = async () => {
    if (phaseResult?.battle_complete) {
      setNextPhaseLoading(true);
      try {
        const reportRes = await apiService.getBattleReport(battleId);
        onComplete(reportRes.data);
      } catch {
        addLog('ERR', 'text-red-400', 'Failed to load report — retrying...');
        setNextPhaseLoading(false);
      }
      return;
    }

    setNextPhaseLoading(true);
    try {
      const res = await apiService.getBattleState(battleId);
      setState(res.data);
      addLog('SYS', 'text-gray-500', `Phase ${res.data.phase}: ${res.data.phase_name} — Range: ${res.data.range_km}km`);
    } catch {
      if (phaseResult) {
        setState((prev) => ({
          ...prev,
          phase: phaseResult.phase_number + 1,
          phase_name: getNextPhaseName(phaseResult.phase_number + 1),
          available_choices: phaseResult.next_choices,
        }));
      }
    }
    setPhaseResult(null);
    setShowingResult(false);
    setNextPhaseLoading(false);
  };

  const playerHp = Math.max(0, 100 - state.player_damage_pct);
  const enemyHp = Math.max(0, 100 - state.enemy_damage_pct);

  return (
    <div className={`min-h-[100dvh] bg-gray-950 flex flex-col hud-grid hud-scanlines relative ${screenEffect === 'damage-vignette' ? 'screen-shake' : ''}`}>
      {/* Screen effects */}
      {screenEffect && <div className={screenEffect} />}

      {/* ═══ HUD TOP BAR ═══ */}
      <div className="px-3 py-2 flex items-center justify-between border-b border-emerald-500/10">
        <div className="hud-text">
          <span className="text-[9px] text-emerald-400/60">PHASE</span>
          <span className="text-sm font-bold text-emerald-400 hud-glow ml-1">{state.phase}/6</span>
          <span className="text-xs text-emerald-400/80 ml-2">{state.phase_name.toUpperCase()}</span>
        </div>
        <div className="hud-text text-right">
          <span className="text-[9px] text-gray-500">RNG</span>
          <span className="text-sm font-bold text-amber-400 hud-glow-amber ml-1">{state.range_km.toFixed(0)}km</span>
        </div>
      </div>

      {/* ═══ HUD TACTICAL VIEW ═══ */}
      <div className="px-3 py-3 relative">
        <div className="hud-border rounded-xl p-3 relative overflow-hidden bg-gray-950/80">
          {/* Radar sweep background */}
          <div className="absolute inset-0 opacity-[0.03]">
            <div
              className="w-full h-full radar-sweep"
              style={{
                background: 'conic-gradient(from 0deg, transparent 0deg, rgba(34,197,94,0.4) 20deg, transparent 40deg)',
                transformOrigin: '15% 50%',
              }}
            />
          </div>

          {/* Combatants display */}
          <div className="relative flex items-center justify-between mb-3">
            {/* Player */}
            <div className="text-center">
              <div className="w-14 h-14 rounded-lg hud-border flex items-center justify-center bg-emerald-500/5 mb-1">
                <span className="text-2xl">✈</span>
              </div>
              <p className="text-[9px] text-emerald-400 hud-text font-bold truncate max-w-[70px]">{state.player_name.split(' ').pop()}</p>
            </div>

            {/* Range line with missile animation */}
            <div className="flex-1 mx-3 relative h-8 flex items-center">
              <div className="w-full h-px bg-emerald-500/20 relative">
                {/* Engagement zone markers */}
                <div className="absolute top-1/2 left-1/3 w-px h-3 -translate-y-1/2 bg-amber-500/30" />
                <div className="absolute top-1/2 left-2/3 w-px h-3 -translate-y-1/2 bg-red-500/30" />
              </div>
              {/* Missile trail animation */}
              {missileAnim === 'fwd' && (
                <div className="absolute inset-y-0 left-0 flex items-center">
                  <div className="h-0.5 bg-gradient-to-r from-emerald-400 to-transparent missile-trail-fwd" style={{ maxWidth: '100%' }} />
                </div>
              )}
              {missileAnim === 'rev' && (
                <div className="absolute inset-y-0 right-0 flex items-center justify-end">
                  <div className="h-0.5 bg-gradient-to-l from-red-400 to-transparent missile-trail-rev" style={{ maxWidth: '100%' }} />
                </div>
              )}
              <div className="absolute top-full left-1/2 -translate-x-1/2 mt-0.5">
                <span className="text-[9px] text-gray-600 hud-text">{state.range_km.toFixed(0)}KM</span>
              </div>
            </div>

            {/* Enemy */}
            <div className="text-center">
              <div className={`w-14 h-14 rounded-lg flex items-center justify-center mb-1 ${
                enemyHp < 30 ? 'hud-border-red bg-red-500/5' : 'hud-border-amber bg-amber-500/5'
              }`}>
                <span className="text-2xl">◇</span>
              </div>
              <p className="text-[9px] text-red-400 hud-text font-bold truncate max-w-[70px]">{state.enemy_name.split(' ').pop()}</p>
            </div>
          </div>

          {/* HP bars */}
          <div className="grid grid-cols-2 gap-3 mb-2">
            <div>
              <div className="flex items-center justify-between mb-0.5">
                <span className="text-[8px] text-emerald-400/60 hud-text">HULL</span>
                <span className="text-[9px] text-emerald-400 hud-text font-bold">{playerHp.toFixed(0)}%</span>
              </div>
              <div className="h-1.5 bg-gray-800 rounded-full overflow-hidden">
                <div className={`h-full rounded-full transition-all duration-700 ${playerHp > 60 ? 'bg-emerald-500' : playerHp > 30 ? 'bg-amber-500' : 'bg-red-500'}`} style={{ width: `${playerHp}%` }} />
              </div>
            </div>
            <div>
              <div className="flex items-center justify-between mb-0.5">
                <span className="text-[8px] text-red-400/60 hud-text">TGT</span>
                <span className="text-[9px] text-red-400 hud-text font-bold">{enemyHp.toFixed(0)}%</span>
              </div>
              <div className="h-1.5 bg-gray-800 rounded-full overflow-hidden">
                <div className={`h-full rounded-full transition-all duration-700 ${enemyHp > 60 ? 'bg-red-500' : enemyHp > 30 ? 'bg-amber-500' : 'bg-emerald-500'}`} style={{ width: `${enemyHp}%` }} />
              </div>
            </div>
          </div>

          {/* Ammo + Fuel strip */}
          <div className="flex gap-2 flex-wrap">
            {state.player_ammo.map((a, i) => (
              <div key={i} className="flex items-center gap-1 bg-gray-900/60 rounded px-1.5 py-0.5">
                <Crosshair className="w-2.5 h-2.5 text-emerald-400/60" />
                <span className="text-[8px] text-gray-400 hud-text">{a.weapon_name.split(' ').pop()}</span>
                <span className="text-[9px] font-bold text-emerald-400 hud-text">{a.remaining}</span>
              </div>
            ))}
            {state.player_fuel_pct !== undefined && (
              <div className="flex items-center gap-1 bg-gray-900/60 rounded px-1.5 py-0.5">
                <Fuel className="w-2.5 h-2.5 text-amber-400/60" />
                <span className="text-[9px] font-bold text-amber-400 hud-text">{state.player_fuel_pct.toFixed(0)}%</span>
              </div>
            )}
          </div>
        </div>
      </div>

      {/* ═══ COMBAT LOG ═══ */}
      <div
        ref={logRef}
        className="mx-3 h-28 overflow-y-auto border-y border-emerald-500/10 bg-gray-950/90 py-1.5 px-2 space-y-0.5"
      >
        {combatLog.map((entry, i) => (
          <div key={i} className={`log-entry flex gap-2 text-[10px] hud-text leading-tight ${i === combatLog.length - 1 ? '' : 'opacity-70'}`}>
            <span className={`${entry.color} font-bold shrink-0 w-12 text-right`}>[{entry.prefix}]</span>
            <span className="text-gray-300">{entry.text}</span>
          </div>
        ))}
      </div>

      {/* ═══ CHOICE PANEL / RESULT ═══ */}
      <div className="flex-1 px-3 py-2 flex flex-col min-h-0">
        {/* Error banner */}
        {error && !showingResult && (
          <div className="mb-2 rounded-xl bg-red-500/10 border border-red-500/30 p-3 flex items-center gap-3">
            <AlertTriangle className="w-5 h-5 text-red-400 shrink-0" />
            <div className="flex-1 min-w-0">
              <p className="text-xs text-red-400 font-semibold">COMMS FAILURE</p>
              <p className="text-[10px] text-red-300/70 mt-0.5">{error}</p>
            </div>
            <button
              onClick={handleRetry}
              className="shrink-0 flex items-center gap-1 text-xs font-semibold text-red-400 bg-red-500/20 px-3 py-1.5 rounded-lg active:bg-red-500/30"
            >
              <RotateCw className="w-3 h-3" />
              Dismiss
            </button>
          </div>
        )}

        {showingResult && phaseResult ? (
          <div className="flex-1 flex flex-col phase-slide-in">
            {/* Result summary — player shot (air) */}
            {phaseResult.outcome?.player_shot && (
              <div className={`rounded-xl p-3 mb-2 text-center ${phaseResult.outcome.player_shot.hit ? 'bg-emerald-500/10 hud-border' : 'bg-red-500/10 hud-border-red'}`}>
                <p className="text-2xl font-black hud-text result-reveal">
                  {phaseResult.outcome.player_shot.hit
                    ? <span className="text-emerald-400 hud-glow">TARGET HIT</span>
                    : <span className="text-red-400 hud-glow-red">MISS</span>
                  }
                </p>
                <p className="text-xs text-gray-400 hud-text mt-1">
                  {phaseResult.outcome.player_shot.weapon} — Pk {(phaseResult.outcome.player_shot.pk * 100).toFixed(0)}% — Roll {phaseResult.outcome.player_shot.roll} vs {phaseResult.outcome.player_shot.needed}
                </p>
              </div>
            )}

            {/* Result summary — salvo (naval) */}
            {phaseResult.outcome?.hits !== undefined && phaseResult.outcome?.leakers !== undefined && (
              <div className={`rounded-xl p-3 mb-2 text-center ${phaseResult.outcome.hits > 0 ? 'bg-emerald-500/10 hud-border' : 'bg-amber-500/10 hud-border-amber'}`}>
                <p className="text-2xl font-black hud-text result-reveal">
                  {phaseResult.outcome.hits > 0
                    ? <span className="text-emerald-400 hud-glow">{phaseResult.outcome.hits} HIT{phaseResult.outcome.hits > 1 ? 'S' : ''}</span>
                    : <span className="text-amber-400 hud-glow-amber">ALL INTERCEPTED</span>
                  }
                </p>
                {phaseResult.outcome.damage !== undefined && (
                  <p className="text-xs text-gray-400 hud-text mt-1">
                    {phaseResult.outcome.leakers} leaker{phaseResult.outcome.leakers !== 1 ? 's' : ''} — {phaseResult.outcome.damage.toFixed(0)}% damage dealt
                  </p>
                )}
              </div>
            )}

            {/* Result summary — incoming hits taken (naval) */}
            {phaseResult.outcome?.hits_taken !== undefined && (
              <div className={`rounded-xl p-3 mb-2 text-center ${phaseResult.outcome.hits_taken > 0 ? 'bg-red-500/10 hud-border-red' : 'bg-emerald-500/10 hud-border'}`}>
                <p className="text-2xl font-black hud-text result-reveal">
                  {phaseResult.outcome.hits_taken > 0
                    ? <span className="text-red-400 hud-glow-red">{phaseResult.outcome.hits_taken} HIT{phaseResult.outcome.hits_taken > 1 ? 'S' : ''} TAKEN</span>
                    : <span className="text-emerald-400 hud-glow">ALL INTERCEPTED</span>
                  }
                </p>
              </div>
            )}

            {/* Narrative */}
            {phaseResult.narrative && !phaseResult.outcome?.player_shot && phaseResult.outcome?.hits === undefined && phaseResult.outcome?.hits_taken === undefined && (
              <div className="rounded-xl bg-gray-900/60 p-3 mb-2">
                <p className="text-xs text-gray-300 hud-text leading-relaxed">{phaseResult.narrative}</p>
              </div>
            )}

            {/* Factors */}
            {phaseResult.factors.length > 0 && (
              <div className="space-y-1 mb-2 max-h-24 overflow-y-auto">
                {phaseResult.factors.slice(0, 6).map((f, i) => (
                  <div key={i} className="flex items-center gap-2 text-[10px] hud-text">
                    <span className={f.impact === 'positive' ? 'text-emerald-400' : f.impact === 'negative' ? 'text-red-400' : 'text-gray-500'}>
                      {f.impact === 'positive' ? '▲' : f.impact === 'negative' ? '▼' : '●'}
                    </span>
                    <span className="text-gray-400 flex-1 truncate">{f.name}</span>
                    <span className="text-white font-bold">{f.value}</span>
                  </div>
                ))}
              </div>
            )}

            <div className="mt-auto">
              <button
                onClick={handleNextPhase}
                disabled={nextPhaseLoading}
                className="w-full flex items-center justify-center gap-2 bg-emerald-500 text-black font-bold text-sm py-3 rounded-xl active:bg-emerald-400 disabled:opacity-60 transition-colors hud-text tracking-wider"
              >
                {nextPhaseLoading ? (
                  <Loader2 className="w-4 h-4 animate-spin" />
                ) : (
                  phaseResult.battle_complete ? '▶ VIEW REPORT' : `▶ PHASE ${phaseResult.phase_number + 1}`
                )}
              </button>
            </div>
          </div>
        ) : (
          <div className="flex-1 flex flex-col">
            {/* Sending indicator */}
            {choosing && (
              <div className="mb-2 rounded-xl bg-emerald-500/5 border border-emerald-500/20 p-2.5 flex items-center gap-2">
                <Loader2 className="w-4 h-4 text-emerald-400 animate-spin shrink-0" />
                <span className="text-xs text-emerald-400 hud-text">TRANSMITTING ORDERS...</span>
              </div>
            )}

            <div className="flex-1 space-y-2">
              {state.available_choices.map((choice) => {
                const isSelected = selectedChoice === choice.key;
                return (
                  <button
                    key={choice.key}
                    onClick={() => handleChoice(choice.key)}
                    disabled={choosing}
                    className={`w-full rounded-xl p-3 text-left transition-all active:scale-[0.98] disabled:opacity-40 hud-border bg-gray-950/80 ${
                      isSelected ? 'border-emerald-500/60 bg-emerald-500/10' : riskColors[choice.risk_hint] || ''
                    }`}
                  >
                    <div className="flex items-center gap-3">
                      <span className="text-xl shrink-0">{choiceIcons[choice.key] || '⚡'}</span>
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2">
                          <span className="text-sm font-bold text-white hud-text">{choice.label.toUpperCase()}</span>
                          <span className={`text-[8px] font-bold uppercase px-1.5 py-0.5 rounded border hud-text ${riskColors[choice.risk_hint] || 'border-gray-600 text-gray-400'}`}>
                            {choice.risk_hint}
                          </span>
                        </div>
                        <p className="text-[10px] text-gray-500 mt-0.5 hud-text">{choice.description}</p>
                      </div>
                      {isSelected && choosing && <Loader2 className="w-4 h-4 text-emerald-400 animate-spin shrink-0" />}
                    </div>
                  </button>
                );
              })}
            </div>
          </div>
        )}
      </div>
    </div>
  );
};

function getNextPhaseName(phase: number): string {
  const names: Record<number, string> = {
    2: 'Detection', 3: 'BVR Engagement', 4: 'Countermeasures',
    5: 'Close-In Combat', 6: 'Damage & Disengage',
  };
  return names[phase] || 'Complete';
}
