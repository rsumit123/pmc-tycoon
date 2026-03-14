import { useState } from 'react';
import {
  Crosshair,
  Fuel,
  Shield,
  AlertTriangle,
  Loader2,
  Plane,
  Anchor,
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

interface BattleScreenProps {
  battleId: number;
  battleType: string;
  initialState: BattleState;
  onComplete: (report: any) => void;
}

const riskColors: Record<string, string> = {
  low: 'bg-emerald-500/15 text-emerald-400',
  medium: 'bg-amber-500/15 text-amber-400',
  high: 'bg-red-500/15 text-red-400',
};

const qualityColors: Record<string, { bg: string; text: string; label: string }> = {
  optimal: { bg: 'bg-emerald-500/15', text: 'text-emerald-400', label: 'Optimal' },
  good: { bg: 'bg-blue-500/15', text: 'text-blue-400', label: 'Good' },
  neutral: { bg: 'bg-gray-500/15', text: 'text-gray-400', label: 'Neutral' },
  bad: { bg: 'bg-red-500/15', text: 'text-red-400', label: 'Poor' },
};

const choiceIcons: Record<string, string> = {
  aggressive_scan: '📡', passive_irst: '🔇', early_ecm: '📴',
  fire_at_rmax: '🚀', close_to_rne: '🎯', hold_and_maneuver: '🛡',
  chaff_break: '💨', notch_beam: '↗️', ecm_decoy: '📡',
  ir_missile: '🔥', guns_engage: '🔫', disengage: '🏃',
  press_attack: '⚔️', rtb: '🏠', call_reinforcements: '📻',
  helicopter_recon: '🚁', passive_sonar: '🔇', full_radar_sweep: '📡',
  full_salvo: '🚀', half_salvo: '🎯', sea_skim_profile: '🌊',
  observe: '👁', ecm_support: '📴', second_wave: '🚀',
  sam_priority: '🛡', ciws_reserve: '🔫', ecm_decoys: '📡',
  pursue: '⚔️', withdraw: '🏃', damage_control: '🔧',
};

export const BattleScreen = ({ battleId, battleType, initialState, onComplete }: BattleScreenProps) => {
  const [state, setState] = useState<BattleState>(initialState);
  const [phaseResult, setPhaseResult] = useState<PhaseResultData | null>(null);
  const [choosing, setChoosing] = useState(false);
  const [showingResult, setShowingResult] = useState(false);

  const handleChoice = async (choiceKey: string) => {
    setChoosing(true);
    try {
      const res = await apiService.submitChoice(battleId, choiceKey);
      const data: PhaseResultData = res.data;
      setPhaseResult(data);
      setShowingResult(true);

      if (data.battle_complete && data.final_report) {
        // Battle over — will show report after dismissing result
      }
    } catch (err) {
      console.error('Choice failed:', err);
    } finally {
      setChoosing(false);
    }
  };

  const handleNextPhase = async () => {
    if (phaseResult?.battle_complete) {
      const reportRes = await apiService.getBattleReport(battleId);
      onComplete(reportRes.data);
      return;
    }

    // Fetch updated state
    try {
      const res = await apiService.getBattleState(battleId);
      setState(res.data);
    } catch {
      // Use next_choices from result
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
  };

  const PlatformIcon = battleType === 'naval' ? Anchor : Plane;

  return (
    <div className="min-h-[100dvh] bg-gray-950 flex flex-col">
      {/* Phase header */}
      <div className="px-4 py-3 border-b border-gray-800/60 flex items-center justify-between">
        <div>
          <p className="text-[10px] text-emerald-400 uppercase tracking-widest font-bold">
            Phase {state.phase}/6
          </p>
          <h2 className="text-sm font-bold text-white">{state.phase_name}</h2>
        </div>
        <div className="text-right">
          <p className="text-xs text-gray-500">{state.player_name}</p>
          <p className="text-[10px] text-gray-600">vs {state.enemy_name}</p>
        </div>
      </div>

      {/* Tactical view */}
      <div className="flex-shrink-0 px-4 py-4">
        <div className="bg-gray-900 rounded-2xl border border-gray-800/60 p-4 relative overflow-hidden">
          {/* Radar sweep background */}
          <div className="absolute inset-0 opacity-5">
            <div
              className="w-full h-full radar-sweep"
              style={{
                background: 'conic-gradient(from 0deg, transparent 0deg, rgba(52,211,153,0.3) 30deg, transparent 60deg)',
                transformOrigin: '20% 50%',
              }}
            />
          </div>

          {/* Range display */}
          <div className="relative flex items-center justify-between mb-4">
            <div className="flex items-center gap-2">
              <div className="w-10 h-10 rounded-xl bg-emerald-500/15 flex items-center justify-center">
                <PlatformIcon className="w-5 h-5 text-emerald-400" />
              </div>
              <div>
                <p className="text-xs font-bold text-emerald-400">YOU</p>
                <p className="text-[10px] text-gray-500 truncate max-w-[80px]">{state.player_name}</p>
              </div>
            </div>

            <div className="flex-1 mx-3">
              <div className="flex items-center">
                <div className="flex-1 h-px bg-gray-700 relative">
                  <div className="absolute inset-0 flex items-center justify-center">
                    <span className="bg-gray-950 px-2 text-xs font-bold text-amber-400">
                      {state.range_km}km
                    </span>
                  </div>
                </div>
              </div>
            </div>

            <div className="flex items-center gap-2">
              <div className="text-right">
                <p className="text-xs font-bold text-red-400">ENEMY</p>
                <p className="text-[10px] text-gray-500 truncate max-w-[80px]">{state.enemy_name}</p>
              </div>
              <div className="w-10 h-10 rounded-xl bg-red-500/15 flex items-center justify-center">
                <PlatformIcon className="w-5 h-5 text-red-400" />
              </div>
            </div>
          </div>

          {/* Status bars */}
          <div className="grid grid-cols-2 gap-2">
            {/* Player status */}
            <div className="space-y-1.5">
              <div className="flex items-center gap-1.5">
                <Shield className="w-3 h-3 text-emerald-400" />
                <div className="flex-1 h-1.5 bg-gray-800 rounded-full overflow-hidden">
                  <div className="h-full bg-emerald-500 rounded-full transition-all" style={{ width: `${100 - state.player_damage_pct}%` }} />
                </div>
                <span className="text-[10px] text-gray-500 w-8 text-right">{(100 - state.player_damage_pct).toFixed(0)}%</span>
              </div>
              {state.player_fuel_pct !== undefined && (
                <div className="flex items-center gap-1.5">
                  <Fuel className="w-3 h-3 text-amber-400" />
                  <div className="flex-1 h-1.5 bg-gray-800 rounded-full overflow-hidden">
                    <div className="h-full bg-amber-500 rounded-full transition-all" style={{ width: `${state.player_fuel_pct}%` }} />
                  </div>
                  <span className="text-[10px] text-gray-500 w-8 text-right">{state.player_fuel_pct.toFixed(0)}%</span>
                </div>
              )}
            </div>
            {/* Enemy status */}
            <div className="space-y-1.5">
              <div className="flex items-center gap-1.5">
                <Shield className="w-3 h-3 text-red-400" />
                <div className="flex-1 h-1.5 bg-gray-800 rounded-full overflow-hidden">
                  <div className="h-full bg-red-500 rounded-full transition-all" style={{ width: `${100 - state.enemy_damage_pct}%` }} />
                </div>
                <span className="text-[10px] text-gray-500 w-8 text-right">{(100 - state.enemy_damage_pct).toFixed(0)}%</span>
              </div>
            </div>
          </div>

          {/* Ammo pips */}
          {state.player_ammo.length > 0 && (
            <div className="flex gap-2 mt-3 flex-wrap">
              {state.player_ammo.map((a, i) => (
                <div key={i} className="flex items-center gap-1 bg-gray-800/50 rounded-lg px-2 py-1">
                  <Crosshair className="w-2.5 h-2.5 text-gray-500" />
                  <span className="text-[10px] text-gray-400">{a.weapon_name}</span>
                  <span className="text-[10px] font-bold text-white">×{a.remaining}</span>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>

      {/* Phase result overlay OR choice panel */}
      {showingResult && phaseResult ? (
        <div className="flex-1 px-4 pb-6 overflow-y-auto">
          <div className="fade-slide-up space-y-3">
            {/* Result header */}
            <div className="flex items-center gap-2">
              <span className="text-sm font-bold text-white">{phaseResult.phase_name} Result</span>
              {(() => {
                const q = qualityColors[phaseResult.choice_quality] || qualityColors.neutral;
                return (
                  <span className={`text-[10px] font-bold px-2 py-0.5 rounded ${q.bg} ${q.text}`}>
                    {q.label} choice
                  </span>
                );
              })()}
            </div>

            {/* Pk / shot result */}
            {phaseResult.outcome?.player_shot && (
              <div className={`rounded-xl p-4 text-center ${phaseResult.outcome.player_shot.hit ? 'bg-emerald-500/10' : 'bg-red-500/10'}`}>
                <p className="text-xs text-gray-400 mb-1">{phaseResult.outcome.player_shot.weapon}</p>
                <p className="text-3xl font-bold text-white dice-roll">
                  {phaseResult.outcome.player_shot.hit ? '💥 HIT' : '💨 MISS'}
                </p>
                <p className="text-sm text-gray-400 mt-1">
                  Pk: {(phaseResult.outcome.player_shot.pk * 100).toFixed(0)}% — Roll: {phaseResult.outcome.player_shot.roll} vs {phaseResult.outcome.player_shot.needed}
                </p>
              </div>
            )}

            {/* Factor breakdown */}
            {phaseResult.factors.length > 0 && (
              <div className="space-y-1.5">
                <p className="text-[10px] text-gray-500 uppercase tracking-wider font-semibold">Factors</p>
                {phaseResult.factors.map((f, i) => (
                  <div key={i} className="flex items-center gap-2 bg-gray-900 rounded-lg px-3 py-2">
                    <span className={`text-xs ${
                      f.impact === 'positive' ? 'text-emerald-400' :
                      f.impact === 'negative' ? 'text-red-400' : 'text-gray-400'
                    }`}>
                      {f.impact === 'positive' ? '✅' : f.impact === 'negative' ? '⚠️' : 'ℹ️'}
                    </span>
                    <span className="text-xs text-gray-300 flex-1">{f.name}</span>
                    <span className="text-xs font-bold text-white">{f.value}</span>
                  </div>
                ))}
              </div>
            )}

            {/* Narrative */}
            <div className="bg-gray-900 rounded-xl p-3.5">
              <p className="text-xs text-gray-300 leading-relaxed">{phaseResult.narrative}</p>
            </div>

            {/* Incoming threat warning */}
            {phaseResult.outcome?.incoming_missile && (
              <div className="flex items-center gap-2 bg-red-500/10 rounded-xl px-3 py-2.5">
                <AlertTriangle className="w-4 h-4 text-red-400 shrink-0" />
                <p className="text-xs text-red-300 font-medium">
                  Incoming: {phaseResult.outcome.incoming_missile}!
                </p>
              </div>
            )}

            {/* Next phase button */}
            <button
              onClick={handleNextPhase}
              className="w-full flex items-center justify-center gap-2 bg-emerald-500 text-white font-semibold text-sm py-3.5 rounded-xl active:bg-emerald-600 transition-colors"
            >
              {phaseResult.battle_complete ? 'View After-Action Report' : 'Next Phase →'}
            </button>
          </div>
        </div>
      ) : (
        <div className="flex-1 px-4 pb-6 flex flex-col">
          {/* Situation ticker */}
          <div className="bg-gray-900/50 rounded-lg px-3 py-2 mb-3">
            <p className="text-xs text-gray-400">
              {state.phase === 2 && `Scanning for ${state.enemy_name}. Choose your detection approach.`}
              {state.phase === 3 && `Target at ${state.range_km}km. Choose your engagement strategy.`}
              {state.phase === 4 && `Incoming threats detected. Deploy countermeasures.`}
              {state.phase === 5 && `Close range — ${state.range_km.toFixed(0)}km. Choose your attack.`}
              {state.phase === 6 && `Assess damage and decide your next move.`}
            </p>
          </div>

          {/* Choice cards */}
          <div className="flex-1 space-y-2.5">
            {state.available_choices.map((choice) => (
              <button
                key={choice.key}
                onClick={() => handleChoice(choice.key)}
                disabled={choosing}
                className="w-full bg-gray-900 border border-gray-800/60 rounded-xl p-4 text-left card-press active:border-emerald-500/30 disabled:opacity-50 transition-all"
              >
                <div className="flex items-center gap-3">
                  <span className="text-2xl">{choiceIcons[choice.key] || '⚡'}</span>
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2">
                      <span className="text-sm font-semibold text-white">{choice.label}</span>
                      <span className={`text-[9px] font-bold uppercase px-1.5 py-0.5 rounded ${riskColors[choice.risk_hint] || riskColors.medium}`}>
                        {choice.risk_hint}
                      </span>
                    </div>
                    <p className="text-xs text-gray-500 mt-0.5">{choice.description}</p>
                  </div>
                  {choosing && <Loader2 className="w-4 h-4 text-gray-500 animate-spin shrink-0" />}
                </div>
              </button>
            ))}
          </div>
        </div>
      )}
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
