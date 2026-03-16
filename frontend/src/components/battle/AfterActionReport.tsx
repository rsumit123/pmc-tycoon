import { useState } from 'react';
import {
  Trophy,
  Skull,
  DollarSign,
  ChevronRight,
  Zap,
  ChevronDown,
} from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import '../../styles/design-system.css';

interface PhaseData {
  phase_number: number;
  phase_name: string;
  player_choice: string;
  choice_quality: string;
  factors: Array<{ name: string; value: string; impact: string; description: string }>;
  outcome: any;
  narrative: string;
}

interface ReportData {
  battle_id: number;
  battle_type: string;
  engine_version?: number;
  player_name: string;
  enemy_name: string;
  success: boolean;
  payout: number;
  reputation_change: number;
  damage_dealt: number;
  damage_taken: number;
  narrative_summary: string;
  phases: PhaseData[];
  exit_reason?: string;
  turns_played?: number;
  fuel_remaining?: number;
  subsystem_wear?: Array<{
    slot_type: string;
    module_name: string;
    before: number;
    after: number;
    wear: number;
  }>;
}

interface AfterActionReportProps {
  report: ReportData;
}

const qualityStyles: Record<string, { dot: string; label: string }> = {
  optimal: { dot: 'bg-emerald-400', label: 'Optimal' },
  good: { dot: 'bg-blue-400', label: 'Good' },
  neutral: { dot: 'bg-gray-400', label: 'Neutral' },
  bad: { dot: 'bg-red-400', label: 'Poor' },
};

const choiceLabels: Record<string, string> = {
  aggressive_scan: 'Aggressive Scan', passive_irst: 'Passive IRST', early_ecm: 'Early ECM',
  fire_at_rmax: 'Fire at Max Range', close_to_rne: 'Close to Rne', hold_and_maneuver: 'Hold Fire',
  chaff_break: 'Chaff + Break', notch_beam: 'Notch & Beam', ecm_decoy: 'ECM + Decoy',
  ir_missile: 'IR Missile', guns_engage: 'Guns', disengage: 'Disengage',
  press_attack: 'Press Attack', rtb: 'RTB', call_reinforcements: 'Reinforcements',
  helicopter_recon: 'Helicopter Recon', passive_sonar: 'Passive Sonar', full_radar_sweep: 'Radar Sweep',
  full_salvo: 'Full Salvo', half_salvo: 'Half Salvo', sea_skim_profile: 'Sea-Skim',
  observe: 'Observe', ecm_support: 'ECM Support', second_wave: 'Second Wave',
  sam_priority: 'SAM Priority', ciws_reserve: 'CIWS Reserve', ecm_decoys: 'ECM + Decoys',
  pursue: 'Pursue', withdraw: 'Withdraw', damage_control: 'Damage Control',
};

const exitReasonLabels: Record<string, string> = {
  enemy_destroyed: 'Enemy Destroyed',
  player_destroyed: 'Shot Down',
  player_bingo_fuel: 'Bingo Fuel',
  player_disengaged: 'Disengaged',
  enemy_disengaged: 'Enemy Escaped',
  player_winchester: 'Out of Ammo',
  enemy_winchester: 'Enemy Out of Ammo',
  max_turns_reached: 'Time Limit',
};

export const AfterActionReport = ({ report }: AfterActionReportProps) => {
  const navigate = useNavigate();
  const [expandedTurns, setExpandedTurns] = useState(false);
  const isV2 = (report.engine_version || 1) >= 2;
  const manyTurns = isV2 && report.phases.length > 6;

  // For v2 with many turns, show first 3 + last 3, collapsible middle
  const visiblePhases = manyTurns && !expandedTurns
    ? [...report.phases.slice(0, 3), ...report.phases.slice(-3)]
    : report.phases;
  const hiddenCount = manyTurns ? report.phases.length - 6 : 0;

  return (
    <div className="min-h-[100dvh] bg-dossier-base flex flex-col">
      {/* Banner */}
      <div className={`px-4 py-6 text-center ${report.success ? 'bg-accent-green/10' : 'bg-red-500/10'}`}>
        <div className={`w-16 h-16 rounded-full mx-auto flex items-center justify-center mb-3 ${
          report.success ? 'bg-accent-green/20' : 'bg-red-500/20'
        }`}>
          {report.success
            ? <Trophy className="w-8 h-8 text-accent-green" />
            : <Skull className="w-8 h-8 text-red-400" />
          }
        </div>
        <div className="mb-2">
          <span className={report.success ? 'stamp stamp-success text-sm' : 'stamp stamp-failed text-sm'}>
            {report.success ? 'MISSION SUCCESS' : 'MISSION FAILED'}
          </span>
        </div>
        <h1 className="text-xl font-display tracking-wider text-ink">
          {report.success ? 'Mission Success' : 'Mission Failed'}
        </h1>
        <p className="text-sm text-ink-secondary mt-1">
          {report.player_name} vs {report.enemy_name}
        </p>
        {isV2 && (
          <div className="flex items-center justify-center gap-3 mt-2">
            {report.exit_reason && (
              <span className="text-[10px] font-bold uppercase px-2 py-0.5 rounded bg-gray-800 text-ink">
                {exitReasonLabels[report.exit_reason] || report.exit_reason}
              </span>
            )}
            {report.turns_played && (
              <span className="text-[10px] text-ink-secondary">
                {report.turns_played} turns
              </span>
            )}
          </div>
        )}
      </div>

      {/* Scrollable content */}
      <div className="flex-1 overflow-y-auto px-4 py-4 pb-24 space-y-4">

        {/* Rewards */}
        <div className="grid grid-cols-2 gap-2">
          <div className="bg-dossier-surface rounded-xl p-3.5 text-center border border-border">
            <DollarSign className="w-4 h-4 text-accent-green mx-auto mb-1" />
            <p className="text-xl font-bold text-accent-green">${report.payout.toLocaleString()}</p>
            <p className="text-[10px] text-ink-secondary">Payout</p>
          </div>
          <div className="bg-dossier-surface rounded-xl p-3.5 text-center border border-border">
            <Zap className="w-4 h-4 text-blue-400 mx-auto mb-1" />
            <p className={`text-xl font-bold ${report.reputation_change >= 0 ? 'text-blue-400' : 'text-red-400'}`}>
              {report.reputation_change >= 0 ? '+' : ''}{report.reputation_change}
            </p>
            <p className="text-[10px] text-ink-secondary">Reputation</p>
          </div>
        </div>

        {/* Damage summary */}
        <div className="bg-dossier-surface rounded-xl border border-border p-3.5">
          <div className="flex items-center justify-between mb-2">
            <span className="text-xs text-accent-green font-semibold">You</span>
            <span className="text-xs text-red-400 font-semibold">Enemy</span>
          </div>
          <div className="flex items-center gap-2 mb-1">
            <span className="text-sm font-bold text-white w-14 text-left">{(100 - report.damage_taken).toFixed(0)}%</span>
            <div className="flex-1 h-3 bg-gray-800 rounded-full overflow-hidden flex">
              {(() => {
                const yourHp = 100 - report.damage_taken;
                const enemyHp = 100 - report.damage_dealt;
                const total = yourHp + enemyHp || 1;
                return (
                  <>
                    <div className="h-full bg-accent-green rounded-l-full" style={{ width: `${(yourHp / total) * 100}%` }} />
                    <div className="h-full bg-red-500 rounded-r-full" style={{ width: `${(enemyHp / total) * 100}%` }} />
                  </>
                );
              })()}
            </div>
            <span className="text-sm font-bold text-white w-14 text-right">{(100 - report.damage_dealt).toFixed(0)}%</span>
          </div>
          <div className="flex items-center justify-between text-[10px] text-ink-secondary">
            <span>-{report.damage_taken.toFixed(0)}% damage taken</span>
            <span>-{report.damage_dealt.toFixed(0)}% damage dealt</span>
          </div>
        </div>

        {/* Phase timeline */}
        <div>
          <p className="text-[10px] text-ink-secondary uppercase tracking-wider font-semibold mb-3">
            Battle Timeline {isV2 && report.turns_played ? `— ${report.turns_played} turns` : ''}
          </p>
          <div className="space-y-0">
            {visiblePhases.map((phase, i) => {
              const q = qualityStyles[phase.choice_quality] || qualityStyles.neutral;
              const isV2Phase = isV2;
              const turnLabel = isV2Phase ? `Turn ${phase.phase_number}` : `Phase ${phase.phase_number}: ${phase.phase_name}`;
              const choiceDisplay = choiceLabels[phase.player_choice] || phase.player_choice.replace(/_/g, ' ');

              // For v2, extract hit/miss from outcome differently
              const v2Hit = isV2Phase && phase.outcome?.shot_hit;
              const v2Miss = isV2Phase && phase.outcome?.shot_hit === false;
              const v2WeaponFired = isV2Phase ? phase.outcome?.weapon_fired : null;
              const v2ShotPk = isV2Phase ? phase.outcome?.shot_pk : null;
              const v2DamageDealt = isV2Phase ? phase.outcome?.damage_dealt : null;

              // Show expand button after first 3 if collapsed
              const showExpander = manyTurns && !expandedTurns && i === 2;

              return (
                <div key={`${phase.phase_number}-${i}`}>
                  <div className="relative flex gap-3">
                    {/* Timeline line */}
                    <div className="flex flex-col items-center">
                      <div className={`w-3 h-3 rounded-full ${isV2Phase ? (v2Hit ? 'bg-emerald-400' : v2Miss ? 'bg-red-400' : 'bg-gray-400') : q.dot} shrink-0 mt-1`} />
                      {i < visiblePhases.length - 1 && <div className="w-px flex-1 bg-gray-800 my-1" />}
                    </div>

                    {/* Phase card */}
                    <div className="flex-1 bg-dossier-surface rounded-xl border border-border p-3 mb-2">
                      <div className="flex items-center justify-between mb-1">
                        <span className="text-xs font-bold text-white">{turnLabel}</span>
                        {!isV2Phase && (
                          <span className={`text-[9px] font-bold uppercase px-1.5 py-0.5 rounded ${
                            q.dot.replace('bg-', 'bg-').replace('-400', '-500/15')
                          } ${q.dot.replace('bg-', 'text-')}`}>
                            {q.label}
                          </span>
                        )}
                        {isV2Phase && phase.outcome?.zone && (
                          <span className="text-[9px] font-bold text-ink-secondary">{phase.outcome.zone}</span>
                        )}
                      </div>
                      <p className="text-[11px] text-accent-green font-medium mb-1">
                        → {choiceDisplay.toUpperCase()}
                        {isV2Phase && phase.outcome?.enemy_action && (
                          <span className="text-red-400 ml-2">
                            vs {(phase.outcome.enemy_action as string).replace(/_/g, ' ').toUpperCase()}
                          </span>
                        )}
                      </p>
                      <p className="text-xs text-ink-secondary leading-relaxed">
                        {(phase.narrative || phase.outcome?.narrative || '').length > 150
                          ? (phase.narrative || phase.outcome?.narrative || '').slice(0, 150) + '...'
                          : (phase.narrative || phase.outcome?.narrative || '')}
                      </p>

                      {/* v1 shot result */}
                      {!isV2Phase && phase.outcome?.player_shot && (
                        <div className={`mt-2 flex items-center gap-2 px-2 py-1 rounded-lg ${
                          phase.outcome.player_shot.hit ? 'bg-accent-green/10' : 'bg-red-500/10'
                        }`}>
                          <span className="text-xs font-bold">{phase.outcome.player_shot.hit ? '💥' : '💨'}</span>
                          <span className="text-[10px] text-ink">
                            {phase.outcome.player_shot.weapon} — Pk {(phase.outcome.player_shot.pk * 100).toFixed(0)}% —{' '}
                            {phase.outcome.player_shot.hit ? 'HIT' : 'MISS'}
                          </span>
                        </div>
                      )}

                      {/* v2 shot result */}
                      {isV2Phase && v2WeaponFired && v2ShotPk != null && (
                        <div className={`mt-2 flex items-center gap-2 px-2 py-1 rounded-lg ${
                          v2Hit ? 'bg-accent-green/10' : 'bg-red-500/10'
                        }`}>
                          <span className="text-xs font-bold">{v2Hit ? '💥' : '💨'}</span>
                          <span className="text-[10px] text-ink">
                            {v2WeaponFired} — Pk {(v2ShotPk * 100).toFixed(0)}% —{' '}
                            {v2Hit ? `HIT ${v2DamageDealt?.toFixed(0)}%` : 'MISS'}
                          </span>
                        </div>
                      )}

                      {/* v2 enemy shot */}
                      {isV2Phase && phase.outcome?.enemy_weapon_fired && (
                        <div className={`mt-1 flex items-center gap-2 px-2 py-1 rounded-lg ${
                          phase.outcome.enemy_shot_hit ? 'bg-red-500/10' : 'bg-accent-green/5'
                        }`}>
                          <span className="text-xs font-bold">{phase.outcome.enemy_shot_hit ? '⚠' : '✓'}</span>
                          <span className="text-[10px] text-ink">
                            Enemy {phase.outcome.enemy_weapon_fired} —{' '}
                            {phase.outcome.enemy_shot_hit ? `HIT ${phase.outcome.damage_taken?.toFixed(0)}%` : 'EVADED'}
                          </span>
                        </div>
                      )}
                    </div>
                  </div>

                  {/* Expand button for collapsed turns */}
                  {showExpander && (
                    <button
                      onClick={() => setExpandedTurns(true)}
                      className="w-full flex items-center justify-center gap-1.5 py-2 mb-2 text-xs text-ink-secondary hover:text-ink transition-colors"
                    >
                      <ChevronDown className="w-3.5 h-3.5" />
                      Show {hiddenCount} more turns
                    </button>
                  )}
                </div>
              );
            })}
          </div>
        </div>

        {/* Subsystem wear report */}
        {report.subsystem_wear && report.subsystem_wear.length > 0 && (
          <div className="bg-dossier-surface rounded-xl border border-border p-3.5">
            <p className="text-[10px] text-ink-secondary uppercase tracking-wider font-semibold mb-2.5">Subsystem Wear</p>
            <div className="space-y-2">
              {report.subsystem_wear.map((w) => (
                <div key={w.slot_type} className="flex items-center gap-2">
                  <span className="text-[10px] text-ink-secondary uppercase w-16 shrink-0 font-mono tracking-wider">{w.slot_type.slice(0, 6)}</span>
                  <div className="flex-1 h-2 bg-gray-800 rounded-full overflow-hidden">
                    <div
                      className={`h-full rounded-full transition-all ${w.after >= 70 ? 'bg-accent-green' : w.after >= 40 ? 'bg-amber-500' : 'bg-red-500'}`}
                      style={{ width: `${w.after}%` }}
                    />
                  </div>
                  <span className={`text-[10px] font-mono font-bold w-10 text-right ${w.after >= 70 ? 'text-accent-green' : w.after >= 40 ? 'text-amber-400' : 'text-red-400'}`}>
                    {w.after}%
                  </span>
                  <span className="text-[9px] text-red-400/60 font-mono w-10 text-right">-{w.wear}%</span>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* Fuel remaining */}
        {report.fuel_remaining !== undefined && report.fuel_remaining !== null && (
          <div className="flex items-center justify-between px-3.5 py-2 card-dossier mb-4">
            <span className="label-section" style={{ margin: 0 }}>FUEL REMAINING</span>
            <span className="font-data text-sm font-bold" style={{ color: report.fuel_remaining < 20 ? 'var(--color-red)' : 'var(--color-amber)' }}>
              {report.fuel_remaining.toFixed(0)}%
            </span>
          </div>
        )}

        {/* Narrative summary */}
        <div className="bg-dossier-surface rounded-xl border border-border p-3.5">
          <p className="text-[10px] text-ink-secondary uppercase tracking-wider font-semibold mb-2">Summary</p>
          <p className="text-xs text-ink leading-relaxed">{report.narrative_summary}</p>
        </div>
      </div>

      {/* Bottom button */}
      <div className="fixed bottom-0 left-0 right-0 p-4 pb-6 sm:pb-4 backdrop-blur-lg" style={{ background: 'rgba(12,14,18,0.9)', borderTop: '1px solid var(--color-border)' }}>
        <button onClick={() => navigate('/contracts')} className="btn-primary w-full flex items-center justify-center gap-2 text-sm py-3.5">
          <ChevronRight className="w-4 h-4" />
          RETURN TO OPERATIONS
        </button>
      </div>
    </div>
  );
};
