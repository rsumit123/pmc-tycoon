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
  objective?: string;
  playerImageUrl?: string | null;
  enemyImageUrl?: string | null;
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

const zoneBadge: Record<string, { bg: string; text: string }> = {
  BVR: { bg: 'bg-emerald-500/20', text: 'text-emerald-400' },
  TRANSITION: { bg: 'bg-amber-500/20', text: 'text-amber-400' },
  WVR: { bg: 'bg-red-500/20', text: 'text-red-400' },
};

// Timeout wrapper for API calls
const withTimeout = <T,>(promise: Promise<T>, ms: number): Promise<T> => {
  return Promise.race([
    promise,
    new Promise<never>((_, reject) => setTimeout(() => reject(new Error('Request timed out')), ms)),
  ]);
};

const ACTION_ICONS: Record<string, string> = {
  scan: '\uD83D\uDCE1',
  ecm: '\uD83D\uDCF4',
  flares: '\uD83D\uDCA8',
  close: '\u27A1',
  extend: '\u2B05',
  break_turn: '\u21A9',
  go_passive: '\uD83D\uDC41',
  disengage: '\uD83C\uDFC3',
  guns: '\uD83D\uDD2B',
};

export const TacticalBattleScreen = ({ battleId, initialState, objective, playerImageUrl, enemyImageUrl, onComplete }: TacticalBattleScreenProps) => {
  const [state, setState] = useState<TacticalState>(initialState);
  const [turnResult, setTurnResult] = useState<TurnResultData | null>(null);
  const [choosing, setChoosing] = useState(false);
  const [selectedAction, setSelectedAction] = useState<string | null>(null);
  const [showingResult, setShowingResult] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [pendingAction, setPendingAction] = useState<TacticalAction | null>(null); // For retry
  const [engagementMarkers, setEngagementMarkers] = useState<Array<{range: number; hit: boolean; isEnemy: boolean}>>([]);
  const [showEnemyIntel, setShowEnemyIntel] = useState(false);
  const [ticker, setTicker] = useState<string[]>([]);
  const [combatLog, setCombatLog] = useState<LogEntry[]>([
    { prefix: 'SYS', color: 'text-[#D4A843]', text: `TACTICAL ENGAGEMENT — ${initialState.player_name} vs ${initialState.enemy_intel.name}` },
    { prefix: 'SYS', color: 'text-gray-500', text: `Range: ${initialState.range_km}km — Zone: ${initialState.zone} — Awaiting orders...` },
  ]);
  const [screenEffect, setScreenEffect] = useState<string | null>(null);
  const [missileAnim, setMissileAnim] = useState<'fwd' | 'rev' | null>(null);
  const [nextTurnLoading, setNextTurnLoading] = useState(false);
  const [threatWarning, setThreatWarning] = useState<string | null>(null);
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
        setEngagementMarkers(prev => [...prev, { range: data.new_range, hit: data.shot_hit!, isEnemy: false }]);
      }

      // Enemy shot logs
      if (data.enemy_shot_hit !== undefined && data.enemy_shot_hit !== null) {
        if (data.enemy_shot_hit) {
          addLog('DMG', 'text-red-400', `${data.enemy_weapon_fired} — HIT TAKEN — ${data.damage_taken.toFixed(0)}% damage`);
        } else {
          addLog('DEF', 'text-emerald-400', `${data.enemy_weapon_fired} — EVADED`);
        }
        setEngagementMarkers(prev => [...prev, { range: data.new_range, hit: data.enemy_shot_hit!, isEnemy: true }]);
      }

      // Build ticker entry
      const tickerParts: string[] = [];
      if (data.shot_hit !== undefined && data.shot_hit !== null) {
        tickerParts.push(`T${data.turn_number}: ${data.weapon_fired?.split(' ').pop() || 'Shot'} \u2192 ${data.shot_hit ? `HIT ${data.damage_dealt.toFixed(0)}%` : 'MISS'}`);
      }
      if (data.enemy_shot_hit !== undefined && data.enemy_shot_hit !== null) {
        tickerParts.push(`Enemy ${data.enemy_weapon_fired?.split(' ').pop() || 'Shot'} \u2192 ${data.enemy_shot_hit ? `HIT ${data.damage_taken.toFixed(0)}%` : 'EVADED'}`);
      }
      if (tickerParts.length > 0) {
        setTicker(prev => [...prev.slice(-2), tickerParts.join(' | ')]);
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

      // Threat warnings (show briefly)
      if (data.enemy_shot_hit !== undefined && data.enemy_shot_hit !== null) {
        setThreatWarning('\u26A0 MISSILE INBOUND');
        setTimeout(() => setThreatWarning(null), 1500);
      }
      if (data.state && data.state.fuel_pct < 20 && state.fuel_pct >= 20) {
        setTimeout(() => { setThreatWarning('\u26FD BINGO FUEL \u2014 RTB RECOMMENDED'); setTimeout(() => setThreatWarning(null), 2000); }, 800);
      }
      if (data.enemy_action && data.enemy_action.toLowerCase().includes('fire')) {
        setTimeout(() => { setThreatWarning('\u26A0 ENEMY RADAR LOCK'); setTimeout(() => setThreatWarning(null), 1500); }, 300);
      }
      // Winchester alert
      if (data.state) {
        data.state.player_ammo.forEach((a: { weapon_name: string; remaining: number }) => {
          const oldQty = prevAmmoRef.current.get(a.weapon_name) ?? 0;
          if (oldQty > 0 && a.remaining === 0) {
            setTimeout(() => { setThreatWarning(`\uD83D\uDEA8 WINCHESTER \u2014 ${a.weapon_name}`); setTimeout(() => setThreatWarning(null), 2000); }, 1600);
          }
        });
      }
      // Zone transition warning
      if (data.zone !== state.zone) {
        const zoneMsg = data.zone === 'WVR' ? 'ENTERING WVR \u2014 CLOSE COMBAT' : data.zone === 'TRANSITION' ? 'ENTERING TRANSITION ZONE' : 'ENTERING BVR ZONE';
        setTimeout(() => { setThreatWarning(`\u26A0 ${zoneMsg}`); setTimeout(() => setThreatWarning(null), 2000); }, 400);
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

  const getTacticalHint = (): string | null => {
    if (state.fuel_pct < 15) return '\u26FD Critical fuel \u2014 disengage immediately';
    if (state.fuel_pct < 30) return '\u26FD Low fuel \u2014 consider disengaging soon';

    const playerHasBvr = state.player_ammo.some(a => a.type === 'BVR_AAM' && a.remaining > 0);
    const playerHasIr = state.player_ammo.some(a => a.type === 'IR_AAM' && a.remaining > 0);
    const allAmmoOut = !playerHasBvr && !playerHasIr;

    if (allAmmoOut && state.zone !== 'WVR') return '\uD83D\uDD2B Winchester \u2014 close to WVR for guns or disengage';
    if (allAmmoOut && state.zone === 'WVR') return '\uD83D\uDD2B Missiles spent \u2014 guns only';

    if (state.enemy_intel.damage_known && (state.enemy_intel.damage_pct || 0) > 60)
      return '\uD83C\uDFAF Enemy heavily damaged \u2014 press the advantage';

    if (state.zone === 'BVR' && playerHasBvr)
      return '\uD83D\uDCE1 BVR zone \u2014 radar missiles have max effectiveness here';
    if (state.zone === 'TRANSITION' && playerHasIr)
      return '\uD83D\uDD25 Transition zone \u2014 IR missiles becoming effective';
    if (state.zone === 'WVR')
      return '\u2694\uFE0F WVR \u2014 close combat, guns and IR missiles';

    if (intelCount < 3) return '\uD83D\uDC41 Consider scanning \u2014 intel reveals enemy capabilities';
    if (state.ecm_charges > 0 && state.zone !== 'WVR')
      return '\uD83D\uDCE1 ECM available \u2014 can degrade enemy radar missiles';

    return null;
  };

  return (
    <div className={`min-h-[100dvh] bg-dossier-base flex flex-col hud-grid hud-scanlines relative ${screenEffect === 'damage-vignette' ? 'screen-shake' : ''}`}>
      {screenEffect && <div className={screenEffect} />}

      {/* ═══ TOP BAR ═══ */}
      <div className="px-3 py-2 flex items-center justify-between border-b border-[rgba(212,168,67,0.1)]">
        <div className="hud-text flex items-center gap-2">
          <span className="text-[10px] text-[#D4A843]/60">TURN</span>
          <span className="text-sm font-bold text-[#D4A843] hud-glow-amber">{state.turn}/{state.max_turns}</span>
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

      {/* ═══ OBJECTIVE BAR ═══ */}
      {objective && (
        <div className="px-3 py-1.5" style={{ background: 'rgba(212,168,67,0.06)', borderBottom: '1px solid var(--color-border)' }}>
          <div className="flex items-center gap-2">
            <span className="text-[10px] font-display tracking-wider" style={{ color: 'var(--color-amber)' }}>OBJECTIVE</span>
            <span className="text-xs font-data" style={{ color: 'var(--color-text)' }}>{OBJECTIVE_DISPLAY[objective] || objective.replace(/_/g, ' ').toUpperCase()}</span>
            {objective === 'escort' && (
              <span className="text-[10px] font-data ml-auto" style={{ color: state.damage_pct < 50 ? 'var(--color-green)' : 'var(--color-red)' }}>
                Hull: {(100 - state.damage_pct).toFixed(0)}% (need &gt;50%)
              </span>
            )}
            {objective === 'strike' && (
              <span className="text-[10px] font-data ml-auto" style={{ color: state.range_km < 40 ? 'var(--color-green)' : 'var(--color-text-muted)' }}>
                Range: {state.range_km.toFixed(0)}km (need &lt;20km)
              </span>
            )}
            {objective === 'recon' && (
              <span className="text-[10px] font-data ml-auto" style={{ color: 'var(--color-text-muted)' }}>
                Intel: {intelCount}/6
              </span>
            )}
          </div>
        </div>
      )}

      {/* ═══ TACTICAL VIEW ═══ */}
      <div className="px-3 py-2 relative">
        <div className="hud-border rounded-xl p-3 relative overflow-hidden bg-dossier-base/80">
          {/* Threat warning banner */}
          {threatWarning && (
            <div className="absolute top-0 left-0 right-0 z-10 px-3 py-2 text-center fade-slide-up"
              style={{ background: 'rgba(196,69,60,0.9)' }}>
              <span className="text-sm font-display tracking-wider text-white font-bold">{threatWarning}</span>
            </div>
          )}
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
              <div className="w-12 h-12 rounded-lg overflow-hidden hud-border bg-[rgba(212,168,67,0.05)] mb-1">
                {playerImageUrl ? (
                  <img src={playerImageUrl} alt="Your aircraft" className="w-full h-full object-cover" />
                ) : (
                  <div className="w-full h-full flex items-center justify-center"><span className="text-xl">{'\u2708'}</span></div>
                )}
              </div>
              <p className="text-[10px] text-[#D4A843] hud-text font-bold truncate max-w-[64px]">{state.player_name.split(' ').pop()}</p>
              <div className="h-1.5 w-12 bg-gray-800 rounded-full overflow-hidden mt-0.5">
                <div className={`h-full rounded-full ${playerHp > 60 ? 'bg-emerald-500' : playerHp > 30 ? 'bg-amber-500' : 'bg-red-500'}`} style={{ width: `${playerHp}%` }} />
              </div>
              <span className="text-[10px] text-gray-500 hud-text">{playerHp.toFixed(0)}%</span>
            </div>

            {/* Dynamic range bar */}
            <div className="flex-1 mx-2 relative">
              <div className="h-3 rounded-full overflow-hidden flex" style={{ background: 'var(--color-border)' }}>
                {/* BVR zone - proportional to 0-250km range */}
                <div className="h-full bg-emerald-500/30" style={{ width: '60%' }} />
                {/* TRANSITION zone */}
                <div className="h-full bg-amber-500/30" style={{ width: '25%' }} />
                {/* WVR zone */}
                <div className="h-full bg-red-500/30" style={{ width: '15%' }} />
              </div>
              {/* Range marker - position based on current range (250km max) */}
              <div className="absolute top-0 h-3 flex items-center" style={{ left: `${Math.min(100, Math.max(0, (1 - state.range_km / 250) * 100))}%`, transform: 'translateX(-50%)' }}>
                <div className="w-2.5 h-5 rounded-sm" style={{ background: 'var(--color-amber)', boxShadow: '0 0 6px var(--color-amber)' }} />
              </div>
              {/* Engagement hit/miss markers */}
              {engagementMarkers.map((m, i) => (
                <div key={i} className="absolute top-0" style={{
                  left: `${Math.min(100, Math.max(0, (1 - m.range / 250) * 100))}%`,
                  transform: 'translateX(-50%)',
                }}>
                  <div className={`w-1.5 h-1.5 rounded-full ${m.hit ? (m.isEnemy ? 'bg-red-400' : 'bg-emerald-400') : 'bg-gray-500'}`}
                    style={{ marginTop: m.isEnemy ? '-2px' : '14px' }} />
                </div>
              ))}
              {/* Zone labels */}
              <div className="flex justify-between mt-1">
                <span className="text-[8px] hud-text text-emerald-400/50">BVR</span>
                <span className="text-[8px] hud-text text-amber-400/50">40km</span>
                <span className="text-[8px] hud-text text-red-400/50">15km</span>
                <span className="text-[8px] hud-text text-red-400/50">WVR</span>
              </div>
              {/* Current range display */}
              <div className="text-center mt-0.5">
                <span className="text-[10px] text-gray-600 hud-text">{state.range_km.toFixed(0)}KM</span>
              </div>
              {/* Missile trails overlay */}
              {missileAnim === 'fwd' && <div className="absolute inset-0 flex items-center"><div className="h-0.5 bg-gradient-to-r from-emerald-400 to-transparent missile-trail-fwd" /></div>}
              {missileAnim === 'rev' && <div className="absolute inset-0 flex items-center justify-end"><div className="h-0.5 bg-gradient-to-l from-red-400 to-transparent missile-trail-rev" /></div>}
            </div>

            {/* Enemy */}
            <div className="text-center">
              <div className="w-12 h-12 rounded-lg overflow-hidden hud-border-amber bg-amber-500/5 mb-1 relative">
                {enemyImageUrl ? (
                  <img src={enemyImageUrl} alt="Enemy aircraft" className="w-full h-full object-cover" />
                ) : (
                  <div className="w-full h-full flex items-center justify-center"><span className="text-xl">{'\u25C7'}</span></div>
                )}
                {intelCount < 6 && (
                  <span className="absolute -top-1 -right-1 text-[9px] bg-violet-500/30 text-violet-300 rounded-full w-4 h-4 flex items-center justify-center font-bold">?</span>
                )}
              </div>
              <p className="text-[10px] text-red-400 hud-text font-bold truncate max-w-[64px]">{state.enemy_intel.name.split(' ').pop()}</p>
              {/* Enemy intel summary - tap to expand */}
              <button onClick={() => setShowEnemyIntel(!showEnemyIntel)} className="mt-0.5">
                <span className="text-[9px] font-data" style={{ color: 'var(--color-text-muted)' }}>
                  INTEL {intelCount}/6 {showEnemyIntel ? '\u25B2' : '\u25BC'}
                </span>
              </button>
            </div>
          </div>

          {/* Resource strip */}
          <div className="flex gap-1.5 flex-wrap">
            {state.player_ammo.map((a, i) => (
              <div key={i} className={`flex items-center gap-1 rounded px-1.5 py-0.5 ${a.remaining === 0 ? 'bg-red-500/10' : 'bg-gray-900/60'}`}>
                <Crosshair className={`w-2.5 h-2.5 ${a.remaining === 0 ? 'text-red-400/60' : 'text-[#D4A843]/60'}`} />
                <span className="text-[9px] text-gray-400 hud-text">{a.weapon_name.split(' ').pop()}</span>
                <span className={`text-[10px] font-bold hud-text ${a.remaining === 0 ? 'text-red-400' : 'text-[#D4A843]'}`}>{a.remaining}</span>
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

      {/* ═══ ENEMY INTEL CARD (expandable) ═══ */}
      {showEnemyIntel && (
        <div className="mx-3 mb-1 rounded-lg p-2.5" style={{ background: 'var(--color-surface)', border: '1px solid var(--color-border)' }}>
          <div className="flex items-center justify-between mb-1.5">
            <span className="text-[10px] font-display tracking-wider" style={{ color: 'var(--color-amber)' }}>ENEMY INTELLIGENCE</span>
            <span className="text-[10px] font-data" style={{ color: 'var(--color-text-muted)' }}>{intelCount}/6 revealed</span>
          </div>
          <div className="grid grid-cols-3 gap-1.5">
            {[
              { label: 'RADAR', known: state.enemy_intel.radar_known, value: state.enemy_intel.radar_known ? `${state.enemy_intel.radar_range_km}km` : '\u2588\u2588\u2588' },
              { label: 'RCS', known: state.enemy_intel.rcs_known, value: state.enemy_intel.rcs_known ? `${state.enemy_intel.rcs_m2}m\u00B2` : '\u2588\u2588\u2588' },
              { label: 'ECM', known: state.enemy_intel.ecm_known, value: state.enemy_intel.ecm_known ? `${state.enemy_intel.ecm_rating}` : '\u2588\u2588\u2588' },
              { label: 'LOADOUT', known: state.enemy_intel.loadout_known, value: state.enemy_intel.loadout_known ? 'KNOWN' : '\u2588\u2588\u2588' },
              { label: 'FUEL', known: state.enemy_intel.fuel_known, value: state.enemy_intel.fuel_known ? `${state.enemy_intel.fuel_pct?.toFixed(0)}%` : '\u2588\u2588\u2588' },
              { label: 'DAMAGE', known: state.enemy_intel.damage_known, value: state.enemy_intel.damage_known ? `${state.enemy_intel.damage_pct?.toFixed(0)}%` : '\u2588\u2588\u2588' },
            ].map(item => (
              <div key={item.label} className="rounded p-1.5 text-center" style={{ background: 'var(--color-surface-raised)' }}>
                <p className="text-[8px] font-display tracking-wider" style={{ color: 'var(--color-text-muted)' }}>{item.label}</p>
                <p className={`text-[10px] font-data font-bold ${item.known ? '' : 'redacted'}`} style={{ color: item.known ? 'var(--color-text)' : 'var(--color-text-muted)' }}>
                  {item.value}
                </p>
              </div>
            ))}
          </div>
          {/* Observed weapons */}
          {state.enemy_intel.observed_weapons?.length > 0 && (
            <div className="mt-1.5">
              <p className="text-[8px] font-display tracking-wider mb-0.5" style={{ color: 'var(--color-text-muted)' }}>OBSERVED WEAPONS</p>
              <div className="flex gap-1 flex-wrap">
                {state.enemy_intel.observed_weapons.map((w: string, i: number) => (
                  <span key={i} className="text-[9px] font-data px-1.5 py-0.5 rounded" style={{ background: 'rgba(196,69,60,0.1)', color: 'var(--color-red)' }}>{w}</span>
                ))}
              </div>
            </div>
          )}
        </div>
      )}

      {/* ═══ ENGAGEMENT TICKER ═══ */}
      {ticker.length > 0 && (
        <div className="mx-3 py-1 overflow-hidden" style={{ borderBottom: '1px solid var(--color-border)' }}>
          <div className="flex gap-4 text-[10px] font-data overflow-x-auto whitespace-nowrap" style={{ color: 'var(--color-text-secondary)' }}>
            {ticker.map((t, i) => (
              <span key={i} className={i === ticker.length - 1 ? 'text-[var(--color-text)]' : ''}>{t}</span>
            ))}
          </div>
        </div>
      )}

      {/* ═══ COMBAT LOG ═══ */}
      <div
        ref={logRef}
        className="mx-3 h-24 overflow-y-auto border-y border-[rgba(212,168,67,0.1)] bg-dossier-base/90 py-1 px-2 space-y-0.5"
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
                <span className="text-xs font-bold text-[#D4A843] hud-text">TURN {turnResult.turn_number} RESULT</span>
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
                className="w-full flex items-center justify-center gap-2 bg-[#D4A843] text-[#0C0E12] font-bold text-sm py-3 rounded-xl active:bg-[#9A7A35] disabled:opacity-60 transition-colors hud-text tracking-wider"
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
            {/* Tactical advisor hint */}
            {!choosing && (() => {
              const hint = getTacticalHint();
              if (!hint) return null;
              return (
                <div className="mb-1.5 px-2.5 py-1.5 rounded-lg" style={{ background: 'rgba(212,168,67,0.06)', border: '1px solid rgba(212,168,67,0.1)' }}>
                  <p className="text-[11px] hud-text" style={{ color: 'var(--color-text-secondary)' }}>{hint}</p>
                </div>
              );
            })()}

            {choosing && (
              <div className="mb-1.5 rounded-xl bg-[rgba(212,168,67,0.05)] border border-[rgba(212,168,67,0.2)] p-2 flex items-center gap-2">
                <Loader2 className="w-4 h-4 text-[#D4A843] animate-spin shrink-0" />
                <span className="text-xs text-[#D4A843] hud-text">EXECUTING...</span>
              </div>
            )}

            <div className="grid grid-cols-4 gap-1.5 pb-2">
              {state.available_actions.map((action) => {
                const isSelected = selectedAction === action.key;
                const isFire = action.pk_preview !== undefined && action.pk_preview !== null;
                const icon = action.key.startsWith('fire_bvr') ? '\uD83D\uDE80' : action.key.startsWith('fire_ir') ? '\uD83D\uDD25' : ACTION_ICONS[action.key] || '\u26A1';

                // Short label: for fire actions extract weapon short name, otherwise first word max 5 chars
                let shortLabel: string;
                if (action.key.startsWith('fire_')) {
                  const parts = action.label.split(' ');
                  shortLabel = (parts.length > 1 ? parts.slice(1).join(' ') : parts[0]).slice(0, 5).toUpperCase();
                } else {
                  shortLabel = action.label.split(' ')[0].toUpperCase().slice(0, 5);
                }

                return (
                  <button
                    key={action.key}
                    onClick={() => handleAction(action)}
                    disabled={choosing}
                    className={`rounded-lg p-2 text-center transition-all active:scale-95 disabled:opacity-40 ${
                      isSelected ? 'bg-[rgba(212,168,67,0.15)] border-[#D4A843]' : ''
                    }`}
                    style={{
                      background: isSelected ? 'rgba(212,168,67,0.15)' : 'var(--color-surface)',
                      border: `1px solid ${isSelected ? 'var(--color-amber)' : 'var(--color-border)'}`,
                    }}
                    title={action.description}
                  >
                    <span className="text-lg block">{icon}</span>
                    <span className="text-[8px] font-display tracking-wider block mt-0.5" style={{ color: 'var(--color-text-secondary)' }}>
                      {shortLabel}
                    </span>
                    {isFire && action.pk_preview != null && (
                      <span className={`text-[8px] font-data font-bold block ${
                        action.pk_preview >= 0.6 ? 'text-emerald-400' : action.pk_preview >= 0.3 ? 'text-amber-400' : 'text-red-400'
                      }`}>
                        {(action.pk_preview * 100).toFixed(0)}%
                      </span>
                    )}
                    {isSelected && choosing && (
                      <Loader2 className="w-3 h-3 animate-spin mx-auto mt-0.5" style={{ color: 'var(--color-amber)' }} />
                    )}
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
