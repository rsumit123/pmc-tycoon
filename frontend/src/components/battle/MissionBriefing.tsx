import { Shield, AlertTriangle, ChevronRight } from 'lucide-react';
import '../../styles/design-system.css';

interface MissionBriefingProps {
  missionTitle: string;
  missionDescription?: string;
  missionObjective?: string;
  difficulty?: number;
  riskLevel?: number;
  enemyName?: string;
  playerVehicleName: string;
  playerCondition: number;
  battleType: string;
  onProceed: () => void;
}

const OBJECTIVE_DISPLAY: Record<string, string> = {
  air_superiority: 'NEUTRALIZE HOSTILE AIRCRAFT',
  interception: 'INTERCEPT AND DESTROY — TARGET IS FLEEING',
  escort: 'PROTECT CONVOY — SURVIVE WITH MINIMAL DAMAGE',
  strike: 'REACH TARGET ZONE AT <20KM',
  recon: 'SCAN ALL INTEL AND EXTRACT SAFELY',
  naval_patrol: 'ENGAGE AND DESTROY ENEMY VESSEL',
  blockade_run: 'BREAK THROUGH ENEMY BLOCKADE',
  fleet_defense: 'DEFEND POSITION — SURVIVE INCOMING ASSAULT',
};

const difficultyLabel = (d: number) => {
  if (d <= 1) return { text: 'TIER 1', color: 'var(--color-green)' };
  if (d <= 2) return { text: 'TIER 2', color: 'var(--color-amber)' };
  return { text: 'TIER 3', color: 'var(--color-red)' };
};

const riskLabel = (r: number) => {
  if (r <= 3) return { text: 'LOW', color: 'var(--color-green)' };
  if (r <= 6) return { text: 'MODERATE', color: 'var(--color-amber)' };
  return { text: 'HIGH', color: 'var(--color-red)' };
};

export const MissionBriefing = ({
  missionTitle,
  missionDescription,
  missionObjective,
  difficulty,
  riskLevel,
  enemyName,
  playerVehicleName,
  playerCondition,
  battleType,
  onProceed,
}: MissionBriefingProps) => {
  const objectiveText = missionObjective
    ? OBJECTIVE_DISPLAY[missionObjective] || missionObjective.replace(/_/g, ' ').toUpperCase()
    : 'DESTROY TARGET AND RTB';

  const diff = difficultyLabel(difficulty ?? 1);
  const risk = riskLabel(riskLevel ?? 3);
  const conditionColor = playerCondition >= 70 ? 'var(--color-green)' : playerCondition >= 40 ? 'var(--color-amber)' : 'var(--color-red)';

  return (
    <div className="min-h-[100dvh] flex flex-col" style={{ background: 'var(--color-base)' }}>
      {/* Header */}
      <div className="px-4 pt-6 pb-4 text-center">
        <span className="stamp stamp-confidential text-xs">MISSION BRIEFING</span>
        <h1 className="font-display text-xl mt-4" style={{ color: 'var(--color-text)' }}>
          {missionTitle}
        </h1>
        {missionDescription && (
          <p className="text-xs mt-2" style={{ color: 'var(--color-text-secondary)' }}>
            {missionDescription}
          </p>
        )}
      </div>

      {/* Scrollable content */}
      <div className="flex-1 overflow-y-auto px-4 pb-28 space-y-4">
        {/* Objective */}
        <div className="card-dossier-tab p-4">
          <p className="text-[10px] font-display tracking-wider mb-2" style={{ color: 'var(--color-amber)' }}>
            OBJECTIVE
          </p>
          <p className="font-display text-base" style={{ color: 'var(--color-text)', letterSpacing: '0.08em' }}>
            {objectiveText}
          </p>
        </div>

        {/* Threat Assessment */}
        <div className="card-dossier p-4">
          <p className="label-section mb-3" style={{ margin: 0, marginBottom: '12px' }}>THREAT ASSESSMENT</p>
          <div className="space-y-3">
            {enemyName && (
              <div className="flex items-center justify-between">
                <span className="text-xs" style={{ color: 'var(--color-text-muted)' }}>Hostile</span>
                <span className="font-data text-sm font-bold" style={{ color: 'var(--color-red)' }}>{enemyName}</span>
              </div>
            )}
            {difficulty !== undefined && (
              <div className="flex items-center justify-between">
                <span className="text-xs" style={{ color: 'var(--color-text-muted)' }}>Difficulty</span>
                <span className="font-data text-sm font-bold" style={{ color: diff.color }}>{diff.text}</span>
              </div>
            )}
            {riskLevel !== undefined && (
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-1.5">
                  <AlertTriangle className="w-3.5 h-3.5" style={{ color: risk.color }} />
                  <span className="text-xs" style={{ color: 'var(--color-text-muted)' }}>Risk Level</span>
                </div>
                <span className="font-data text-sm font-bold" style={{ color: risk.color }}>{risk.text}</span>
              </div>
            )}
          </div>
        </div>

        {/* Your Vehicle */}
        <div className="card-dossier p-4">
          <p className="label-section mb-3" style={{ margin: 0, marginBottom: '12px' }}>YOUR {battleType === 'naval' ? 'VESSEL' : 'AIRCRAFT'}</p>
          <div className="space-y-3">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-1.5">
                <Shield className="w-3.5 h-3.5" style={{ color: 'var(--color-amber)' }} />
                <span className="text-xs" style={{ color: 'var(--color-text-muted)' }}>Callsign</span>
              </div>
              <span className="font-data text-sm font-bold" style={{ color: 'var(--color-text)' }}>{playerVehicleName}</span>
            </div>
            <div className="flex items-center justify-between">
              <span className="text-xs" style={{ color: 'var(--color-text-muted)' }}>Condition</span>
              <div className="flex items-center gap-2">
                <div className="gauge-bar w-20" style={{ height: '4px' }}>
                  <div
                    className={`gauge-fill ${playerCondition >= 70 ? 'gauge-fill-green' : playerCondition >= 40 ? 'gauge-fill-amber' : 'gauge-fill-red'}`}
                    style={{ width: `${playerCondition}%` }}
                  />
                </div>
                <span className="font-data text-sm font-bold" style={{ color: conditionColor }}>{playerCondition}%</span>
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* Bottom button */}
      <div className="fixed bottom-0 left-0 right-0 p-4 pb-6 sm:pb-4 backdrop-blur-lg" style={{ background: 'rgba(12,14,18,0.9)', borderTop: '1px solid var(--color-border)' }}>
        <button onClick={onProceed} className="btn-primary w-full flex items-center justify-center gap-2 text-sm py-3.5">
          PROCEED TO LOADOUT
          <ChevronRight className="w-4 h-4" />
        </button>
      </div>
    </div>
  );
};
