import { useState, useEffect } from 'react';
import { useParams, useSearchParams } from 'react-router-dom';
import { apiService } from '../../services/api';
import { LoadoutScreen } from './LoadoutScreen';
import { BattleScreen } from './BattleScreen';
import { AfterActionReport } from './AfterActionReport';
import { Loader2 } from 'lucide-react';

type Phase = 'loading' | 'loadout' | 'battle' | 'report';

export const BattlePage = () => {
  const { battleId: battleIdParam } = useParams();
  const [searchParams] = useSearchParams();
  const [phase, setPhase] = useState<Phase>('loading');

  // Data for each phase
  const [battleId, setBattleId] = useState<number>(0);
  const [battleType, setBattleType] = useState<string>('air');
  const [loadoutData, setLoadoutData] = useState<any>(null);
  const [battleState, setBattleState] = useState<any>(null);
  const [reportData, setReportData] = useState<any>(null);

  useEffect(() => {
    const init = async () => {
      // If we have a battleId param, we're resuming an existing battle
      if (battleIdParam) {
        const bid = Number(battleIdParam);
        setBattleId(bid);
        try {
          const stateRes = await apiService.getBattleState(bid);
          const data = stateRes.data;
          setBattleType(data.battle_type || 'air');
          if (data.status === 'loadout') {
            // Need to re-fetch start data — not ideal but works
            setPhase('loading');
          } else if (data.status === 'in_progress') {
            setBattleState(data);
            setPhase('battle');
          } else {
            // Completed — show report
            const reportRes = await apiService.getBattleReport(bid);
            setReportData(reportRes.data);
            setPhase('report');
          }
        } catch {
          // Battle not started yet, try starting
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
        // No params — can't start
        setPhase('loading');
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

        if (data.battle_type === 'naval') {
          // Naval loadout is fixed — auto-submit empty loadout and go to battle
          const loadoutRes = await apiService.submitLoadout(data.battle_id, { weapons: [] });
          setBattleState(loadoutRes.data);
          setPhase('battle');
        } else {
          setPhase('loadout');
        }
      } catch (err) {
        console.error('Failed to start battle:', err);
      }
    };

    init();
  }, [battleIdParam, searchParams]);

  if (phase === 'loading') {
    return (
      <div className="min-h-[100dvh] bg-gray-950 flex items-center justify-center">
        <div className="flex flex-col items-center gap-3">
          <Loader2 className="w-8 h-8 text-emerald-500 animate-spin" />
          <p className="text-sm text-gray-500">Preparing battle...</p>
        </div>
      </div>
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
          setPhase('battle');
        }}
      />
    );
  }

  if (phase === 'battle' && battleState) {
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
    <div className="min-h-[100dvh] bg-gray-950 flex items-center justify-center">
      <p className="text-sm text-gray-500">Something went wrong. Return to Operations.</p>
    </div>
  );
};
