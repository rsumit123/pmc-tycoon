import { useState, useRef, useEffect } from 'react';
import {
  Anchor,
  Crosshair,
  Loader2,
  AlertTriangle,
  RotateCw,
  Radio,
  Shield,
  Wrench,
} from 'lucide-react';
import { apiService } from '../../services/api';
import '../../styles/design-system.css';
import './animations.css';

interface NavalAction {
  key: string;
  label: string;
  description: string;
  risk_hint: string;
  salvo_size?: number | null;
}

interface CompartmentData {
  name: string;
  hp_pct: number;
}

interface NavalState {
  engine_version: number;
  turn: number;
  max_turns: number;
  phase: string; // "approach", "exchange", "aftermath"
  range_km: number;
  player_name: string;
  enemy_name: string;
  player_compartments: CompartmentData[];
  enemy_compartments_known: CompartmentData[];
  player_missiles_remaining: number;
  player_sam_ready: boolean;
  player_ciws_ready: boolean;
  ecm_charges: number;
  available_actions: NavalAction[];
  status: string;
  exit_reason?: string;
}

interface NavalTurnResult {
  engine_version: number;
  turn_number: number;
  phase: string;
  player_action: string;
  enemy_action: string;
  player_salvo_fired: number;
  player_hits: number;
  player_damage_dealt: number;
  enemy_salvo_fired: number;
  enemy_hits: number;
  enemy_damage_taken: number;
  compartment_hit?: string;
  damage_repaired: number;
  range_change: number;
  new_range: number;
  intel_revealed?: string;
  narrative: string;
  factors: Array<{ name: string; value: string; impact: string; description: string }>;
  next_actions: NavalAction[];
  state: NavalState;
  battle_complete: boolean;
  final_report?: any;
}

interface LogEntry { prefix: string; color: string; text: string; }

interface TacticalNavalScreenProps {
  battleId: number;
  initialState: NavalState;
  objective?: string;
  onComplete: (report: any) => void;
}

const OBJECTIVE_DISPLAY: Record<string, string> = {
  air_superiority: 'NEUTRALIZE HOSTILE AIRCRAFT',
  interception: 'INTERCEPT — TARGET IS FLEEING',
  escort: 'PROTECT CONVOY — SURVIVE WITH <50% DMG',
  strike: 'REACH TARGET ZONE (<20KM)',
  recon: 'SCAN ALL INTEL & EXTRACT',
  naval_patrol: 'ENGAGE ENEMY VESSEL',
  blockade_run: 'BREAK THROUGH BLOCKADE',
  fleet_defense: 'DEFEND POSITION',
};

const phaseBadge: Record<string, { bg: string; text: string }> = {
  approach: { bg: 'bg-accent-blue/20', text: 'text-accent-blue' },
  exchange: { bg: 'bg-accent-red/20', text: 'text-accent-red' },
  aftermath: { bg: 'bg-accent-amber/20', text: 'text-accent-amber' },
};

const compartmentColor = (hp: number) => hp > 60 ? 'var(--color-green)' : hp > 30 ? 'var(--color-amber)' : 'var(--color-red)';
const compartmentBg = (hp: number) => hp > 60 ? 'gauge-fill-green' : hp > 30 ? 'gauge-fill-amber' : 'gauge-fill-red';
const compartmentLabel: Record<string, string> = { hull: 'HULL', engines: 'ENG', radar: 'RDR', weapons: 'WPN' };

const withTimeout = <T,>(promise: Promise<T>, ms: number): Promise<T> =>
  Promise.race([promise, new Promise<never>((_, rej) => setTimeout(() => rej(new Error('Request timed out')), ms))]);

export const TacticalNavalScreen = ({ battleId, initialState, objective, onComplete }: TacticalNavalScreenProps) => {
  const [state, setState] = useState<NavalState>(initialState);
  const [turnResult, setTurnResult] = useState<NavalTurnResult | null>(null);
  const [choosing, setChoosing] = useState(false);
  const [selectedAction, setSelectedAction] = useState<string | null>(null);
  const [showingResult, setShowingResult] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [pendingAction, setPendingAction] = useState<NavalAction | null>(null);
  const [combatLog, setCombatLog] = useState<LogEntry[]>([
    { prefix: 'SYS', color: 'text-accent-amber', text: `NAVAL ENGAGEMENT — ${initialState.player_name} vs ${initialState.enemy_name}` },
    { prefix: 'SYS', color: 'text-ink-secondary', text: `Range: ${initialState.range_km}km — Phase: ${initialState.phase.toUpperCase()} — Awaiting orders...` },
  ]);
  const [screenEffect, setScreenEffect] = useState<string | null>(null);
  const [nextTurnLoading, setNextTurnLoading] = useState(false);
  const logRef = useRef<HTMLDivElement>(null);

  useEffect(() => { if (logRef.current) logRef.current.scrollTop = logRef.current.scrollHeight; }, [combatLog]);

  const addLog = (prefix: string, color: string, text: string) => {
    setCombatLog(prev => [...prev, { prefix, color, text }]);
  };

  const handleAction = async (action: NavalAction) => {
    setChoosing(true);
    setSelectedAction(action.key);
    setError(null);
    setPendingAction(action);
    addLog('CMD', 'text-cyan-400', `Order: ${action.label.toUpperCase()}`);

    try {
      const res = await withTimeout(apiService.submitChoice(battleId, action.key), 10000);
      const data: NavalTurnResult = res.data;
      setTurnResult(data);
      setShowingResult(true);
      setPendingAction(null);
      if (data.state) setState(data.state);

      addLog('TRN', 'text-accent-amber', data.narrative);

      if (data.player_hits > 0) {
        addLog('HIT', 'text-accent-green', `${data.player_hits} missile(s) hit — ${data.player_damage_dealt.toFixed(0)}% damage dealt`);
        setScreenEffect('hit-flash-green');
        setTimeout(() => setScreenEffect(null), 600);
      } else if (data.player_salvo_fired > 0) {
        addLog('MISS', 'text-accent-red', `Salvo intercepted — 0 hits from ${data.player_salvo_fired} missiles`);
      }

      if (data.enemy_hits > 0) {
        addLog('DMG', 'text-accent-red', `${data.enemy_hits} incoming hit(s) — ${data.enemy_damage_taken.toFixed(0)}% damage${data.compartment_hit ? ` (${data.compartment_hit})` : ''}`);
        setTimeout(() => { setScreenEffect('damage-vignette'); setTimeout(() => setScreenEffect(null), 600); }, 400);
      } else if (data.enemy_salvo_fired > 0) {
        addLog('DEF', 'text-accent-green', `Incoming salvo intercepted — ${data.enemy_salvo_fired} missiles defeated`);
      }

      if (data.damage_repaired > 0) addLog('RPR', 'text-accent-blue', `Damage control: +${data.damage_repaired.toFixed(0)}% repaired`);
      if (data.intel_revealed) addLog('INTEL', 'text-violet-400', `INTEL: Enemy ${data.intel_revealed} status revealed`);
      if (Math.abs(data.range_change) > 1) addLog('NAV', 'text-ink-secondary', `Range: ${data.new_range.toFixed(0)}km (${data.range_change > 0 ? '+' : ''}${data.range_change.toFixed(0)}km)`);
      if (data.phase !== state.phase) addLog('PHASE', 'text-accent-amber', `Phase: ${data.phase.toUpperCase()}`);

    } catch (err: any) {
      const msg = err?.message === 'Request timed out' ? 'Request timed out' : (err?.response?.data?.detail || 'Connection error');
      setError(msg);
      addLog('ERR', 'text-accent-red', `COMMS FAILURE: ${msg}`);
    } finally { setChoosing(false); setSelectedAction(null); }
  };

  const handleRetry = () => { setError(null); if (pendingAction) handleAction(pendingAction); };

  const handleNextTurn = async () => {
    if (turnResult?.battle_complete) {
      setNextTurnLoading(true);
      try { const r = await withTimeout(apiService.getBattleReport(battleId), 10000); onComplete(r.data); }
      catch { addLog('ERR', 'text-accent-red', 'Failed to load report'); setNextTurnLoading(false); }
      return;
    }
    if (turnResult?.state) setState(turnResult.state);
    setTurnResult(null);
    setShowingResult(false);
  };

  const phase = phaseBadge[state.phase] || phaseBadge.approach;

  return (
    <div className={`min-h-[100dvh] bg-dossier-base flex flex-col relative ${screenEffect === 'damage-vignette' ? 'screen-shake' : ''}`}>
      {screenEffect && <div className={screenEffect} />}

      {/* ═══ TOP BAR ═══ */}
      <div className="px-3 py-2 flex items-center justify-between" style={{ borderBottom: '1px solid var(--color-border)' }}>
        <div className="font-data flex items-center gap-2">
          <span className="text-[10px]" style={{ color: 'var(--color-text-muted)' }}>TURN</span>
          <span className="text-sm font-bold" style={{ color: 'var(--color-amber)' }}>{state.turn}/{state.max_turns}</span>
          <span className={`text-[10px] font-bold uppercase px-1.5 py-0.5 rounded border font-display ${phase.bg} ${phase.text}`}>
            {state.phase}
          </span>
        </div>
        <div className="font-data flex items-center gap-3">
          <span className="text-sm font-bold" style={{ color: 'var(--color-blue)' }}>{state.range_km.toFixed(0)}km</span>
          <div className="flex items-center gap-1">
            <Crosshair className="w-3 h-3" style={{ color: 'var(--color-amber)' }} />
            <span className="text-xs font-bold" style={{ color: state.player_missiles_remaining === 0 ? 'var(--color-red)' : 'var(--color-amber)' }}>
              {state.player_missiles_remaining}
            </span>
          </div>
        </div>
      </div>

      {/* ═══ OBJECTIVE BAR ═══ */}
      {objective && (
        <div className="px-3 py-1.5" style={{ background: 'rgba(212,168,67,0.06)', borderBottom: '1px solid var(--color-border)' }}>
          <div className="flex items-center gap-2">
            <span className="text-[10px] font-display tracking-wider" style={{ color: 'var(--color-amber)' }}>OBJECTIVE</span>
            <span className="text-xs font-data" style={{ color: 'var(--color-text)' }}>{OBJECTIVE_DISPLAY[objective] || objective.replace(/_/g, ' ').toUpperCase()}</span>
          </div>
        </div>
      )}

      {/* ═══ TACTICAL VIEW ═══ */}
      <div className="px-3 py-2">
        <div className="card-dossier p-3">
          {/* Ships */}
          <div className="flex items-center justify-between mb-3">
            <div className="text-center">
              <div className="w-12 h-12 rounded-lg flex items-center justify-center mb-1" style={{ border: '1px solid var(--color-amber-dim)', background: 'rgba(212,168,67,0.05)' }}>
                <Anchor className="w-5 h-5" style={{ color: 'var(--color-amber)' }} />
              </div>
              <p className="text-[10px] font-data font-bold truncate max-w-[64px]" style={{ color: 'var(--color-amber)' }}>{state.player_name.split(' ').pop()}</p>
            </div>

            <div className="flex-1 mx-3 relative h-4 flex items-center">
              <div className="w-full h-px" style={{ background: 'var(--color-border)' }} />
              <div className="absolute top-full left-1/2 -translate-x-1/2 mt-1">
                <span className="text-[10px] font-data" style={{ color: 'var(--color-text-muted)' }}>{state.range_km.toFixed(0)}KM</span>
              </div>
            </div>

            <div className="text-center">
              <div className="w-12 h-12 rounded-lg flex items-center justify-center mb-1" style={{ border: '1px solid var(--color-red-dim)', background: 'rgba(196,69,60,0.05)' }}>
                <Anchor className="w-5 h-5" style={{ color: 'var(--color-red)' }} />
              </div>
              <p className="text-[10px] font-data font-bold truncate max-w-[64px]" style={{ color: 'var(--color-red)' }}>{state.enemy_name.split(' ').pop()}</p>
            </div>
          </div>

          {/* Compartments */}
          <div className="grid grid-cols-2 gap-x-4 gap-y-1.5">
            {/* Player compartments */}
            <div>
              <p className="text-[9px] font-display tracking-wider mb-1" style={{ color: 'var(--color-text-muted)' }}>YOUR SHIP</p>
              {state.player_compartments.map(c => (
                <div key={c.name} className="flex items-center gap-1.5 mb-1">
                  <span className="text-[9px] font-display tracking-wider w-8" style={{ color: 'var(--color-text-muted)' }}>{compartmentLabel[c.name] || c.name}</span>
                  <div className="flex-1 gauge-bar" style={{ height: '4px' }}>
                    <div className={`gauge-fill ${compartmentBg(c.hp_pct)}`} style={{ width: `${c.hp_pct}%` }} />
                  </div>
                  <span className="text-[9px] font-data font-bold w-8 text-right" style={{ color: compartmentColor(c.hp_pct) }}>{c.hp_pct.toFixed(0)}%</span>
                </div>
              ))}
            </div>
            {/* Enemy compartments */}
            <div>
              <p className="text-[9px] font-display tracking-wider mb-1" style={{ color: 'var(--color-text-muted)' }}>ENEMY</p>
              {state.enemy_compartments_known.length > 0 ? state.enemy_compartments_known.map(c => (
                <div key={c.name} className="flex items-center gap-1.5 mb-1">
                  <span className="text-[9px] font-display tracking-wider w-8" style={{ color: 'var(--color-text-muted)' }}>{compartmentLabel[c.name] || c.name}</span>
                  <div className="flex-1 gauge-bar" style={{ height: '4px' }}>
                    <div className={`gauge-fill ${compartmentBg(c.hp_pct)}`} style={{ width: `${c.hp_pct}%` }} />
                  </div>
                  <span className="text-[9px] font-data font-bold w-8 text-right" style={{ color: compartmentColor(c.hp_pct) }}>{c.hp_pct.toFixed(0)}%</span>
                </div>
              )) : (
                <div className="flex items-center gap-1.5 mb-1">
                  <span className="text-[10px] redacted px-2">████████</span>
                  <span className="text-[9px]" style={{ color: 'var(--color-text-muted)' }}>Scan to reveal</span>
                </div>
              )}
            </div>
          </div>

          {/* Resources */}
          <div className="flex gap-2 mt-2 flex-wrap">
            <div className="flex items-center gap-1 rounded px-1.5 py-0.5" style={{ background: 'var(--color-surface-raised)' }}>
              <Crosshair className="w-2.5 h-2.5" style={{ color: 'var(--color-amber)' }} />
              <span className="text-[9px] font-data" style={{ color: 'var(--color-text-muted)' }}>ASM</span>
              <span className="text-[10px] font-data font-bold" style={{ color: state.player_missiles_remaining === 0 ? 'var(--color-red)' : 'var(--color-amber)' }}>{state.player_missiles_remaining}</span>
            </div>
            {state.ecm_charges > 0 && (
              <div className="flex items-center gap-1 rounded px-1.5 py-0.5" style={{ background: 'var(--color-surface-raised)' }}>
                <Radio className="w-2.5 h-2.5" style={{ color: 'var(--color-blue)' }} />
                <span className="text-[9px] font-data" style={{ color: 'var(--color-text-muted)' }}>ECM</span>
                <span className="text-[10px] font-data font-bold" style={{ color: 'var(--color-blue)' }}>{state.ecm_charges}</span>
              </div>
            )}
            {state.player_sam_ready && (
              <div className="flex items-center gap-1 rounded px-1.5 py-0.5" style={{ background: 'var(--color-surface-raised)' }}>
                <Shield className="w-2.5 h-2.5" style={{ color: 'var(--color-green)' }} />
                <span className="text-[9px] font-data" style={{ color: 'var(--color-green)' }}>SAM</span>
              </div>
            )}
          </div>
        </div>
      </div>

      {/* ═══ COMBAT LOG ═══ */}
      <div ref={logRef} className="mx-3 h-24 overflow-y-auto py-1 px-2 space-y-0.5" style={{ borderTop: '1px solid var(--color-border)', borderBottom: '1px solid var(--color-border)', background: 'rgba(12,14,18,0.9)' }}>
        {combatLog.map((entry, i) => (
          <div key={i} className={`log-entry flex gap-2 text-[11px] font-data leading-tight ${i === combatLog.length - 1 ? '' : 'opacity-70'}`}>
            <span className={`${entry.color} font-bold shrink-0 w-12 text-right`}>[{entry.prefix}]</span>
            <span style={{ color: 'var(--color-text)' }}>{entry.text}</span>
          </div>
        ))}
      </div>

      {/* ═══ ACTION PANEL / RESULT ═══ */}
      <div className="flex-1 px-3 py-2 flex flex-col min-h-0 overflow-hidden">
        {error && !showingResult && (
          <div className="mb-2 rounded-lg p-2.5 flex items-center gap-2" style={{ background: 'rgba(196,69,60,0.1)', border: '1px solid rgba(196,69,60,0.3)' }}>
            <AlertTriangle className="w-4 h-4 shrink-0" style={{ color: 'var(--color-red)' }} />
            <p className="text-xs flex-1" style={{ color: 'var(--color-red)' }}>{error}</p>
            {pendingAction ? (
              <button onClick={handleRetry} className="btn-danger text-xs px-3 py-1.5 flex items-center gap-1">
                <RotateCw className="w-3 h-3" /> RETRY
              </button>
            ) : (
              <button onClick={() => setError(null)} className="text-xs px-2 py-1.5 rounded" style={{ background: 'rgba(196,69,60,0.2)', color: 'var(--color-red)' }}>
                <RotateCw className="w-3 h-3" />
              </button>
            )}
          </div>
        )}

        {showingResult && turnResult ? (
          <div className="flex-1 flex flex-col phase-slide-in overflow-y-auto">
            <div className="card-dossier p-3 mb-2">
              <div className="flex items-center justify-between mb-2">
                <span className="text-xs font-display tracking-wider font-bold" style={{ color: 'var(--color-amber)' }}>TURN {turnResult.turn_number}</span>
                <span className={`text-[10px] font-bold uppercase px-1.5 py-0.5 rounded border font-display ${(phaseBadge[turnResult.phase] || phaseBadge.approach).bg} ${(phaseBadge[turnResult.phase] || phaseBadge.approach).text}`}>
                  {turnResult.phase}
                </span>
              </div>

              <div className="grid grid-cols-2 gap-2 mb-2">
                <div className="rounded-lg p-2" style={{ background: 'rgba(212,168,67,0.05)' }}>
                  <p className="text-[9px] font-display tracking-wider" style={{ color: 'var(--color-amber-dim)' }}>YOU</p>
                  <p className="text-xs font-display tracking-wider font-bold" style={{ color: 'var(--color-amber)' }}>{turnResult.player_action.replace(/_/g, ' ').toUpperCase()}</p>
                </div>
                <div className="rounded-lg p-2" style={{ background: 'rgba(196,69,60,0.05)' }}>
                  <p className="text-[9px] font-display tracking-wider" style={{ color: 'var(--color-red-dim)' }}>ENEMY</p>
                  <p className="text-xs font-display tracking-wider font-bold" style={{ color: 'var(--color-red)' }}>{turnResult.enemy_action.replace(/_/g, ' ').toUpperCase()}</p>
                </div>
              </div>

              {turnResult.player_hits > 0 && (
                <div className="rounded-lg p-2 mb-1.5 text-center" style={{ background: 'rgba(92,138,77,0.1)', border: '1px solid rgba(92,138,77,0.3)' }}>
                  <p className="text-lg font-black font-data result-reveal" style={{ color: 'var(--color-green)' }}>
                    {turnResult.player_hits} HIT{turnResult.player_hits > 1 ? 'S' : ''} — {turnResult.player_damage_dealt.toFixed(0)}%
                  </p>
                  <p className="text-[11px] font-data" style={{ color: 'var(--color-text-muted)' }}>{turnResult.player_salvo_fired} launched, {turnResult.player_hits} penetrated</p>
                </div>
              )}

              {turnResult.enemy_hits > 0 && (
                <div className="rounded-lg p-2 mb-1.5 text-center" style={{ background: 'rgba(196,69,60,0.1)', border: '1px solid rgba(196,69,60,0.3)' }}>
                  <p className="text-sm font-bold font-data" style={{ color: 'var(--color-red)' }}>
                    INCOMING: {turnResult.enemy_hits} HIT{turnResult.enemy_hits > 1 ? 'S' : ''} — {turnResult.enemy_damage_taken.toFixed(0)}%
                  </p>
                  {turnResult.compartment_hit && (
                    <p className="text-[11px] font-data" style={{ color: 'var(--color-text-muted)' }}>{turnResult.compartment_hit} compartment damaged</p>
                  )}
                </div>
              )}

              {turnResult.damage_repaired > 0 && (
                <div className="rounded-lg p-2 mb-1.5 text-center" style={{ background: 'rgba(91,139,160,0.1)', border: '1px solid rgba(91,139,160,0.3)' }}>
                  <p className="text-sm font-bold font-data" style={{ color: 'var(--color-blue)' }}>
                    <Wrench className="w-3.5 h-3.5 inline mr-1" /> REPAIRED +{turnResult.damage_repaired.toFixed(0)}%
                  </p>
                </div>
              )}

              <p className="text-[11px] leading-relaxed mt-1" style={{ color: 'var(--color-text-secondary)' }}>{turnResult.narrative}</p>
            </div>

            {/* Resource status */}
            {turnResult.state && (
              <div className="rounded-lg px-3 py-2 mb-2 flex items-center gap-3 flex-wrap font-data text-[10px]" style={{ background: 'var(--color-surface-raised)' }}>
                <span style={{ color: state.player_missiles_remaining === 0 ? 'var(--color-red)' : 'var(--color-amber)' }}>
                  ASM: <strong>{turnResult.state.player_missiles_remaining}</strong>
                </span>
                {turnResult.state.player_compartments.map(c => (
                  <span key={c.name} style={{ color: compartmentColor(c.hp_pct) }}>
                    {compartmentLabel[c.name]}: <strong>{c.hp_pct.toFixed(0)}%</strong>
                  </span>
                ))}
              </div>
            )}

            <div className="mt-auto pb-2">
              <button onClick={handleNextTurn} disabled={nextTurnLoading} className="btn-primary w-full flex items-center justify-center gap-2 text-sm py-3">
                {nextTurnLoading ? <Loader2 className="w-4 h-4 animate-spin" /> :
                  turnResult.battle_complete ? '▶ VIEW REPORT' : `▶ TURN ${turnResult.turn_number + 1}`}
              </button>
            </div>
          </div>
        ) : (
          <div className="flex-1 flex flex-col overflow-hidden">
            {choosing && (
              <div className="mb-1.5 rounded-lg p-2 flex items-center gap-2" style={{ background: 'rgba(212,168,67,0.05)', border: '1px solid rgba(212,168,67,0.2)' }}>
                <Loader2 className="w-4 h-4 animate-spin shrink-0" style={{ color: 'var(--color-amber)' }} />
                <span className="text-xs font-data" style={{ color: 'var(--color-amber)' }}>EXECUTING...</span>
              </div>
            )}

            <div className="flex-1 overflow-y-auto space-y-1.5 pb-2">
              {state.available_actions.map(action => {
                const isSelected = selectedAction === action.key;
                const isDamageControl = action.key.includes('damage_control');
                const isFire = action.salvo_size && action.salvo_size > 0;
                return (
                  <button key={action.key} onClick={() => handleAction(action)} disabled={choosing}
                    className="card-dossier w-full rounded-lg p-3 text-left transition-all active:scale-[0.98] disabled:opacity-40 card-press"
                    style={isSelected ? { borderColor: 'var(--color-amber)' } : {}}>
                    <div className="flex items-center gap-2">
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2">
                          <span className="text-sm font-display tracking-wider font-bold" style={{ color: 'var(--color-text)' }}>{action.label.toUpperCase()}</span>
                          {isFire && (
                            <span className="text-[10px] font-data font-bold px-1.5 py-0.5 rounded" style={{ background: 'rgba(196,69,60,0.15)', color: 'var(--color-red)' }}>
                              ×{action.salvo_size}
                            </span>
                          )}
                          {isDamageControl && (
                            <Wrench className="w-3.5 h-3.5" style={{ color: 'var(--color-blue)' }} />
                          )}
                        </div>
                        <p className="text-[11px] mt-0.5" style={{ color: 'var(--color-text-muted)' }}>{action.description}</p>
                      </div>
                      {isSelected && choosing && <Loader2 className="w-4 h-4 animate-spin shrink-0" style={{ color: 'var(--color-amber)' }} />}
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
