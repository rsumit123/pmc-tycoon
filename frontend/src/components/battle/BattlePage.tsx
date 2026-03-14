import { useState, useEffect } from 'react';
import { useParams, useSearchParams, useNavigate } from 'react-router-dom';
import { apiService } from '../../services/api';
import { LoadoutScreen } from './LoadoutScreen';
import { BattleScreen } from './BattleScreen';
import { TacticalBattleScreen } from './TacticalBattleScreen';
import { AfterActionReport } from './AfterActionReport';
import { Loader2, AlertTriangle, ArrowLeft } from 'lucide-react';

type Phase = 'loading' | 'loadout' | 'battle' | 'report' | 'error';

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
        setErrorMsg('No aircraft or ship selected. Return to Contracts and select a vehicle.');
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

        if (data.battle_type === 'naval') {
          // Naval loadout is fixed by ship class — auto-submit and go to battle
          const loadoutRes = await apiService.submitLoadout(data.battle_id, { weapons: [] });
          setBattleState(loadoutRes.data);
          setPhase('battle');
        } else {
          setPhase('loadout');
        }
      } catch (err: any) {
        const detail = err?.response?.data?.detail || 'Failed to start battle. Check your network and try again.';
        setErrorMsg(detail);
        setPhase('error');
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

  if (phase === 'error') {
    return (
      <div className="min-h-[100dvh] bg-gray-950 flex items-center justify-center px-6">
        <div className="max-w-sm w-full text-center">
          <AlertTriangle className="w-12 h-12 text-red-400 mx-auto mb-4" />
          <h2 className="text-lg font-bold text-white mb-2">Battle Failed to Start</h2>
          <p className="text-sm text-gray-400 mb-6">{errorMsg}</p>
          <button
            onClick={() => navigate('/contracts')}
            className="flex items-center justify-center gap-2 mx-auto bg-emerald-500 text-black font-bold text-sm py-3 px-6 rounded-xl active:bg-emerald-400 transition-colors"
          >
            <ArrowLeft className="w-4 h-4" />
            Return to Operations
          </button>
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
    // v2 tactical engine — detected by max_turns field
    if (battleState.max_turns || battleState.engine_version === 2) {
      return (
        <TacticalBattleScreen
          battleId={battleId}
          initialState={battleState}
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
    <div className="min-h-[100dvh] bg-gray-950 flex items-center justify-center">
      <div className="text-center">
        <p className="text-sm text-gray-500 mb-4">Something went wrong.</p>
        <button
          onClick={() => navigate('/contracts')}
          className="flex items-center justify-center gap-2 mx-auto bg-gray-800 text-gray-300 font-semibold text-sm py-2.5 px-5 rounded-xl active:bg-gray-700"
        >
          <ArrowLeft className="w-4 h-4" />
          Return to Operations
        </button>
      </div>
    </div>
  );
};
