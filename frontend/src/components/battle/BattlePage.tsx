import { useState, useEffect } from 'react';
import { useParams, useSearchParams, useNavigate } from 'react-router-dom';
import { apiService } from '../../services/api';
import { LoadoutScreen } from './LoadoutScreen';
import { BattleScreen } from './BattleScreen';
import { TacticalBattleScreen } from './TacticalBattleScreen';
import { TacticalNavalScreen } from './TacticalNavalScreen';
import { SimulatedBattleScreen } from './SimulatedBattleScreen';
import { GroundForceScreen } from './GroundForceScreen';
import { MissionBriefing } from './MissionBriefing';
import { AfterActionReport } from './AfterActionReport';
import { Loader2, AlertTriangle, ArrowLeft } from 'lucide-react';
import '../../styles/design-system.css';

type Phase = 'loading' | 'briefing' | 'loadout' | 'ground_loadout' | 'battle' | 'report' | 'error';

export const BattlePage = () => {
  const { battleId: battleIdParam } = useParams();
  const [searchParams] = useSearchParams();
  const navigate = useNavigate();
  const [phase, setPhase] = useState<Phase>('loading');
  const [errorMsg, setErrorMsg] = useState('');

  // Data for each phase
  const [battleId, setBattleId] = useState<number>(0);
  const [battleType, setBattleType] = useState<string>('air');
  const [loadoutData, setLoadoutData] = useState<any>(null);
  const [battleState, setBattleState] = useState<any>(null);
  const [reportData, setReportData] = useState<any>(null);
  const [showTransition, setShowTransition] = useState(false);
  const [missionObjective, setMissionObjective] = useState<string | null>(null);
  const [playerImageUrl, setPlayerImageUrl] = useState<string | null>(null);
  const [enemyImageUrl, setEnemyImageUrl] = useState<string | null>(null);

  useEffect(() => {
    const init = async () => {
      // Ground battle — skip start_battle, go straight to force selection
      const groundParam = searchParams.get('ground');
      if (groundParam === '1') {
        setPhase('ground_loadout');
        return;
      }

      // If we have a battleId param, we're resuming an existing battle
      if (battleIdParam) {
        const bid = Number(battleIdParam);
        setBattleId(bid);
        try {
          const stateRes = await apiService.getBattleState(bid);
          const data = stateRes.data;
          setBattleType(data.battle_type || 'air');
          if (data.status === 'loadout') {
            setPhase('loading');
          } else if (data.status === 'in_progress') {
            setBattleState(data);
            setPhase('battle');
          } else {
            const reportRes = await apiService.getBattleReport(bid);
            setReportData(reportRes.data);
            setPhase('report');
          }
        } catch {
          setPhase('loading');
        }
        return;
      }

      // Start a new battle from search params
      const aircraftId = searchParams.get('aircraft');
      const shipId = searchParams.get('ship');
      const contractId = searchParams.get('contract');
      const contractorId = searchParams.get('contractor');

      if (!aircraftId && !shipId) {
        setErrorMsg('No aircraft or ship selected. Return to Operations and select a vehicle.');
        setPhase('error');
        return;
      }

      try {
        const startData: any = {};
        if (aircraftId) startData.aircraft_id = Number(aircraftId);
        if (shipId) startData.ship_id = Number(shipId);
        if (contractId) startData.contract_id = Number(contractId);
        if (contractorId) startData.contractor_id = Number(contractorId);

        const res = await apiService.startBattle(startData);
        const data = res.data;
        setBattleId(data.battle_id);
        setBattleType(data.battle_type);
        setLoadoutData(data);

        // Store objective if available from backend
        if (data.objective) setMissionObjective(data.objective);
        else if (data.mission_objective) setMissionObjective(data.mission_objective);

        // Store aircraft image URLs
        if (data.player_aircraft?.image_url) setPlayerImageUrl(data.player_aircraft.image_url);
        if (data.enemy_aircraft?.image_url) setEnemyImageUrl(data.enemy_aircraft.image_url);

        if (data.battle_type === 'naval') {
          const loadoutRes = await apiService.submitLoadout(data.battle_id, { weapons: [] });
          setBattleState(loadoutRes.data);
          // Store objective from battle state if available
          if (loadoutRes.data?.objective) setMissionObjective(loadoutRes.data.objective);
          setPhase('battle');
        } else {
          // Show briefing before loadout if we have mission info
          setPhase(data.mission_title || data.contract_title ? 'briefing' : 'loadout');
        }
      } catch (err: any) {
        const detail = err?.response?.data?.detail || 'Failed to start battle. Check your network and try again.';
        setErrorMsg(detail);
        setPhase('error');
      }
    };

    init();
  }, [battleIdParam, searchParams]);

  if (showTransition) {
    return <div className="transition-static" />;
  }

  if (phase === 'loading') {
    return (
      <div className="min-h-[100dvh] flex items-center justify-center" style={{ background: 'var(--color-base)' }}>
        <div className="flex flex-col items-center gap-3">
          <Loader2 className="w-8 h-8 animate-spin" style={{ color: 'var(--color-amber)' }} />
          <p className="text-sm" style={{ color: 'var(--color-text-muted)' }}>Preparing sortie...</p>
        </div>
      </div>
    );
  }

  if (phase === 'error') {
    return (
      <div className="min-h-[100dvh] flex items-center justify-center px-6" style={{ background: 'var(--color-base)' }}>
        <div className="max-w-sm w-full text-center">
          <AlertTriangle className="w-12 h-12 mx-auto mb-4" style={{ color: 'var(--color-red)' }} />
          <h2 className="text-lg font-display tracking-wider mb-2" style={{ color: 'var(--color-text)' }}>MISSION ABORTED</h2>
          <p className="text-sm mb-6" style={{ color: 'var(--color-text-secondary)' }}>{errorMsg}</p>
          <button
            onClick={() => navigate('/contracts')}
            className="btn-primary flex items-center justify-center gap-2 mx-auto"
          >
            <ArrowLeft className="w-4 h-4" />
            RETURN TO OPERATIONS
          </button>
        </div>
      </div>
    );
  }

  if (phase === 'ground_loadout') {
    const templateId = Number(searchParams.get('template'));
    return (
      <GroundForceScreen
        missionTemplateId={templateId}
        onReady={(simState) => {
          setBattleState(simState);
          setPhase('battle');
        }}
      />
    );
  }

  if (phase === 'briefing' && loadoutData) {
    return (
      <MissionBriefing
        missionTitle={loadoutData.mission_title || loadoutData.contract_title || 'Combat Sortie'}
        missionDescription={loadoutData.mission_description || loadoutData.contract_description}
        missionObjective={missionObjective || loadoutData.objective || loadoutData.mission_objective}
        difficulty={loadoutData.difficulty}
        riskLevel={loadoutData.risk_level}
        enemyName={loadoutData.enemy_aircraft?.name || loadoutData.enemy_name}
        playerVehicleName={loadoutData.player_aircraft?.name || loadoutData.player_name || 'Unknown'}
        playerCondition={loadoutData.player_aircraft?.condition ?? 100}
        battleType={battleType}
        onProceed={() => setPhase('loadout')}
      />
    );
  }

  if (phase === 'loadout' && loadoutData) {
    return (
      <LoadoutScreen
        battleId={battleId}
        aircraft={loadoutData.player_aircraft}
        enemy={loadoutData.enemy_aircraft}
        weapons={loadoutData.available_weapons}
        onReady={(stateData) => {
          setBattleState(stateData);
          setShowTransition(true);
          setTimeout(() => {
            setShowTransition(false);
            setPhase('battle');
          }, 600);
        }}
      />
    );
  }

  if (phase === 'battle' && battleState) {
    // Simulated replay — detected by mode field
    if (battleState.mode === 'simulated') {
      return (
        <SimulatedBattleScreen
          turns={battleState.turns}
          report={battleState.report}
          playerName={battleState.player_name || playerImageUrl ? (battleState.player_name || 'Player') : 'Player'}
          enemyName={battleState.enemy_name || 'Enemy'}
          objective={missionObjective || battleState.objective || 'air_superiority'}
          playerImageUrl={playerImageUrl}
          enemyImageUrl={enemyImageUrl}
          initialRange={battleState.initial_range || 250}
          initialFuel={battleState.initial_fuel || 85}
          maxTurns={battleState.max_turns || 20}
          onComplete={(report) => {
            setReportData(report);
            setPhase('report');
          }}
        />
      );
    }

    // v2 tactical engine — detected by max_turns field
    if (battleState.max_turns || battleState.engine_version === 2) {
      // Naval v2 — detected by player_compartments field
      if (battleState.player_compartments) {
        return (
          <TacticalNavalScreen
            battleId={battleId}
            initialState={battleState}
            objective={missionObjective || battleState.objective || undefined}
            onComplete={(report) => {
              setReportData(report);
              setPhase('report');
            }}
          />
        );
      }

      return (
        <TacticalBattleScreen
          battleId={battleId}
          initialState={battleState}
          objective={missionObjective || battleState.objective || undefined}
          playerImageUrl={playerImageUrl}
          enemyImageUrl={enemyImageUrl}
          onComplete={(report) => {
            setReportData(report);
            setPhase('report');
          }}
        />
      );
    }

    return (
      <BattleScreen
        battleId={battleId}
        battleType={battleType}
        initialState={battleState}
        onComplete={(report) => {
          setReportData(report);
          setPhase('report');
        }}
      />
    );
  }

  if (phase === 'report' && reportData) {
    return <AfterActionReport report={reportData} />;
  }

  return (
    <div className="min-h-[100dvh] flex items-center justify-center" style={{ background: 'var(--color-base)' }}>
      <div className="text-center">
        <p className="text-sm mb-4" style={{ color: 'var(--color-text-muted)' }}>Something went wrong.</p>
        <button
          onClick={() => navigate('/contracts')}
          className="btn-secondary flex items-center justify-center gap-2 mx-auto"
        >
          <ArrowLeft className="w-4 h-4" />
          RETURN TO OPERATIONS
        </button>
      </div>
    </div>
  );
};
