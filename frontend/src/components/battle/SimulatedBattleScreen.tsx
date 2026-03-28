import { useState, useEffect, useRef } from 'react';
import { ChevronRight, Zap, SkipForward, AlertTriangle, CheckCircle2, Target } from 'lucide-react';
import '../../styles/design-system.css';
import './animations.css';

interface TurnData {
  turn_number: number;
  player_action: string;
  enemy_action: string;
  weapon_fired: string | null;
  shot_pk: number | null;
  shot_hit: boolean | null;
  damage_dealt: number;
  enemy_weapon_fired: string | null;
  enemy_shot_pk: number | null;
  enemy_shot_hit: boolean | null;
  damage_taken: number;
  range_change: number;
  new_range: number;
  zone: string;
  intel_revealed: string | null;
  fuel_consumed: number;
  narrative: string;
  factors: Array<{ name: string; value: string; impact: string; description: string }>;
}

interface SimulatedBattleScreenProps {
  turns: TurnData[];
  report: any;
  playerName: string;
  enemyName: string;
  objective: string;
  playerImageUrl?: string | null;
  enemyImageUrl?: string | null;
  initialRange: number;
  initialFuel: number;
  maxTurns: number;
  onComplete: (report: any) => void;
}

const ZONE_COLORS: Record<string, string> = {
  BVR: 'var(--color-accent-blue, #3b82f6)',
  TRANSITION: 'var(--color-amber)',
  WVR: 'var(--color-red, #ef4444)',
};

function zoneLabel(zone: string): string {
  if (zone === 'TRANSITION') return 'TRANS';
  return zone;
}

export const SimulatedBattleScreen = ({
  turns,
  report,
  playerName,
  enemyName,
  playerImageUrl,
  enemyImageUrl,
  initialRange,
  initialFuel,
  maxTurns,
  onComplete,
}: SimulatedBattleScreenProps) => {
  const [currentIdx, setCurrentIdx] = useState(-1); // -1 = pre-battle
  const [isPlaying, setIsPlaying] = useState(true);
  const [showResult, setShowResult] = useState(false);
  const logRef = useRef<HTMLDivElement>(null);
  const TURN_DELAY = 1600; // ms between turns

  // Auto-advance turns
  useEffect(() => {
    if (!isPlaying || currentIdx >= turns.length - 1) return;
    const t = setTimeout(() => {
      setCurrentIdx(i => {
        const next = i + 1;
        if (next >= turns.length - 1) {
          // Last turn — show result shortly after
          setTimeout(() => setShowResult(true), 1200);
        }
        return next;
      });
    }, currentIdx === -1 ? 800 : TURN_DELAY);
    return () => clearTimeout(t);
  }, [currentIdx, isPlaying, turns.length]);

  // Auto-scroll log
  useEffect(() => {
    if (logRef.current) {
      logRef.current.scrollTop = logRef.current.scrollHeight;
    }
  }, [currentIdx]);

  // Derived state at current turn
  const visibleTurns = turns.slice(0, Math.max(0, currentIdx + 1));
  const currentTurn = currentIdx >= 0 ? turns[currentIdx] : null;

  const rangeKm = currentTurn ? currentTurn.new_range : initialRange;
  const zone = currentTurn ? currentTurn.zone : (initialRange > 40 ? 'BVR' : initialRange > 15 ? 'TRANSITION' : 'WVR');
  const fuelPct = Math.max(0, initialFuel - visibleTurns.reduce((s, t) => s + (t.fuel_consumed || 0), 0));
  const playerDmg = Math.min(100, visibleTurns.reduce((s, t) => s + (t.damage_taken || 0), 0));
  const enemyDmg = Math.min(100, visibleTurns.reduce((s, t) => s + (t.damage_dealt || 0), 0));

  // Range bar position (0–1), max range 400km
  const MAX_RANGE = 400;
  const rangePos = Math.min(1, Math.max(0, rangeKm / MAX_RANGE));
  const bvrPos = 40 / MAX_RANGE;
  const wvrPos = 15 / MAX_RANGE;

  const zoneColor = ZONE_COLORS[zone] || ZONE_COLORS.BVR;

  const skip = () => {
    setIsPlaying(false);
    setCurrentIdx(turns.length - 1);
    setTimeout(() => setShowResult(true), 400);
  };

  // ─── Result overlay ───
  if (showResult) {
    const success = report.success;
    return (
      <div
        className="min-h-[100dvh] flex flex-col items-center justify-center px-4 pb-safe"
        style={{ background: 'var(--color-base)' }}
      >
        <div className="w-full max-w-sm">
          {/* Outcome banner */}
          <div
            className="rounded-lg p-5 mb-5 text-center"
            style={{
              background: success ? 'rgba(16,185,129,0.1)' : 'rgba(239,68,68,0.1)',
              border: `1px solid ${success ? 'rgba(16,185,129,0.4)' : 'rgba(239,68,68,0.4)'}`,
            }}
          >
            {success ? (
              <CheckCircle2 className="w-10 h-10 mx-auto mb-2" style={{ color: '#10b981' }} />
            ) : (
              <AlertTriangle className="w-10 h-10 mx-auto mb-2" style={{ color: 'var(--color-red)' }} />
            )}
            <h2
              className="text-xl font-display tracking-widest mb-1"
              style={{ color: success ? '#10b981' : 'var(--color-red)' }}
            >
              {success ? 'MISSION SUCCESS' : 'MISSION FAILED'}
            </h2>
            <p className="text-sm" style={{ color: 'var(--color-text-secondary)' }}>
              {report.exit_reason?.replace(/_/g, ' ').toUpperCase() || 'ENGAGEMENT CONCLUDED'}
            </p>
          </div>

          {/* Stats */}
          <div className="grid grid-cols-2 gap-3 mb-5">
            {[
              { label: 'TURNS', value: report.turns_played },
              { label: 'DMG DEALT', value: `${report.damage_dealt?.toFixed(0)}%` },
              { label: 'DMG TAKEN', value: `${report.damage_taken?.toFixed(0)}%` },
              { label: 'FUEL LEFT', value: `${report.fuel_remaining?.toFixed(0)}%` },
            ].map(({ label, value }) => (
              <div
                key={label}
                className="rounded p-3 text-center"
                style={{ background: 'var(--color-surface)', border: '1px solid var(--color-border)' }}
              >
                <div className="text-xs mb-1" style={{ color: 'var(--color-text-muted)' }}>{label}</div>
                <div className="text-lg font-display" style={{ color: 'var(--color-text)' }}>{value}</div>
              </div>
            ))}
          </div>

          {/* Payout */}
          <div
            className="rounded-lg p-4 mb-5 flex items-center justify-between"
            style={{ background: 'var(--color-surface)', border: '1px solid var(--color-border)' }}
          >
            <div>
              <div className="text-xs mb-1" style={{ color: 'var(--color-text-muted)' }}>PAYOUT</div>
              <div className="text-xl font-display" style={{ color: 'var(--color-amber)' }}>
                ${report.payout?.toLocaleString()}
              </div>
            </div>
            <div className="text-right">
              <div className="text-xs mb-1" style={{ color: 'var(--color-text-muted)' }}>REP</div>
              <div
                className="text-xl font-display"
                style={{ color: (report.reputation_change || 0) >= 0 ? '#10b981' : 'var(--color-red)' }}
              >
                {(report.reputation_change || 0) >= 0 ? '+' : ''}{report.reputation_change}
              </div>
            </div>
          </div>

          <button
            onClick={() => onComplete({
              ...report,
              player_name: playerName,
              enemy_name: enemyName,
              narrative_summary: report.narrative || report.narrative_summary || '',
              phases: turns.map(t => ({
                phase_number: t.turn_number,
                phase_name: `Turn ${t.turn_number}`,
                player_choice: t.player_action,
                choice_quality: t.shot_hit ? 'good' : 'neutral',
                factors: t.factors || [],
                outcome: t,
                narrative: t.narrative,
              })),
              engine_version: 2,
            })}
            className="btn-primary w-full flex items-center justify-center gap-2"
          >
            VIEW AFTER-ACTION REPORT
            <ChevronRight className="w-4 h-4" />
          </button>
        </div>
      </div>
    );
  }

  // ─── Battle replay ───
  return (
    <div
      className="min-h-[100dvh] flex flex-col"
      style={{ background: 'var(--color-base)', maxWidth: 480, margin: '0 auto' }}
    >
      {/* Top bar */}
      <div
        className="flex items-center justify-between px-4 py-2 flex-shrink-0"
        style={{ borderBottom: '1px solid var(--color-border)', background: 'var(--color-surface)' }}
      >
        <span className="text-xs font-mono" style={{ color: 'var(--color-text-muted)' }}>
          TURN {currentIdx >= 0 ? turns[currentIdx].turn_number : '—'}/{maxTurns}
        </span>
        <span
          className="text-xs font-display px-2 py-0.5 rounded"
          style={{ background: zoneColor + '22', color: zoneColor, border: `1px solid ${zoneColor}44` }}
        >
          {zoneLabel(zone)}
        </span>
        <span className="text-xs font-mono" style={{ color: 'var(--color-text-muted)' }}>
          {rangeKm.toFixed(0)}km
        </span>
        <span className="text-xs font-mono" style={{ color: fuelPct < 25 ? 'var(--color-amber)' : 'var(--color-text-muted)' }}>
          ⛽{fuelPct.toFixed(0)}%
        </span>
      </div>

      {/* Range bar */}
      <div className="px-4 pt-3 pb-1 flex-shrink-0">
        <div
          className="relative h-2 rounded-full overflow-hidden"
          style={{ background: 'var(--color-surface-raised, #2a2a2a)' }}
        >
          {/* Zone segments */}
          <div className="absolute inset-0 flex">
            <div style={{ width: `${(1 - bvrPos) * 100}%`, background: 'rgba(239,68,68,0.35)' }} />
            <div style={{ width: `${(bvrPos - wvrPos) * 100}%`, background: 'rgba(245,158,11,0.35)' }} />
            <div style={{ width: `${wvrPos * 100}%`, background: 'rgba(59,130,246,0.35)' }} />
          </div>
          {/* Position marker */}
          <div
            className="absolute top-1/2 -translate-y-1/2 w-3 h-3 rounded-full border-2 border-white transition-all duration-700"
            style={{ left: `calc(${rangePos * 100}% - 6px)`, background: zoneColor }}
          />
        </div>
        <div className="flex justify-between text-xs mt-0.5" style={{ color: 'var(--color-text-muted)', opacity: 0.5 }}>
          <span>WVR</span>
          <span>TRANS</span>
          <span>BVR</span>
        </div>
      </div>

      {/* Aircraft view */}
      <div className="flex items-center justify-between px-6 py-3 flex-shrink-0">
        {/* Player */}
        <div className="flex flex-col items-center gap-1.5 w-24">
          <div
            className="w-14 h-14 rounded-full overflow-hidden flex items-center justify-center"
            style={{ background: 'var(--color-surface)', border: '2px solid rgba(16,185,129,0.4)' }}
          >
            {playerImageUrl ? (
              <img src={playerImageUrl} alt={playerName} className="w-full h-full object-cover" />
            ) : (
              <span style={{ fontSize: 24 }}>✈</span>
            )}
          </div>
          <span className="text-xs text-center font-display leading-tight" style={{ color: 'var(--color-text-secondary)' }}>
            {playerName.split(' ')[0]}
          </span>
          {/* Damage bar */}
          <div className="w-full h-1.5 rounded-full overflow-hidden" style={{ background: 'var(--color-surface)' }}>
            <div
              className="h-full rounded-full transition-all duration-500"
              style={{ width: `${100 - playerDmg}%`, background: playerDmg > 60 ? 'var(--color-red)' : playerDmg > 30 ? 'var(--color-amber)' : '#10b981' }}
            />
          </div>
          <span className="text-xs font-mono" style={{ color: 'var(--color-text-muted)' }}>
            {(100 - playerDmg).toFixed(0)}%
          </span>
        </div>

        {/* VS indicator */}
        <div className="flex flex-col items-center gap-1">
          <Target className="w-5 h-5" style={{ color: 'var(--color-text-muted)' }} />
          <div className="text-xs font-mono" style={{ color: 'var(--color-text-muted)' }}>
            {rangeKm.toFixed(0)}km
          </div>
        </div>

        {/* Enemy */}
        <div className="flex flex-col items-center gap-1.5 w-24">
          <div
            className="w-14 h-14 rounded-full overflow-hidden flex items-center justify-center"
            style={{ background: 'var(--color-surface)', border: '2px solid rgba(239,68,68,0.4)' }}
          >
            {enemyImageUrl ? (
              <img src={enemyImageUrl} alt={enemyName} className="w-full h-full object-cover" />
            ) : (
              <span style={{ fontSize: 24 }}>◇</span>
            )}
          </div>
          <span className="text-xs text-center font-display leading-tight" style={{ color: 'var(--color-text-secondary)' }}>
            {enemyName.split(' ')[0]}
          </span>
          {/* Damage bar */}
          <div className="w-full h-1.5 rounded-full overflow-hidden" style={{ background: 'var(--color-surface)' }}>
            <div
              className="h-full rounded-full transition-all duration-500"
              style={{ width: `${100 - enemyDmg}%`, background: enemyDmg > 60 ? '#10b981' : enemyDmg > 30 ? 'var(--color-amber)' : 'var(--color-red)' }}
            />
          </div>
          <span className="text-xs font-mono" style={{ color: 'var(--color-text-muted)' }}>
            {(100 - enemyDmg).toFixed(0)}%
          </span>
        </div>
      </div>

      {/* Turn log */}
      <div
        ref={logRef}
        className="flex-1 overflow-y-auto px-4 pb-2 space-y-2"
        style={{ minHeight: 0 }}
      >
        {currentIdx === -1 && (
          <div className="text-center py-4">
            <div className="text-xs animate-pulse" style={{ color: 'var(--color-text-muted)' }}>
              ENGAGEMENT COMMENCING...
            </div>
          </div>
        )}

        {visibleTurns.map((turn, i) => {
          const isLatest = i === visibleTurns.length - 1;
          return (
            <div
              key={turn.turn_number}
              className="rounded-lg p-3 space-y-1.5"
              style={{
                background: isLatest ? 'var(--color-surface-raised, #252525)' : 'var(--color-surface)',
                border: `1px solid ${isLatest ? 'var(--color-border-active, #444)' : 'var(--color-border)'}`,
                opacity: isLatest ? 1 : 0.75,
              }}
            >
              {/* Turn header */}
              <div className="flex items-center justify-between">
                <span className="text-xs font-display" style={{ color: 'var(--color-text-muted)' }}>
                  TURN {turn.turn_number}
                </span>
                <span
                  className="text-xs px-1.5 py-0.5 rounded font-mono"
                  style={{
                    background: ZONE_COLORS[turn.zone] + '22',
                    color: ZONE_COLORS[turn.zone],
                  }}
                >
                  {turn.zone} · {turn.new_range.toFixed(0)}km
                </span>
              </div>

              {/* Narrative */}
              <p className="text-sm leading-snug" style={{ color: 'var(--color-text)' }}>
                {turn.narrative}
              </p>

              {/* Hit/miss indicators */}
              <div className="flex gap-2 flex-wrap">
                {turn.shot_hit !== null && (
                  <span
                    className="text-xs px-2 py-0.5 rounded font-mono"
                    style={{
                      background: turn.shot_hit ? 'rgba(16,185,129,0.15)' : 'rgba(239,68,68,0.15)',
                      color: turn.shot_hit ? '#10b981' : 'var(--color-red)',
                      border: `1px solid ${turn.shot_hit ? 'rgba(16,185,129,0.3)' : 'rgba(239,68,68,0.3)'}`,
                    }}
                  >
                    {turn.weapon_fired} → {turn.shot_hit ? `HIT ${turn.damage_dealt?.toFixed(0)}%` : `MISS Pk${((turn.shot_pk || 0) * 100).toFixed(0)}%`}
                  </span>
                )}
                {turn.enemy_shot_hit !== null && (
                  <span
                    className="text-xs px-2 py-0.5 rounded font-mono"
                    style={{
                      background: turn.enemy_shot_hit ? 'rgba(239,68,68,0.15)' : 'rgba(16,185,129,0.15)',
                      color: turn.enemy_shot_hit ? 'var(--color-red)' : '#10b981',
                      border: `1px solid ${turn.enemy_shot_hit ? 'rgba(239,68,68,0.3)' : 'rgba(16,185,129,0.3)'}`,
                    }}
                  >
                    INBOUND {turn.enemy_weapon_fired} → {turn.enemy_shot_hit ? `HIT ${turn.damage_taken?.toFixed(0)}%` : 'EVADED'}
                  </span>
                )}
                {turn.intel_revealed && (
                  <span
                    className="text-xs px-2 py-0.5 rounded font-mono"
                    style={{
                      background: 'rgba(139,92,246,0.15)',
                      color: '#a78bfa',
                      border: '1px solid rgba(139,92,246,0.3)',
                    }}
                  >
                    INTEL: {turn.intel_revealed.toUpperCase()}
                  </span>
                )}
              </div>
            </div>
          );
        })}

        {/* Playing indicator */}
        {isPlaying && currentIdx < turns.length - 1 && (
          <div className="flex items-center gap-2 px-1 py-1">
            <Zap className="w-3 h-3 animate-pulse" style={{ color: 'var(--color-amber)' }} />
            <span className="text-xs animate-pulse" style={{ color: 'var(--color-text-muted)' }}>
              Processing turn {currentIdx + 2}...
            </span>
          </div>
        )}
      </div>

      {/* Controls */}
      <div
        className="flex items-center justify-between px-4 py-3 flex-shrink-0"
        style={{
          borderTop: '1px solid var(--color-border)',
          background: 'var(--color-surface)',
          paddingBottom: 'max(0.75rem, env(safe-area-inset-bottom, 0px))',
        }}
      >
        <div className="flex items-center gap-2">
          <div
            className="w-2 h-2 rounded-full"
            style={{ background: isPlaying && currentIdx < turns.length - 1 ? 'var(--color-amber)' : '#10b981', animation: isPlaying && currentIdx < turns.length - 1 ? 'pulse 1s infinite' : 'none' }}
          />
          <span className="text-xs font-mono" style={{ color: 'var(--color-text-muted)' }}>
            {isPlaying && currentIdx < turns.length - 1 ? 'SIMULATING...' : 'COMPLETE'}
          </span>
        </div>

        {currentIdx < turns.length - 1 && (
          <button
            onClick={skip}
            className="flex items-center gap-1.5 px-3 py-1.5 rounded text-xs font-display"
            style={{
              background: 'var(--color-surface-raised, #2a2a2a)',
              color: 'var(--color-text-secondary)',
              border: '1px solid var(--color-border)',
            }}
          >
            SKIP TO RESULT
            <SkipForward className="w-3 h-3" />
          </button>
        )}

        {currentIdx >= turns.length - 1 && !showResult && (
          <button
            onClick={() => setShowResult(true)}
            className="btn-primary flex items-center gap-1.5 text-xs px-3 py-1.5"
          >
            VIEW RESULT
            <ChevronRight className="w-3 h-3" />
          </button>
        )}
      </div>
    </div>
  );
};
