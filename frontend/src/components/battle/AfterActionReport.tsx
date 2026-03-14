import {
  Trophy,
  Skull,
  DollarSign,
  Shield,
  ChevronRight,
  Zap,
} from 'lucide-react';
import { useNavigate } from 'react-router-dom';

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
  player_name: string;
  enemy_name: string;
  success: boolean;
  payout: number;
  reputation_change: number;
  damage_dealt: number;
  damage_taken: number;
  narrative_summary: string;
  phases: PhaseData[];
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

export const AfterActionReport = ({ report }: AfterActionReportProps) => {
  const navigate = useNavigate();

  return (
    <div className="min-h-[100dvh] bg-gray-950 flex flex-col">
      {/* Banner */}
      <div className={`px-4 py-6 text-center ${report.success ? 'bg-emerald-500/10' : 'bg-red-500/10'}`}>
        <div className={`w-16 h-16 rounded-full mx-auto flex items-center justify-center mb-3 ${
          report.success ? 'bg-emerald-500/20' : 'bg-red-500/20'
        }`}>
          {report.success
            ? <Trophy className="w-8 h-8 text-emerald-400" />
            : <Skull className="w-8 h-8 text-red-400" />
          }
        </div>
        <h1 className="text-xl font-bold text-white">
          {report.success ? 'Mission Success' : 'Mission Failed'}
        </h1>
        <p className="text-sm text-gray-400 mt-1">
          {report.player_name} vs {report.enemy_name}
        </p>
      </div>

      {/* Scrollable content */}
      <div className="flex-1 overflow-y-auto px-4 py-4 pb-24 space-y-4">

        {/* Rewards */}
        <div className="grid grid-cols-2 gap-2">
          <div className="bg-gray-900 rounded-xl p-3.5 text-center border border-gray-800/60">
            <DollarSign className="w-4 h-4 text-emerald-400 mx-auto mb-1" />
            <p className="text-xl font-bold text-emerald-400">${report.payout.toLocaleString()}</p>
            <p className="text-[10px] text-gray-500">Payout</p>
          </div>
          <div className="bg-gray-900 rounded-xl p-3.5 text-center border border-gray-800/60">
            <Zap className="w-4 h-4 text-blue-400 mx-auto mb-1" />
            <p className={`text-xl font-bold ${report.reputation_change >= 0 ? 'text-blue-400' : 'text-red-400'}`}>
              {report.reputation_change >= 0 ? '+' : ''}{report.reputation_change}
            </p>
            <p className="text-[10px] text-gray-500">Reputation</p>
          </div>
        </div>

        {/* Damage summary */}
        <div className="bg-gray-900 rounded-xl border border-gray-800/60 p-3.5">
          <div className="flex items-center justify-between mb-2">
            <span className="text-xs text-emerald-400 font-semibold">You</span>
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
                    <div className="h-full bg-emerald-500 rounded-l-full" style={{ width: `${(yourHp / total) * 100}%` }} />
                    <div className="h-full bg-red-500 rounded-r-full" style={{ width: `${(enemyHp / total) * 100}%` }} />
                  </>
                );
              })()}
            </div>
            <span className="text-sm font-bold text-white w-14 text-right">{(100 - report.damage_dealt).toFixed(0)}%</span>
          </div>
          <div className="flex items-center justify-between text-[10px] text-gray-500">
            <span>-{report.damage_taken.toFixed(0)}% damage taken</span>
            <span>-{report.damage_dealt.toFixed(0)}% damage dealt</span>
          </div>
        </div>

        {/* Phase timeline */}
        <div>
          <p className="text-[10px] text-gray-500 uppercase tracking-wider font-semibold mb-3">Battle Timeline</p>
          <div className="space-y-0">
            {report.phases.map((phase, i) => {
              const q = qualityStyles[phase.choice_quality] || qualityStyles.neutral;
              return (
                <div key={i} className="relative flex gap-3">
                  {/* Timeline line */}
                  <div className="flex flex-col items-center">
                    <div className={`w-3 h-3 rounded-full ${q.dot} shrink-0 mt-1`} />
                    {i < report.phases.length - 1 && <div className="w-px flex-1 bg-gray-800 my-1" />}
                  </div>

                  {/* Phase card */}
                  <div className="flex-1 bg-gray-900 rounded-xl border border-gray-800/60 p-3 mb-2">
                    <div className="flex items-center justify-between mb-1">
                      <span className="text-xs font-bold text-white">
                        Phase {phase.phase_number}: {phase.phase_name}
                      </span>
                      <span className={`text-[9px] font-bold uppercase px-1.5 py-0.5 rounded ${
                        q.dot.replace('bg-', 'bg-').replace('-400', '-500/15')
                      } ${q.dot.replace('bg-', 'text-')}`}>
                        {q.label}
                      </span>
                    </div>
                    <p className="text-[11px] text-emerald-400 font-medium mb-1">
                      → {choiceLabels[phase.player_choice] || phase.player_choice}
                    </p>
                    <p className="text-xs text-gray-400 leading-relaxed">
                      {phase.narrative.length > 150 ? phase.narrative.slice(0, 150) + '...' : phase.narrative}
                    </p>

                    {/* Shot result if applicable */}
                    {phase.outcome?.player_shot && (
                      <div className={`mt-2 flex items-center gap-2 px-2 py-1 rounded-lg ${
                        phase.outcome.player_shot.hit ? 'bg-emerald-500/10' : 'bg-red-500/10'
                      }`}>
                        <span className="text-xs font-bold">{phase.outcome.player_shot.hit ? '💥' : '💨'}</span>
                        <span className="text-[10px] text-gray-300">
                          {phase.outcome.player_shot.weapon} — Pk {(phase.outcome.player_shot.pk * 100).toFixed(0)}% —{' '}
                          {phase.outcome.player_shot.hit ? 'HIT' : 'MISS'}
                        </span>
                      </div>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        </div>

        {/* Narrative summary */}
        <div className="bg-gray-900 rounded-xl border border-gray-800/60 p-3.5">
          <p className="text-[10px] text-gray-500 uppercase tracking-wider font-semibold mb-2">Summary</p>
          <p className="text-xs text-gray-300 leading-relaxed">{report.narrative_summary}</p>
        </div>
      </div>

      {/* Bottom button */}
      <div className="fixed bottom-0 left-0 right-0 p-4 pb-6 sm:pb-4 bg-gray-950/90 backdrop-blur-lg border-t border-gray-800">
        <button
          onClick={() => navigate('/contracts')}
          className="w-full flex items-center justify-center gap-2 bg-gray-800 text-white font-semibold text-sm py-3.5 rounded-xl active:bg-gray-700 transition-colors"
        >
          <ChevronRight className="w-4 h-4" />
          Return to Operations
        </button>
      </div>
    </div>
  );
};
