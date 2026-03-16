import { useState, useRef, useEffect } from 'react';
import {
  Crosshair,
  Fuel,
  Loader2,
  AlertTriangle,
  RotateCw,
  Zap,
  Eye,
  Radio,
} from 'lucide-react';
import { apiService } from '../../services/api';
import './animations.css';

interface TacticalAction {
  key: string;
  label: string;
  description: string;
  risk_hint: string;
  weapon_id?: number | null;
  pk_preview?: number | null;
}

interface EnemyIntel {
  name: string;
  radar_known: boolean;
  rcs_known: boolean;
  ecm_known: boolean;
  loadout_known: boolean;
  fuel_known: boolean;
  damage_known: boolean;
  radar_type?: string;
  radar_range_km?: number;
  rcs_m2?: number;
  ecm_suite?: string;
  ecm_rating?: number;
  fuel_pct?: number;
  damage_pct?: number;
  observed_weapons: string[];
}

interface TacticalState {
  engine_version: number;
  turn: number;
  max_turns: number;
  range_km: number;
  zone: string;
  player_name: string;
  enemy_intel: EnemyIntel;
  player_ammo: Array<{ weapon_name: string; weapon_id: number; remaining: number; type: string }>;
  fuel_pct: number;
  damage_pct: number;
  ecm_charges: number;
  flare_uses: number;
  available_actions: TacticalAction[];
  status: string;
  exit_reason?: string;
}

interface TurnResultData {
  engine_version: number;
  turn_number: number;
  player_action: string;
  enemy_action: string;
  weapon_fired?: string;
  shot_pk?: number;
  shot_hit?: boolean;
  enemy_weapon_fired?: string;
  enemy_shot_pk?: number;
  enemy_shot_hit?: boolean;
  damage_dealt: number;
  damage_taken: number;
  range_change: number;
  new_range: number;
  zone: string;
  intel_revealed?: string;
  fuel_consumed: number;
  narrative: string;
  factors: Array<{ name: string; value: string; impact: string; description: string }>;
  next_actions: TacticalAction[];
  state: TacticalState;
  battle_complete: boolean;
  final_report?: any;
}

interface LogEntry {
  prefix: string;
  color: string;
  text: string;
}

interface TacticalBattleScreenProps {
  battleId: number;
  initialState: TacticalState;
  onComplete: (report: any) => void;
}

const zoneBadge: Record<string, { bg: string; text: string }> = {
  BVR: { bg: 'bg-emerald-500/20', text: 'text-emerald-400' },
  TRANSITION: { bg: 'bg-amber-500/20', text: 'text-amber-400' },
  WVR: { bg: 'bg-red-500/20', text: 'text-red-400' },
};

const pkColor = (pk: number) =>
  pk >= 0.6 ? 'text-emerald-400' : pk >= 0.3 ? 'text-amber-400' : 'text-red-400';

const pkBg = (pk: number) =>
  pk >= 0.6 ? 'bg-emerald-500/20 border-emerald-500/30' : pk >= 0.3 ? 'bg-amber-500/20 border-amber-500/30' : 'bg-red-500/20 border-red-500/30';

// Timeout wrapper for API calls
const withTimeout = <T,>(promise: Promise<T>, ms: number): Promise<T> => {
  return Promise.race([
    promise,
    new Promise<never>((_, reject) => setTimeout(() => reject(new Error('Request timed out')), ms)),
  ]);
};

export const TacticalBattleScreen = ({ battleId, initialState, onComplete }: TacticalBattleScreenProps) => {
  const [state, setState] = useState<TacticalState>(initialState);
  const [turnResult, setTurnResult] = useState<TurnResultData | null>(null);
  const [choosing, setChoosing] = useState(false);
  const [selectedAction, setSelectedAction] = useState<string | null>(null);
  const [showingResult, setShowingResult] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [pendingAction, setPendingAction] = useState<TacticalAction | null>(null); // For retry
  const [combatLog, setCombatLog] = useState<LogEntry[]>([
    { prefix: 'SYS', color: 'text-emerald-400', text: `TACTICAL ENGAGEMENT — ${initialState.player_name} vs ${initialState.enemy_intel.name}` },
    { prefix: 'SYS', color: 'text-gray-500', text: `Range: ${initialState.range_km}km — Zone: ${initialState.zone} — Awaiting orders...` },
  ]);
  const [screenEffect, setScreenEffect] = useState<string | null>(null);
  const [missileAnim, setMissileAnim] = useState<'fwd' | 'rev' | null>(null);
  const [nextTurnLoading, setNextTurnLoading] = useState(false);
  const logRef = useRef<HTMLDivElement>(null);
  const prevAmmoRef = useRef<Map<string, number>>(new Map());

  // Track ammo for depletion warnings
  useEffect(() => {
    const ammoMap = new Map<string, number>();
    state.player_ammo.forEach(a => ammoMap.set(a.weapon_name, a.remaining));
    prevAmmoRef.current = ammoMap;
  }, []);

  useEffect(() => {
    if (logRef.current) logRef.current.scrollTop = logRef.current.scrollHeight;
  }, [combatLog]);

  const addLog = (prefix: string, color: string, text: string) => {
    setCombatLog((prev) => [...prev, { prefix, color, text }]);
  };

  const handleAction = async (action: TacticalAction) => {
    setChoosing(true);
    setSelectedAction(action.key);
    setError(null);
    setPendingAction(action);
    addLog('CMD', 'text-cyan-400', `Order: ${action.label.toUpperCase()}`);

    try {
      const res = await withTimeout(
        apiService.submitChoice(battleId, action.key, action.weapon_id ?? undefined),
        10000 // 10s timeout
      );
      const data: TurnResultData = res.data;
      setTurnResult(data);
      setShowingResult(true);
      setPendingAction(null);

      // Update state immediately (non-blocking — result shows while animations play)
      if (data.state) setState(data.state);

      // Log narrative
      addLog('TRN', 'text-emerald-400', data.narrative);

      // Enriched combat log: range change
      if (Math.abs(data.range_change) > 1) {
        const dir = data.range_change < 0 ? 'closed' : 'opened';
        addLog('NAV', 'text-gray-500', `Range ${dir} ${Math.abs(data.range_change).toFixed(0)}km → ${data.new_range.toFixed(0)}km`);
      }

      // Enriched combat log: fuel consumption
      addLog('FUEL', 'text-amber-400/70', `Fuel: -${data.fuel_consumed.toFixed(0)}% → ${data.state?.fuel_pct?.toFixed(0) ?? '?'}%`);

      // Zone transition log
      if (data.zone !== state.zone) {
        addLog('ZONE', 'text-amber-400', `Zone: ${state.zone} → ${data.zone}${data.zone === 'WVR' ? ' — WEAPONS FREE' : ''}`);
      }

      // Player shot logs
      if (data.shot_hit !== undefined && data.shot_hit !== null) {
        if (data.shot_hit) {
          addLog('HIT', 'text-emerald-400', `${data.weapon_fired} — HIT (Pk ${((data.shot_pk || 0) * 100).toFixed(0)}%) — ${data.damage_dealt.toFixed(0)}% damage`);
        } else {
          addLog('MISS', 'text-red-400', `${data.weapon_fired} — MISS (Pk ${((data.shot_pk || 0) * 100).toFixed(0)}%)`);
        }
      }

      // Enemy shot logs
      if (data.enemy_shot_hit !== undefined && data.enemy_shot_hit !== null) {
        if (data.enemy_shot_hit) {
          addLog('DMG', 'text-red-400', `${data.enemy_weapon_fired} — HIT TAKEN — ${data.damage_taken.toFixed(0)}% damage`);
        } else {
          addLog('DEF', 'text-emerald-400', `${data.enemy_weapon_fired} — EVADED`);
        }
      }

      // Intel reveal
      if (data.intel_revealed) {
        addLog('INTEL', 'text-violet-400', `INTEL: Enemy ${data.intel_revealed} revealed`);
      }

      // Ammo depletion warnings
      if (data.state) {
        const newAmmo = new Map<string, number>();
        data.state.player_ammo.forEach(a => newAmmo.set(a.weapon_name, a.remaining));
        prevAmmoRef.current.forEach((oldQty, name) => {
          const newQty = newAmmo.get(name) ?? 0;
          if (oldQty > 0 && newQty === 0) {
            addLog('AMMO', 'text-amber-400', `${name} WINCHESTER — 0 remaining`);
          }
        });
        prevAmmoRef.current = newAmmo;
      }

      // Non-blocking animations — play after result is already shown
      if (data.shot_hit !== undefined && data.shot_hit !== null) {
        setMissileAnim('fwd');
        setTimeout(() => {
          setMissileAnim(null);
          if (data.shot_hit) setScreenEffect('hit-flash-green');
          setTimeout(() => setScreenEffect(null), 600);
        }, 800);
      }

      if (data.enemy_shot_hit !== undefined && data.enemy_shot_hit !== null) {
        const delay = (data.shot_hit !== undefined) ? 1200 : 200;
        setTimeout(() => {
          setMissileAnim('rev');
          setTimeout(() => {
            setMissileAnim(null);
            if (data.enemy_shot_hit) setScreenEffect('damage-vignette');
            setTimeout(() => setScreenEffect(null), 600);
          }, 600);
        }, delay);
      }

    } catch (err: any) {
      const isTimeout = err?.message === 'Request timed out';
      const msg = isTimeout ? 'Request timed out — check connection' : (err?.response?.data?.detail || 'Connection error');
      setError(msg);
      addLog('ERR', 'text-red-400', `COMMS FAILURE: ${msg}`);
    } finally {
      setChoosing(false);
      setSelectedAction(null);
    }
  };

  const handleRetry = () => {
    setError(null);
    if (pendingAction) {
      handleAction(pendingAction);
    }
  };

  const handleNextTurn = async () => {
    if (turnResult?.battle_complete) {
      setNextTurnLoading(true);
      try {
        const reportRes = await withTimeout(apiService.getBattleReport(battleId), 10000);
        onComplete(reportRes.data);
      } catch {
        addLog('ERR', 'text-red-400', 'Failed to load report');
        setNextTurnLoading(false);
      }
      return;
    }

    if (turnResult?.state) setState(turnResult.state);
    setTurnResult(null);
    setShowingResult(false);
  };

  const playerHp = Math.max(0, 100 - state.damage_pct);
  const zone = zoneBadge[state.zone] || zoneBadge.BVR;
  const intelCount = [state.enemy_intel.radar_known, state.enemy_intel.rcs_known,
    state.enemy_intel.ecm_known, state.enemy_intel.loadout_known,
    state.enemy_intel.fuel_known, state.enemy_intel.damage_known].filter(Boolean).length;

  return (
    <div className={`min-h-[100dvh] bg-gray-950 flex flex-col hud-grid hud-scanlines relative ${screenEffect === 'damage-vignette' ? 'screen-shake' : ''}`}>
      {screenEffect && <div className={screenEffect} />}

      {/* ═══ TOP BAR ═══ */}
      <div className="px-3 py-2 flex items-center justify-between border-b border-emerald-500/10">
        <div className="hud-text flex items-center gap-2">
          <span className="text-[10px] text-emerald-400/60">TURN</span>
          <span className="text-sm font-bold text-emerald-400 hud-glow">{state.turn}/{state.max_turns}</span>
          <span className={`text-[10px] font-bold uppercase px-1.5 py-0.5 rounded border ${zone.bg} ${zone.text}`}>
            {state.zone}
          </span>
        </div>
        <div className="hud-text flex items-center gap-3">
          <div className="flex items-center gap-1">
            <span className="text-[10px] text-gray-500">RNG</span>
            <span className="text-sm font-bold text-amber-400 hud-glow-amber">{state.range_km.toFixed(0)}km</span>
          </div>
          <div className={`flex items-center gap-1 ${state.fuel_pct < 20 ? 'low-fuel-warning' : ''}`}>
            <Fuel className="w-3.5 h-3.5 text-amber-400" />
            <span className={`text-xs font-bold hud-text ${state.fuel_pct < 20 ? 'text-red-400 hud-glow-red' : 'text-amber-400'}`}>
              {state.fuel_pct.toFixed(0)}%
            </span>
          </div>
        </div>
      </div>

      {/* ═══ TACTICAL VIEW ═══ */}
      <div className="px-3 py-2 relative">
        <div className="hud-border rounded-xl p-3 relative overflow-hidden bg-gray-950/80">
          {/* Radar sweep */}
          <div className="absolute inset-0 opacity-[0.03]">
            <div className="w-full h-full radar-sweep" style={{
              background: 'conic-gradient(from 0deg, transparent 0deg, rgba(34,197,94,0.4) 20deg, transparent 40deg)',
              transformOrigin: '15% 50%',
            }} />
          </div>

          {/* Combatants */}
          <div className="relative flex items-center justify-between mb-2">
            {/* Player */}
            <div className="text-center">
              <div className="w-12 h-12 rounded-lg hud-border flex items-center justify-center bg-emerald-500/5 mb-1">
                <span className="text-xl">✈</span>
              </div>
              <p className="text-[10px] text-emerald-400 hud-text font-bold truncate max-w-[64px]">{state.player_name.split(' ').pop()}</p>
              <div className="h-1.5 w-12 bg-gray-800 rounded-full overflow-hidden mt-0.5">
                <div className={`h-full rounded-full ${playerHp > 60 ? 'bg-emerald-500' : playerHp > 30 ? 'bg-amber-500' : 'bg-red-500'}`} style={{ width: `${playerHp}%` }} />
              </div>
              <span className="text-[10px] text-gray-500 hud-text">{playerHp.toFixed(0)}%</span>
            </div>

            {/* Range line */}
            <div className="flex-1 mx-2 relative h-6 flex items-center">
              <div className="w-full h-px bg-emerald-500/20 relative">
                <div className="absolute top-1/2 left-1/3 w-px h-2.5 -translate-y-1/2 bg-amber-500/30" />
                <div className="absolute top-1/2 left-2/3 w-px h-2.5 -translate-y-1/2 bg-red-500/30" />
              </div>
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
                <span className="text-[10px] text-gray-600 hud-text">{state.range_km.toFixed(0)}KM</span>
              </div>
            </div>

            {/* Enemy */}
            <div className="text-center">
              <div className="w-12 h-12 rounded-lg hud-border-amber flex items-center justify-center bg-amber-500/5 mb-1 relative">
                <span className="text-xl">◇</span>
                {intelCount < 6 && (
                  <span className="absolute -top-1 -right-1 text-[9px] bg-violet-500/30 text-violet-300 rounded-full w-4 h-4 flex items-center justify-center font-bold">?</span>
                )}
              </div>
              <p className="text-[10px] text-red-400 hud-text font-bold truncate max-w-[64px]">{state.enemy_intel.name.split(' ').pop()}</p>
              {/* Enemy intel — full fog of war display */}
              <div className="flex gap-0.5 justify-center mt-0.5 flex-wrap max-w-[80px]">
                {state.enemy_intel.radar_known && (
                  <span className="text-[9px] text-violet-400 bg-violet-500/10 rounded px-1">R:{state.enemy_intel.radar_range_km}km</span>
                )}
                {state.enemy_intel.rcs_known && (
                  <span className="text-[9px] text-violet-400 bg-violet-500/10 rounded px-1">{state.enemy_intel.rcs_m2}m²</span>
                )}
                {state.enemy_intel.ecm_known && (
                  <span className="text-[9px] text-violet-400 bg-violet-500/10 rounded px-1">ECM:{state.enemy_intel.ecm_rating}</span>
                )}
                {state.enemy_intel.loadout_known && (
                  <span className="text-[9px] text-violet-400 bg-violet-500/10 rounded px-1">WPN</span>
                )}
                {state.enemy_intel.fuel_known && (
                  <span className="text-[9px] text-amber-400 bg-amber-500/10 rounded px-1">F:{state.enemy_intel.fuel_pct?.toFixed(0)}%</span>
                )}
                {state.enemy_intel.damage_known && (
                  <span className="text-[9px] text-red-400 bg-red-500/10 rounded px-1">-{state.enemy_intel.damage_pct?.toFixed(0)}%</span>
                )}
                {/* Observed weapons (passive intel) */}
                {state.enemy_intel.observed_weapons?.map((w, i) => (
                  <span key={i} className="text-[9px] text-gray-400 bg-gray-500/10 rounded px-1">{w.split(' ').pop()}</span>
                ))}
              </div>
            </div>
          </div>

          {/* Resource strip */}
          <div className="flex gap-1.5 flex-wrap">
            {state.player_ammo.map((a, i) => (
              <div key={i} className={`flex items-center gap-1 rounded px-1.5 py-0.5 ${a.remaining === 0 ? 'bg-red-500/10' : 'bg-gray-900/60'}`}>
                <Crosshair className={`w-2.5 h-2.5 ${a.remaining === 0 ? 'text-red-400/60' : 'text-emerald-400/60'}`} />
                <span className="text-[9px] text-gray-400 hud-text">{a.weapon_name.split(' ').pop()}</span>
                <span className={`text-[10px] font-bold hud-text ${a.remaining === 0 ? 'text-red-400' : 'text-emerald-400'}`}>{a.remaining}</span>
              </div>
            ))}
            {state.ecm_charges > 0 && (
              <div className="flex items-center gap-1 bg-gray-900/60 rounded px-1.5 py-0.5">
                <Radio className="w-2.5 h-2.5 text-cyan-400/60" />
                <span className="text-[9px] text-gray-400 hud-text">ECM</span>
                <span className="text-[10px] font-bold text-cyan-400 hud-text">{state.ecm_charges}</span>
              </div>
            )}
            {state.flare_uses > 0 && (
              <div className="flex items-center gap-1 bg-gray-900/60 rounded px-1.5 py-0.5">
                <Zap className="w-2.5 h-2.5 text-amber-400/60" />
                <span className="text-[9px] text-gray-400 hud-text">FLR</span>
                <span className="text-[10px] font-bold text-amber-400 hud-text">{state.flare_uses}</span>
              </div>
            )}
            <div className="flex items-center gap-1 bg-gray-900/60 rounded px-1.5 py-0.5">
              <Eye className="w-2.5 h-2.5 text-violet-400/60" />
              <span className="text-[9px] text-gray-400 hud-text">INTEL</span>
              <span className="text-[10px] font-bold text-violet-400 hud-text">{intelCount}/6</span>
            </div>
          </div>
        </div>
      </div>

      {/* ═══ COMBAT LOG ═══ */}
      <div
        ref={logRef}
        className="mx-3 h-24 overflow-y-auto border-y border-emerald-500/10 bg-gray-950/90 py-1 px-2 space-y-0.5"
      >
        {combatLog.map((entry, i) => (
          <div key={i} className={`log-entry flex gap-2 text-[11px] hud-text leading-tight ${i === combatLog.length - 1 ? '' : 'opacity-70'}`}>
            <span className={`${entry.color} font-bold shrink-0 w-12 text-right`}>[{entry.prefix}]</span>
            <span className="text-gray-300">{entry.text}</span>
          </div>
        ))}
      </div>

      {/* ═══ ACTION PANEL / RESULT ═══ */}
      <div className="flex-1 px-3 py-2 flex flex-col min-h-0 overflow-hidden">
        {/* Error with retry */}
        {error && !showingResult && (
          <div className="mb-2 rounded-xl bg-red-500/10 border border-red-500/30 p-2.5 flex items-center gap-2">
            <AlertTriangle className="w-4 h-4 text-red-400 shrink-0" />
            <p className="text-xs text-red-400 flex-1">{error}</p>
            {pendingAction ? (
              <button onClick={handleRetry} className="text-xs text-red-400 bg-red-500/20 px-3 py-1.5 rounded flex items-center gap-1 min-w-[60px] justify-center">
                <RotateCw className="w-3 h-3" /> RETRY
              </button>
            ) : (
              <button onClick={() => setError(null)} className="text-xs text-red-400 bg-red-500/20 px-2 py-1.5 rounded">
                <RotateCw className="w-3 h-3" />
              </button>
            )}
          </div>
        )}

        {showingResult && turnResult ? (
          <div className="flex-1 flex flex-col phase-slide-in overflow-y-auto">
            {/* Turn result */}
            <div className="rounded-xl bg-gray-900/60 p-3 mb-2">
              <div className="flex items-center justify-between mb-2">
                <span className="text-xs font-bold text-emerald-400 hud-text">TURN {turnResult.turn_number} RESULT</span>
                <span className={`text-[10px] font-bold uppercase px-1.5 py-0.5 rounded border ${zone.bg} ${zone.text}`}>
                  {turnResult.zone}
                </span>
              </div>

              {/* Actions */}
              <div className="grid grid-cols-2 gap-2 mb-2">
                <div className="bg-emerald-500/5 rounded-lg p-2">
                  <p className="text-[9px] text-emerald-400/60 hud-text">YOU</p>
                  <p className="text-xs font-bold text-emerald-400 hud-text">{turnResult.player_action.replace(/_/g, ' ').toUpperCase()}</p>
                </div>
                <div className="bg-red-500/5 rounded-lg p-2">
                  <p className="text-[9px] text-red-400/60 hud-text">ENEMY</p>
                  <p className="text-xs font-bold text-red-400 hud-text">{turnResult.enemy_action.replace(/_/g, ' ').toUpperCase()}</p>
                </div>
              </div>

              {/* Shot results */}
              {turnResult.shot_hit !== undefined && turnResult.shot_hit !== null && (
                <div className={`rounded-lg p-2 mb-1.5 text-center ${turnResult.shot_hit ? 'bg-emerald-500/10 hud-border' : 'bg-red-500/10 hud-border-red'}`}>
                  <p className="text-lg font-black hud-text result-reveal">
                    {turnResult.shot_hit
                      ? <span className="text-emerald-400 hud-glow">HIT — {turnResult.damage_dealt.toFixed(0)}%</span>
                      : <span className="text-red-400 hud-glow-red">MISS</span>
                    }
                  </p>
                  <p className="text-[11px] text-gray-400 hud-text">
                    {turnResult.weapon_fired} — Pk {((turnResult.shot_pk || 0) * 100).toFixed(0)}%
                  </p>
                </div>
              )}

              {turnResult.enemy_shot_hit !== undefined && turnResult.enemy_shot_hit !== null && (
                <div className={`rounded-lg p-2 mb-1.5 text-center ${turnResult.enemy_shot_hit ? 'bg-red-500/10 hud-border-red' : 'bg-emerald-500/10 hud-border'}`}>
                  <p className="text-sm font-bold hud-text">
                    {turnResult.enemy_shot_hit
                      ? <span className="text-red-400">INCOMING HIT — {turnResult.damage_taken.toFixed(0)}%</span>
                      : <span className="text-emerald-400">INCOMING EVADED</span>
                    }
                  </p>
                  <p className="text-[11px] text-gray-500 hud-text">{turnResult.enemy_weapon_fired}</p>
                </div>
              )}

              {turnResult.intel_revealed && (
                <div className="rounded-lg bg-violet-500/10 border border-violet-500/20 p-2 mb-1.5 text-center intel-reveal">
                  <p className="text-xs font-bold text-violet-400 hud-text">
                    INTEL REVEALED: {turnResult.intel_revealed.toUpperCase()}
                  </p>
                </div>
              )}

              <p className="text-[11px] text-gray-400 leading-relaxed mt-1">{turnResult.narrative}</p>
            </div>

            {/* Resource status bar (new — shows current state after this turn) */}
            {turnResult.state && (
              <div className="rounded-lg bg-gray-900/40 px-3 py-2 mb-2 flex items-center gap-3 flex-wrap hud-text text-[10px]">
                <div className={`flex items-center gap-1 ${turnResult.state.fuel_pct < 20 ? 'text-red-400' : 'text-amber-400'}`}>
                  <Fuel className="w-3 h-3" />
                  <span className="font-bold">{turnResult.state.fuel_pct.toFixed(0)}%</span>
                </div>
                {turnResult.state.player_ammo.map((a, i) => (
                  <div key={i} className={`flex items-center gap-1 ${a.remaining === 0 ? 'text-red-400' : 'text-gray-400'}`}>
                    <Crosshair className="w-2.5 h-2.5" />
                    <span>{a.weapon_name.split(' ').pop()}:</span>
                    <span className="font-bold">{a.remaining}</span>
                  </div>
                ))}
                {turnResult.state.ecm_charges > 0 && (
                  <div className="flex items-center gap-1 text-cyan-400">
                    <Radio className="w-2.5 h-2.5" />
                    <span className="font-bold">{turnResult.state.ecm_charges}</span>
                  </div>
                )}
              </div>
            )}

            {/* Factors */}
            {turnResult.factors.length > 0 && (
              <div className="space-y-0.5 mb-2">
                {turnResult.factors.slice(0, 4).map((f, i) => (
                  <div key={i} className="flex items-center gap-2 text-[11px] hud-text">
                    <span className={f.impact === 'positive' ? 'text-emerald-400' : f.impact === 'negative' ? 'text-red-400' : 'text-gray-500'}>
                      {f.impact === 'positive' ? '▲' : f.impact === 'negative' ? '▼' : '●'}
                    </span>
                    <span className="text-gray-400 flex-1 truncate">{f.name}</span>
                    <span className="text-white font-bold">{f.value}</span>
                  </div>
                ))}
              </div>
            )}

            <div className="mt-auto pb-2">
              <button
                onClick={handleNextTurn}
                disabled={nextTurnLoading}
                className="w-full flex items-center justify-center gap-2 bg-emerald-500 text-black font-bold text-sm py-3 rounded-xl active:bg-emerald-400 disabled:opacity-60 transition-colors hud-text tracking-wider"
              >
                {nextTurnLoading ? (
                  <Loader2 className="w-4 h-4 animate-spin" />
                ) : (
                  turnResult.battle_complete ? '▶ VIEW REPORT' : `▶ TURN ${turnResult.turn_number + 1}`
                )}
              </button>
            </div>
          </div>
        ) : (
          <div className="flex-1 flex flex-col overflow-hidden">
            {choosing && (
              <div className="mb-1.5 rounded-xl bg-emerald-500/5 border border-emerald-500/20 p-2 flex items-center gap-2">
                <Loader2 className="w-4 h-4 text-emerald-400 animate-spin shrink-0" />
                <span className="text-xs text-emerald-400 hud-text">EXECUTING...</span>
              </div>
            )}

            <div className="flex-1 overflow-y-auto space-y-1.5 pb-2">
              {state.available_actions.map((action) => {
                const isSelected = selectedAction === action.key;
                const isFire = action.pk_preview !== undefined && action.pk_preview !== null;
                return (
                  <button
                    key={action.key}
                    onClick={() => handleAction(action)}
                    disabled={choosing}
                    className={`w-full rounded-xl p-3 text-left transition-all active:scale-[0.98] disabled:opacity-40 bg-gray-950/80 ${
                      isSelected ? 'border-emerald-500/60 bg-emerald-500/10 hud-border' : 'hud-border'
                    }`}
                  >
                    <div className="flex items-center gap-2">
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2">
                          <span className="text-sm font-bold text-white hud-text">{action.label.toUpperCase()}</span>
                          {isFire && action.pk_preview != null && (
                            <span className={`text-[10px] font-bold px-1.5 py-0.5 rounded border hud-text ${pkBg(action.pk_preview)} ${pkColor(action.pk_preview)}`}>
                              Pk {(action.pk_preview * 100).toFixed(0)}%
                            </span>
                          )}
                        </div>
                        <p className="text-[11px] text-gray-500 mt-0.5 hud-text">{action.description}</p>
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
