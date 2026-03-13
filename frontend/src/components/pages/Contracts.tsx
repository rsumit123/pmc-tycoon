import { useState, useEffect, useCallback } from 'react';
import {
  Clock,
  DollarSign,
  AlertTriangle,
  ChevronRight,
  Zap,
  X,
  Check,
  Target,
  Loader2,
  Trophy,
  Skull,
  Sparkles,
  RefreshCw,
} from 'lucide-react';
import { apiService } from '../../services/api';

interface MissionTemplate {
  id: number;
  title: string;
  description: string | null;
  faction: string;
  base_payout: number;
  risk_level: number;
  estimated_duration_hours: number;
  required_unit_types: string;
  political_impact: number;
  is_active: boolean;
}

interface ActiveContractData {
  id: number;
  user_id: number;
  mission_template_id: number;
  status: string;
  assigned_units: string | null;
  assigned_contractors: string | null;
  payout_received: number;
  reputation_change: number;
  started_at: string;
  expires_at: string;
  completed_at: string | null;
}

interface SimulationResult {
  contract_id: number;
  mission_title: string;
  success: boolean;
  payout: number;
  reputation_change: number;
  ally_strength: number;
  enemy_strength: number;
  random_events: Array<{ type: string; description: string; impact: number }>;
  new_balance: number;
  new_reputation: number;
}

const factionDisplayName: Record<string, string> = {
  atlantic_coalition: 'Atlantic Coalition',
  desert_bloc: 'Desert Bloc',
  pacific_alliance: 'Pacific Alliance',
  sahara_sindicate: 'Sahara Syndicate',
};

const factionColors: Record<string, { bg: string; text: string; dot: string }> = {
  atlantic_coalition: { bg: 'bg-blue-500/10', text: 'text-blue-400', dot: 'bg-blue-400' },
  desert_bloc: { bg: 'bg-amber-500/10', text: 'text-amber-400', dot: 'bg-amber-400' },
  pacific_alliance: { bg: 'bg-cyan-500/10', text: 'text-cyan-400', dot: 'bg-cyan-400' },
  sahara_sindicate: { bg: 'bg-orange-500/10', text: 'text-orange-400', dot: 'bg-orange-400' },
};

const riskBadge = (risk: number) => {
  if (risk < 30) return { label: 'Low', bg: 'bg-emerald-500/15', text: 'text-emerald-400' };
  if (risk < 70) return { label: 'Med', bg: 'bg-amber-500/15', text: 'text-amber-400' };
  return { label: 'High', bg: 'bg-red-500/15', text: 'text-red-400' };
};

type Tab = 'available' | 'active';

export const Contracts = () => {
  const [tab, setTab] = useState<Tab>('available');
  const [missionTemplates, setMissionTemplates] = useState<MissionTemplate[]>([]);
  const [activeContracts, setActiveContracts] = useState<ActiveContractData[]>([]);
  const [templateMap, setTemplateMap] = useState<Record<number, MissionTemplate>>({});
  const [loading, setLoading] = useState(true);
  const [actionLoading, setActionLoading] = useState<number | null>(null);
  const [simResult, setSimResult] = useState<SimulationResult | null>(null);
  const [refreshing, setRefreshing] = useState(false);

  const fetchData = useCallback(async () => {
    try {
      const [templatesRes, activeRes] = await Promise.all([
        apiService.getMissionTemplates(),
        apiService.getActiveContracts(),
      ]);

      const templates: MissionTemplate[] = Array.isArray(templatesRes.data) ? templatesRes.data : [];
      const active: ActiveContractData[] = Array.isArray(activeRes.data) ? activeRes.data : [];

      setMissionTemplates(templates);
      setActiveContracts(active.filter((c) => c.status === 'active' || c.status === 'pending'));

      const map: Record<number, MissionTemplate> = {};
      templates.forEach((t) => { map[t.id] = t; });
      setTemplateMap(map);
    } catch {
      // Keep whatever state we have
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, []);

  useEffect(() => {
    fetchData();
  }, [fetchData]);

  const handleRefresh = () => {
    setRefreshing(true);
    fetchData();
  };

  const handleAccept = async (template: MissionTemplate) => {
    setActionLoading(template.id);
    try {
      const expiresAt = new Date();
      expiresAt.setHours(expiresAt.getHours() + template.estimated_duration_hours);

      await apiService.createActiveContract({
        user_id: 1,
        mission_template_id: template.id,
        status: 'active',
        expires_at: expiresAt.toISOString(),
        assigned_units: null,
        assigned_contractors: null,
        payout_received: 0,
        reputation_change: 0,
        political_impact_change: 0,
      });

      await fetchData();
      setTab('active');
    } catch (err: any) {
      console.error('Failed to accept contract:', err);
    } finally {
      setActionLoading(null);
    }
  };

  const handleRunMission = async (contractId: number) => {
    setActionLoading(contractId);
    try {
      const res = await apiService.runMissionSimulation(contractId);
      setSimResult(res.data);
      await fetchData();
    } catch (err: any) {
      console.error('Failed to run mission:', err);
    } finally {
      setActionLoading(null);
    }
  };

  const handleWithdraw = async (contractId: number) => {
    setActionLoading(contractId);
    try {
      await apiService.deleteActiveContract(contractId);
      await fetchData();
    } catch (err: any) {
      console.error('Failed to withdraw:', err);
    } finally {
      setActionLoading(null);
    }
  };

  const parseRequiredUnits = (jsonStr: string): string[] => {
    try {
      return JSON.parse(jsonStr);
    } catch {
      return [jsonStr];
    }
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center h-full">
        <div className="flex flex-col items-center gap-3">
          <div className="w-8 h-8 border-2 border-emerald-500 border-t-transparent rounded-full animate-spin" />
          <p className="text-sm text-gray-500">Loading operations...</p>
        </div>
      </div>
    );
  }

  return (
    <div className="px-4 py-5 lg:px-8 lg:py-6 max-w-4xl mx-auto">
      {/* Mission Result Modal */}
      {simResult && (
        <div className="fixed inset-0 bg-black/70 backdrop-blur-sm z-50 flex items-center justify-center p-4" onClick={() => setSimResult(null)}>
          <div className="bg-gray-900 rounded-2xl border border-gray-800 max-w-sm w-full overflow-hidden" onClick={(e) => e.stopPropagation()}>
            {/* Result header */}
            <div className={`p-6 text-center ${simResult.success ? 'bg-emerald-500/10' : 'bg-red-500/10'}`}>
              <div className={`w-16 h-16 rounded-full mx-auto flex items-center justify-center mb-3 ${
                simResult.success ? 'bg-emerald-500/20' : 'bg-red-500/20'
              }`}>
                {simResult.success
                  ? <Trophy className="w-8 h-8 text-emerald-400" />
                  : <Skull className="w-8 h-8 text-red-400" />
                }
              </div>
              <h2 className="text-xl font-bold text-white">
                {simResult.success ? 'Mission Success!' : 'Mission Failed'}
              </h2>
              <p className="text-sm text-gray-400 mt-1">{simResult.mission_title}</p>
            </div>

            {/* Stats */}
            <div className="p-4 space-y-3">
              <div className="grid grid-cols-2 gap-2">
                <div className="bg-gray-800/50 rounded-xl p-3 text-center">
                  <p className="text-[10px] text-gray-500 uppercase tracking-wider">Payout</p>
                  <p className="text-lg font-bold text-emerald-400">${simResult.payout.toLocaleString()}</p>
                </div>
                <div className="bg-gray-800/50 rounded-xl p-3 text-center">
                  <p className="text-[10px] text-gray-500 uppercase tracking-wider">Reputation</p>
                  <p className={`text-lg font-bold ${simResult.reputation_change >= 0 ? 'text-blue-400' : 'text-red-400'}`}>
                    {simResult.reputation_change >= 0 ? '+' : ''}{simResult.reputation_change}
                  </p>
                </div>
              </div>

              <div className="grid grid-cols-2 gap-2">
                <div className="bg-gray-800/50 rounded-xl p-3 text-center">
                  <p className="text-[10px] text-gray-500 uppercase tracking-wider">New Balance</p>
                  <p className="text-sm font-bold text-white">${simResult.new_balance.toLocaleString()}</p>
                </div>
                <div className="bg-gray-800/50 rounded-xl p-3 text-center">
                  <p className="text-[10px] text-gray-500 uppercase tracking-wider">Reputation</p>
                  <p className="text-sm font-bold text-white">{simResult.new_reputation}%</p>
                </div>
              </div>

              {/* Random events */}
              {simResult.random_events.length > 0 && (
                <div className="space-y-1.5">
                  <p className="text-xs text-gray-500 uppercase tracking-wider">Events</p>
                  {simResult.random_events.map((event, i) => (
                    <div key={i} className="flex items-start gap-2 bg-gray-800/50 rounded-xl px-3 py-2">
                      <Sparkles className={`w-3.5 h-3.5 mt-0.5 shrink-0 ${event.impact > 0 ? 'text-emerald-400' : 'text-red-400'}`} />
                      <p className="text-xs text-gray-300">{event.description}</p>
                    </div>
                  ))}
                </div>
              )}

              <button
                onClick={() => setSimResult(null)}
                className="w-full bg-gray-800 text-white font-semibold text-sm py-3 rounded-xl active:bg-gray-700 transition-colors mt-2"
              >
                Dismiss
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Header */}
      <div className="flex items-center justify-between mb-5">
        <div>
          <h1 className="text-xl font-bold text-white lg:text-2xl">Operations</h1>
          <p className="text-sm text-gray-500 mt-0.5">Mission board & active deployments</p>
        </div>
        <button
          onClick={handleRefresh}
          disabled={refreshing}
          className="w-10 h-10 rounded-xl bg-gray-900 border border-gray-800 flex items-center justify-center text-gray-400 active:bg-gray-800 transition-colors"
        >
          <RefreshCw className={`w-4.5 h-4.5 ${refreshing ? 'animate-spin' : ''}`} />
        </button>
      </div>

      {/* Tab switcher */}
      <div className="flex bg-gray-900 rounded-xl p-1 mb-5">
        <button
          onClick={() => setTab('available')}
          className={`flex-1 py-2.5 rounded-lg text-sm font-semibold transition-all ${
            tab === 'available' ? 'bg-gray-800 text-white shadow-sm' : 'text-gray-500'
          }`}
        >
          Available ({missionTemplates.length})
        </button>
        <button
          onClick={() => setTab('active')}
          className={`flex-1 py-2.5 rounded-lg text-sm font-semibold transition-all relative ${
            tab === 'active' ? 'bg-gray-800 text-white shadow-sm' : 'text-gray-500'
          }`}
        >
          Active ({activeContracts.length})
          {activeContracts.length > 0 && tab !== 'active' && (
            <span className="absolute top-1.5 right-3 w-2 h-2 rounded-full bg-emerald-400 animate-subtle-pulse" />
          )}
        </button>
      </div>

      {/* Available contracts */}
      {tab === 'available' && (
        <div className="space-y-3">
          {missionTemplates.length === 0 ? (
            <EmptyState message="No contracts available. Check back later." />
          ) : (
            missionTemplates.map((template) => {
              const faction = factionColors[template.faction] ?? factionColors['atlantic_coalition'];
              const fName = factionDisplayName[template.faction] ?? template.faction;
              const risk = riskBadge(template.risk_level);
              const requiredUnits = parseRequiredUnits(template.required_unit_types);
              const isLoading = actionLoading === template.id;
              const alreadyAccepted = activeContracts.some((c) => c.mission_template_id === template.id);

              return (
                <div
                  key={template.id}
                  className="bg-gray-900 rounded-2xl border border-gray-800/60 overflow-hidden card-press"
                >
                  <div className="p-4">
                    {/* Top row */}
                    <div className="flex items-center justify-between mb-2.5">
                      <div className="flex items-center gap-2">
                        <div className={`w-2 h-2 rounded-full ${faction.dot}`} />
                        <span className={`text-xs font-medium ${faction.text}`}>{fName}</span>
                      </div>
                      <span className={`text-[10px] font-bold uppercase tracking-wider px-2 py-0.5 rounded-md ${risk.bg} ${risk.text}`}>
                        {risk.label} Risk
                      </span>
                    </div>

                    <h3 className="text-base font-bold text-white mb-1">{template.title}</h3>
                    {template.description && (
                      <p className="text-xs text-gray-500 mb-3">{template.description}</p>
                    )}

                    {/* Stats grid */}
                    <div className="grid grid-cols-3 gap-2 mb-3">
                      <div className="bg-gray-800/50 rounded-xl px-3 py-2">
                        <div className="flex items-center gap-1 mb-0.5">
                          <DollarSign className="w-3 h-3 text-emerald-400" />
                          <span className="text-[10px] text-gray-500">Payout</span>
                        </div>
                        <p className="text-sm font-bold text-white">${(template.base_payout / 1000).toFixed(0)}k</p>
                      </div>
                      <div className="bg-gray-800/50 rounded-xl px-3 py-2">
                        <div className="flex items-center gap-1 mb-0.5">
                          <Clock className="w-3 h-3 text-gray-400" />
                          <span className="text-[10px] text-gray-500">Duration</span>
                        </div>
                        <p className="text-sm font-bold text-white">{template.estimated_duration_hours}h</p>
                      </div>
                      <div className="bg-gray-800/50 rounded-xl px-3 py-2">
                        <div className="flex items-center gap-1 mb-0.5">
                          <Zap className="w-3 h-3 text-violet-400" />
                          <span className="text-[10px] text-gray-500">Impact</span>
                        </div>
                        <p className={`text-sm font-bold ${template.political_impact >= 0 ? 'text-emerald-400' : 'text-red-400'}`}>
                          {template.political_impact > 0 ? '+' : ''}{template.political_impact}
                        </p>
                      </div>
                    </div>

                    {/* Required units */}
                    <div className="flex items-center gap-1.5 mb-4 flex-wrap">
                      <Target className="w-3 h-3 text-gray-600 shrink-0" />
                      <span className="text-[10px] text-gray-500 uppercase tracking-wider mr-1">Requires</span>
                      {requiredUnits.map((unit) => (
                        <span key={unit} className="text-xs bg-gray-800 text-gray-300 px-2 py-0.5 rounded-md font-medium">
                          {unit}
                        </span>
                      ))}
                    </div>

                    {/* Accept button */}
                    <button
                      onClick={() => handleAccept(template)}
                      disabled={isLoading || alreadyAccepted}
                      className={`
                        w-full flex items-center justify-center gap-2 font-semibold text-sm py-3 rounded-xl transition-colors
                        ${alreadyAccepted
                          ? 'bg-gray-800 text-gray-500 cursor-not-allowed'
                          : 'bg-emerald-500 text-white active:bg-emerald-600 disabled:opacity-60'
                        }
                      `}
                    >
                      {isLoading ? (
                        <Loader2 className="w-4 h-4 animate-spin" />
                      ) : alreadyAccepted ? (
                        <>
                          <Check className="w-4 h-4" />
                          Already Accepted
                        </>
                      ) : (
                        <>
                          <Check className="w-4 h-4" />
                          Accept Mission
                        </>
                      )}
                    </button>
                  </div>
                </div>
              );
            })
          )}
        </div>
      )}

      {/* Active contracts */}
      {tab === 'active' && (
        <div className="space-y-3">
          {activeContracts.length === 0 ? (
            <EmptyState message="No active operations. Accept a mission to begin." />
          ) : (
            activeContracts.map((contract) => {
              const template = templateMap[contract.mission_template_id];
              if (!template) return null;

              const faction = factionColors[template.faction] ?? factionColors['atlantic_coalition'];
              const fName = factionDisplayName[template.faction] ?? template.faction;
              const risk = riskBadge(template.risk_level);
              const isLoading = actionLoading === contract.id;

              const expiresAt = new Date(contract.expires_at);
              const now = new Date();
              const msLeft = expiresAt.getTime() - now.getTime();
              const hoursLeft = Math.max(0, Math.floor(msLeft / 3600000));
              const minutesLeft = Math.max(0, Math.floor((msLeft % 3600000) / 60000));
              const timeStr = `${hoursLeft}h ${minutesLeft}m`;

              return (
                <div
                  key={contract.id}
                  className="bg-gray-900 rounded-2xl border border-gray-800/60 overflow-hidden"
                >
                  <div className="p-4">
                    {/* Status bar */}
                    <div className="flex items-center justify-between mb-3">
                      <div className="flex items-center gap-2">
                        <div className="w-2 h-2 rounded-full bg-emerald-400 animate-subtle-pulse" />
                        <span className="text-xs font-semibold text-emerald-400 uppercase tracking-wider">
                          {contract.status === 'active' ? 'Ready to Deploy' : contract.status}
                        </span>
                      </div>
                      <div className="flex items-center gap-1.5 bg-gray-800 rounded-lg px-2.5 py-1">
                        <Clock className="w-3 h-3 text-amber-400" />
                        <span className="text-xs font-bold text-amber-400">{timeStr}</span>
                      </div>
                    </div>

                    {/* Title + faction */}
                    <h3 className="text-base font-bold text-white">{template.title}</h3>
                    <div className="flex items-center gap-2 mt-1 mb-4">
                      <div className={`w-1.5 h-1.5 rounded-full ${faction.dot}`} />
                      <span className={`text-xs ${faction.text}`}>{fName}</span>
                      <span className="text-gray-700">·</span>
                      <span className={`text-xs ${risk.text}`}>{risk.label} Risk</span>
                      <span className="text-gray-700">·</span>
                      <span className="text-xs text-emerald-400">${template.base_payout.toLocaleString()}</span>
                    </div>

                    {/* Actions */}
                    <div className="flex gap-2">
                      <button
                        onClick={() => handleRunMission(contract.id)}
                        disabled={isLoading}
                        className="flex-1 flex items-center justify-center gap-2 bg-emerald-500 text-white font-semibold text-sm py-3 rounded-xl active:bg-emerald-600 disabled:opacity-60 transition-colors"
                      >
                        {isLoading ? (
                          <Loader2 className="w-4 h-4 animate-spin" />
                        ) : (
                          <>
                            <Target className="w-4 h-4" />
                            Run Mission
                          </>
                        )}
                      </button>
                      <button
                        onClick={() => handleWithdraw(contract.id)}
                        disabled={isLoading}
                        className="flex items-center justify-center gap-1.5 bg-red-500/15 text-red-400 font-medium text-sm py-3 px-4 rounded-xl active:bg-red-500/25 transition-colors"
                      >
                        <X className="w-4 h-4" />
                      </button>
                    </div>
                  </div>
                </div>
              );
            })
          )}
        </div>
      )}
    </div>
  );
};

function EmptyState({ message }: { message: string }) {
  return (
    <div className="flex flex-col items-center justify-center py-16 text-center">
      <div className="w-16 h-16 rounded-2xl bg-gray-800 flex items-center justify-center mb-4">
        <AlertTriangle className="w-8 h-8 text-gray-600" />
      </div>
      <p className="text-gray-400 font-medium">{message}</p>
    </div>
  );
}
