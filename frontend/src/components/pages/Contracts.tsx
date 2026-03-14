import { useState, useEffect, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  Clock,
  DollarSign,
  AlertTriangle,
  Zap,
  X,
  Check,
  Target,
  Loader2,
  Trophy,
  Skull,
  Sparkles,
  RefreshCw,
  Plane,
  Radio,
  Anchor,
  User,
  Swords,
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
  battle_type: string | null;
  enemy_aircraft_id: number | null;
  enemy_ship_id: number | null;
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

interface UnitReport {
  name: string;
  type: string;
  condition_before: number;
  condition_after: number;
  damage_taken: number;
}

interface ContractorReport {
  name: string;
  specialization: string;
  fatigue_before: number;
  fatigue_after: number;
  fatigue_gained: number;
}

interface SimulationResult {
  contract_id: number;
  mission_title: string;
  mission_description: string | null;
  faction: string;
  risk_level: number;
  success: boolean;
  payout: number;
  reputation_change: number;
  ally_strength: number;
  enemy_strength: number;
  success_probability: number;
  random_events: Array<{ type: string; description: string; impact: number }>;
  unit_report: UnitReport[];
  contractor_report: ContractorReport[];
  new_balance: number;
  new_reputation: number;
}

interface OwnedUnit {
  id: number;
  template_id: number;
  condition: number;
  name: string;
  type: string;
}

interface OwnedContractor {
  id: number;
  template_id: number;
  skill_level: number;
  fatigue_level: number;
  name: string;
  specialization: string;
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

const typeIcons: Record<string, typeof Plane> = {
  fighter: Plane,
  drone: Radio,
  submarine: Anchor,
};

const riskBadge = (risk: number) => {
  if (risk < 30) return { label: 'Low', bg: 'bg-emerald-500/15', text: 'text-emerald-400' };
  if (risk < 70) return { label: 'Med', bg: 'bg-amber-500/15', text: 'text-amber-400' };
  return { label: 'High', bg: 'bg-red-500/15', text: 'text-red-400' };
};

type Tab = 'available' | 'active';

export const Contracts = () => {
  const navigate = useNavigate();
  const [tab, setTab] = useState<Tab>('available');
  const [missionTemplates, setMissionTemplates] = useState<MissionTemplate[]>([]);
  const [activeContracts, setActiveContracts] = useState<ActiveContractData[]>([]);
  const [templateMap, setTemplateMap] = useState<Record<number, MissionTemplate>>({});
  const [loading, setLoading] = useState(true);
  const [actionLoading, setActionLoading] = useState<number | null>(null);
  const [simResult, setSimResult] = useState<SimulationResult | null>(null);
  const [refreshing, setRefreshing] = useState(false);

  // Deploy modal state
  const [deployTemplate, setDeployTemplate] = useState<MissionTemplate | null>(null);
  const [ownedUnits, setOwnedUnits] = useState<OwnedUnit[]>([]);
  const [ownedContractors, setOwnedContractors] = useState<OwnedContractor[]>([]);
  const [aircraftList, setAircraftList] = useState<Array<{id: number; aircraft_id: number; name: string; origin: string; condition: number}>>([]);
  const [shipList, setShipList] = useState<Array<{id: number; ship_id: number; name: string; origin: string; condition: number}>>([]);
  const [selectedUnitIds, setSelectedUnitIds] = useState<Set<number>>(new Set());
  const [selectedContractorIds, setSelectedContractorIds] = useState<Set<number>>(new Set());

  // Battle picker state
  const [battlePickerTemplate, setBattlePickerTemplate] = useState<MissionTemplate | null>(null);
  const [selectedVehicleId, setSelectedVehicleId] = useState<number | null>(null);

  const fetchData = useCallback(async () => {
    try {
      const [templatesRes, activeRes, unitsRes, unitTmplRes, contractorsRes, contractorTmplRes, aircraftRes, shipsRes] = await Promise.all([
        apiService.getMissionTemplates(),
        apiService.getActiveContracts(),
        apiService.getOwnedUnits(),
        apiService.getUnitTemplates(),
        apiService.getOwnedContractors(),
        apiService.getContractorTemplates(),
        apiService.getOwnedAircraft().catch(() => ({ data: [] })),
        apiService.getOwnedShips().catch(() => ({ data: [] })),
      ]);

      setAircraftList(Array.isArray(aircraftRes.data) ? aircraftRes.data : []);
      setShipList(Array.isArray(shipsRes.data) ? shipsRes.data : []);

      const templates: MissionTemplate[] = Array.isArray(templatesRes.data) ? templatesRes.data : [];
      const active: ActiveContractData[] = Array.isArray(activeRes.data) ? activeRes.data : [];

      setMissionTemplates(templates);
      setActiveContracts(active.filter((c) => c.status === 'active' || c.status === 'pending'));

      const map: Record<number, MissionTemplate> = {};
      templates.forEach((t) => { map[t.id] = t; });
      setTemplateMap(map);

      // Enrich units
      const rawUnits = Array.isArray(unitsRes.data) ? unitsRes.data : [];
      const unitTemplates = Array.isArray(unitTmplRes.data) ? unitTmplRes.data : [];
      setOwnedUnits(rawUnits.map((u: any) => {
        const tmpl = unitTemplates.find((t: any) => Number(t.id) === Number(u.template_id));
        return { id: u.id, template_id: u.template_id, condition: u.condition, name: tmpl?.name ?? 'Unknown', type: tmpl?.unit_type ?? 'unknown' };
      }));

      // Enrich contractors
      const rawContractors = Array.isArray(contractorsRes.data) ? contractorsRes.data : [];
      const contractorTemplates = Array.isArray(contractorTmplRes.data) ? contractorTmplRes.data : [];
      setOwnedContractors(rawContractors.map((c: any) => {
        const tmpl = contractorTemplates.find((t: any) => Number(t.id) === Number(c.template_id));
        return { id: c.id, template_id: c.template_id, skill_level: c.skill_level, fatigue_level: c.fatigue_level, name: tmpl?.name ?? 'Unknown', specialization: tmpl?.specialization ?? 'unknown' };
      }));
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

  const openDeployModal = async (template: MissionTemplate) => {
    // Battle-type missions show vehicle picker
    if (template.battle_type) {
      const list = template.battle_type === 'air' ? aircraftList : shipList;
      if (list.length === 0) {
        alert(`No ${template.battle_type === 'air' ? 'aircraft' : 'ships'} available. Purchase some from the Hangar first.`);
        return;
      }
      setBattlePickerTemplate(template);
      setSelectedVehicleId(template.battle_type === 'air' ? aircraftList[0]?.aircraft_id : shipList[0]?.ship_id);
      return;
    }

    // Legacy missions use the old deploy modal
    setDeployTemplate(template);
    setSelectedUnitIds(new Set());
    setSelectedContractorIds(new Set());
  };

  const handleBattleDeploy = async () => {
    if (!battlePickerTemplate || selectedVehicleId === null) return;
    setActionLoading(battlePickerTemplate.id);
    try {
      const expiresAt = new Date();
      expiresAt.setHours(expiresAt.getHours() + battlePickerTemplate.estimated_duration_hours);
      await apiService.createActiveContract({
        user_id: 1,
        mission_template_id: battlePickerTemplate.id,
        status: 'active',
        expires_at: expiresAt.toISOString(),
        assigned_units: null,
        assigned_contractors: null,
        payout_received: 0,
        reputation_change: 0,
        political_impact_change: 0,
      });

      const params = new URLSearchParams();
      if (battlePickerTemplate.battle_type === 'air') {
        params.set('aircraft', selectedVehicleId.toString());
      } else {
        params.set('ship', selectedVehicleId.toString());
      }
      if (ownedContractors.length > 0) {
        params.set('contractor', ownedContractors[0].id.toString());
      }
      setBattlePickerTemplate(null);
      navigate(`/battle/new?${params.toString()}`);
    } catch (err) {
      console.error('Failed to start battle mission:', err);
    } finally {
      setActionLoading(null);
    }
  };

  const toggleUnit = (id: number) => {
    setSelectedUnitIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id); else next.add(id);
      return next;
    });
  };

  const toggleContractor = (id: number) => {
    setSelectedContractorIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id); else next.add(id);
      return next;
    });
  };

  const handleAcceptWithDeployment = async () => {
    if (!deployTemplate) return;
    setActionLoading(deployTemplate.id);
    try {
      const expiresAt = new Date();
      expiresAt.setHours(expiresAt.getHours() + deployTemplate.estimated_duration_hours);

      await apiService.createActiveContract({
        user_id: 1,
        mission_template_id: deployTemplate.id,
        status: 'active',
        expires_at: expiresAt.toISOString(),
        assigned_units: JSON.stringify(Array.from(selectedUnitIds)),
        assigned_contractors: JSON.stringify(Array.from(selectedContractorIds)),
        payout_received: 0,
        reputation_change: 0,
        political_impact_change: 0,
      });

      setDeployTemplate(null);
      await fetchData();
      setTab('active');
    } catch (err: any) {
      console.error('Failed to accept contract:', err);
    } finally {
      setActionLoading(null);
    }
  };

  const handleRunMission = async (contractId: number) => {
    // Check if this is a battle-type mission
    const contract = activeContracts.find((c) => c.id === contractId);
    if (contract) {
      const template = templateMap[contract.mission_template_id];
      if (template?.battle_type) {
        // Navigate to battle screen
        const params = new URLSearchParams({ contract: contractId.toString() });
        if (template.battle_type === 'air' && aircraftList.length > 0) {
          params.set('aircraft', aircraftList[0].id.toString());
        } else if (template.battle_type === 'naval' && shipList.length > 0) {
          params.set('ship', shipList[0].id.toString());
        }
        if (ownedContractors.length > 0) {
          params.set('contractor', ownedContractors[0].id.toString());
        }
        navigate(`/battle/new?${params.toString()}`);
        return;
      }
    }

    // Legacy simulation for non-battle missions
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
    try { return JSON.parse(jsonStr); }
    catch { return [jsonStr]; }
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
      {/* Battle Vehicle Picker Modal */}
      {battlePickerTemplate && (
        <div className="fixed inset-0 bg-black/70 backdrop-blur-sm z-[60] flex items-end sm:items-center justify-center" onClick={() => setBattlePickerTemplate(null)}>
          <div
            className="bg-gray-900 rounded-t-2xl sm:rounded-2xl border-t sm:border border-gray-800 w-full sm:max-w-md max-h-[80vh] overflow-hidden flex flex-col"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-center justify-between p-4 border-b border-gray-800">
              <div>
                <h2 className="text-lg font-bold text-white">
                  Select {battlePickerTemplate.battle_type === 'air' ? 'Aircraft' : 'Ship'}
                </h2>
                <p className="text-xs text-gray-500">{battlePickerTemplate.title}</p>
              </div>
              <button onClick={() => setBattlePickerTemplate(null)} className="w-8 h-8 rounded-lg bg-gray-800 flex items-center justify-center text-gray-400">
                <X className="w-4 h-4" />
              </button>
            </div>
            <div className="overflow-y-auto p-4 space-y-2">
              {(battlePickerTemplate.battle_type === 'air' ? aircraftList : shipList).map((v) => {
                const vehicleId = 'aircraft_id' in v ? v.aircraft_id : (v as any).ship_id;
                const isSelected = selectedVehicleId === vehicleId;
                return (
                  <button
                    key={v.id}
                    onClick={() => setSelectedVehicleId(vehicleId)}
                    className={`w-full text-left rounded-xl p-3 border transition-all ${
                      isSelected
                        ? 'bg-emerald-500/10 border-emerald-500/40'
                        : 'bg-gray-800/50 border-gray-700/40 active:bg-gray-800'
                    }`}
                  >
                    <div className="flex items-center gap-3">
                      <div className={`w-10 h-10 rounded-lg flex items-center justify-center ${
                        isSelected ? 'bg-emerald-500/20' : 'bg-gray-800'
                      }`}>
                        {battlePickerTemplate.battle_type === 'air'
                          ? <Plane className={`w-5 h-5 ${isSelected ? 'text-emerald-400' : 'text-gray-500'}`} />
                          : <Anchor className={`w-5 h-5 ${isSelected ? 'text-emerald-400' : 'text-gray-500'}`} />
                        }
                      </div>
                      <div className="flex-1 min-w-0">
                        <p className="text-sm font-semibold text-white truncate">{v.name}</p>
                        <div className="flex items-center gap-2 mt-0.5">
                          <span className="text-[10px] text-gray-500">{v.origin}</span>
                          <span className="text-gray-700">·</span>
                          <span className={`text-[10px] font-semibold ${
                            v.condition >= 70 ? 'text-emerald-400' : v.condition >= 40 ? 'text-amber-400' : 'text-red-400'
                          }`}>{v.condition}% condition</span>
                        </div>
                      </div>
                      {isSelected && (
                        <div className="w-5 h-5 rounded-full bg-emerald-500 flex items-center justify-center shrink-0">
                          <Check className="w-3 h-3 text-white" />
                        </div>
                      )}
                    </div>
                  </button>
                );
              })}
            </div>
            <div className="p-4 border-t border-gray-800">
              <button
                onClick={handleBattleDeploy}
                disabled={selectedVehicleId === null || actionLoading === battlePickerTemplate.id}
                className="w-full flex items-center justify-center gap-2 bg-emerald-500 text-white font-bold text-sm py-3 rounded-xl active:bg-emerald-600 disabled:opacity-40 transition-colors"
              >
                {actionLoading === battlePickerTemplate.id ? (
                  <Loader2 className="w-4 h-4 animate-spin" />
                ) : (
                  <Swords className="w-4 h-4" />
                )}
                Deploy & Enter Battle
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Deploy Modal */}
      {deployTemplate && (
        <div className="fixed inset-0 bg-black/70 backdrop-blur-sm z-[60] flex items-end sm:items-center justify-center" onClick={() => setDeployTemplate(null)}>
          <div
            className="bg-gray-900 rounded-t-2xl sm:rounded-2xl border-t sm:border border-gray-800 w-full sm:max-w-md max-h-[80vh] mb-[env(safe-area-inset-bottom)] overflow-hidden flex flex-col"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-center justify-between p-4 border-b border-gray-800">
              <div>
                <h2 className="text-lg font-bold text-white">Deploy Forces</h2>
                <p className="text-xs text-gray-500">{deployTemplate.title}</p>
              </div>
              <button onClick={() => setDeployTemplate(null)} className="w-8 h-8 rounded-lg bg-gray-800 flex items-center justify-center text-gray-400">
                <X className="w-4 h-4" />
              </button>
            </div>

            <div className="overflow-y-auto flex-1">
              {/* Select Units */}
              <div className="p-4 border-b border-gray-800/60">
                <p className="text-xs text-gray-500 uppercase tracking-wider font-semibold mb-3">
                  Select Units ({selectedUnitIds.size} selected)
                </p>
                {ownedUnits.length === 0 ? (
                  <p className="text-xs text-gray-600 py-2">No units available. Visit the Hangar to acquire units.</p>
                ) : (
                  <div className="space-y-2">
                    {ownedUnits.map((unit) => {
                      const Icon = typeIcons[unit.type] ?? Plane;
                      const selected = selectedUnitIds.has(unit.id);
                      return (
                        <button
                          key={unit.id}
                          onClick={() => toggleUnit(unit.id)}
                          className={`w-full flex items-center gap-3 p-3 rounded-xl text-left transition-all ${
                            selected ? 'bg-emerald-500/15 border border-emerald-500/30' : 'bg-gray-800/50 border border-transparent'
                          }`}
                        >
                          <div className={`w-8 h-8 rounded-lg flex items-center justify-center ${
                            selected ? 'bg-emerald-500/20' : 'bg-gray-700'
                          }`}>
                            <Icon className={`w-4 h-4 ${selected ? 'text-emerald-400' : 'text-gray-400'}`} />
                          </div>
                          <div className="flex-1 min-w-0">
                            <p className="text-sm text-white font-medium truncate">{unit.name}</p>
                            <p className="text-xs text-gray-500 capitalize">{unit.type} · {unit.condition}% condition</p>
                          </div>
                          <div className={`w-5 h-5 rounded-full border-2 flex items-center justify-center shrink-0 ${
                            selected ? 'border-emerald-400 bg-emerald-400' : 'border-gray-600'
                          }`}>
                            {selected && <Check className="w-3 h-3 text-gray-900" />}
                          </div>
                        </button>
                      );
                    })}
                  </div>
                )}
              </div>

              {/* Select Contractors */}
              <div className="p-4">
                <p className="text-xs text-gray-500 uppercase tracking-wider font-semibold mb-3">
                  Assign Personnel ({selectedContractorIds.size} selected)
                </p>
                {ownedContractors.length === 0 ? (
                  <p className="text-xs text-gray-600 py-2">No personnel available. Visit Personnel to hire contractors.</p>
                ) : (
                  <div className="space-y-2">
                    {ownedContractors.map((c) => {
                      const selected = selectedContractorIds.has(c.id);
                      return (
                        <button
                          key={c.id}
                          onClick={() => toggleContractor(c.id)}
                          className={`w-full flex items-center gap-3 p-3 rounded-xl text-left transition-all ${
                            selected ? 'bg-emerald-500/15 border border-emerald-500/30' : 'bg-gray-800/50 border border-transparent'
                          }`}
                        >
                          <div className={`w-8 h-8 rounded-lg flex items-center justify-center ${
                            selected ? 'bg-emerald-500/20' : 'bg-gray-700'
                          }`}>
                            <User className={`w-4 h-4 ${selected ? 'text-emerald-400' : 'text-gray-400'}`} />
                          </div>
                          <div className="flex-1 min-w-0">
                            <p className="text-sm text-white font-medium truncate">{c.name}</p>
                            <p className="text-xs text-gray-500 capitalize">{c.specialization} · Skill {c.skill_level} · Fatigue {c.fatigue_level}%</p>
                          </div>
                          <div className={`w-5 h-5 rounded-full border-2 flex items-center justify-center shrink-0 ${
                            selected ? 'border-emerald-400 bg-emerald-400' : 'border-gray-600'
                          }`}>
                            {selected && <Check className="w-3 h-3 text-gray-900" />}
                          </div>
                        </button>
                      );
                    })}
                  </div>
                )}
              </div>
            </div>

            {/* Deploy button */}
            <div className="p-4 pb-6 sm:pb-4 border-t border-gray-800">
              <button
                onClick={handleAcceptWithDeployment}
                disabled={actionLoading === deployTemplate.id || (selectedUnitIds.size === 0 && selectedContractorIds.size === 0)}
                className="w-full flex items-center justify-center gap-2 bg-emerald-500 text-white font-semibold text-sm py-3 rounded-xl active:bg-emerald-600 disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
              >
                {actionLoading === deployTemplate.id ? (
                  <Loader2 className="w-4 h-4 animate-spin" />
                ) : (
                  <>
                    <Target className="w-4 h-4" />
                    Deploy & Accept Mission
                  </>
                )}
              </button>
              {selectedUnitIds.size === 0 && selectedContractorIds.size === 0 && (
                <p className="text-xs text-gray-600 text-center mt-2">Select at least one unit or contractor</p>
              )}
            </div>
          </div>
        </div>
      )}

      {/* After-Action Report Modal */}
      {simResult && (
        <div className="fixed inset-0 bg-black/80 backdrop-blur-sm z-[60] flex items-end sm:items-center justify-center" onClick={() => setSimResult(null)}>
          <div
            className="bg-gray-900 rounded-t-2xl sm:rounded-2xl border-t sm:border border-gray-800 w-full sm:max-w-md max-h-[90vh] overflow-hidden flex flex-col"
            onClick={(e) => e.stopPropagation()}
          >
            {/* Header banner */}
            <div className={`p-5 text-center relative overflow-hidden ${simResult.success ? 'bg-emerald-500/10' : 'bg-red-500/10'}`}>
              <div className={`w-14 h-14 rounded-full mx-auto flex items-center justify-center mb-2.5 ${
                simResult.success ? 'bg-emerald-500/20' : 'bg-red-500/20'
              }`}>
                {simResult.success
                  ? <Trophy className="w-7 h-7 text-emerald-400" />
                  : <Skull className="w-7 h-7 text-red-400" />
                }
              </div>
              <h2 className="text-lg font-bold text-white">
                {simResult.success ? 'Mission Success' : 'Mission Failed'}
              </h2>
              <p className="text-sm text-gray-400 mt-0.5">{simResult.mission_title}</p>
              <div className="flex items-center justify-center gap-2 mt-2">
                <span className={`text-[10px] font-bold uppercase tracking-wider px-2 py-0.5 rounded-md ${
                  riskBadge(simResult.risk_level).bg
                } ${riskBadge(simResult.risk_level).text}`}>
                  {riskBadge(simResult.risk_level).label} Risk
                </span>
                <span className="text-[10px] text-gray-500">
                  {simResult.success_probability}% success chance
                </span>
              </div>
            </div>

            {/* Scrollable content */}
            <div className="overflow-y-auto flex-1 p-4 space-y-4">

              {/* Rewards */}
              <div>
                <p className="text-[10px] text-gray-500 uppercase tracking-wider font-semibold mb-2">Rewards</p>
                <div className="grid grid-cols-2 gap-2">
                  <div className="bg-gray-800/50 rounded-xl p-3 text-center">
                    <DollarSign className="w-4 h-4 text-emerald-400 mx-auto mb-1" />
                    <p className="text-lg font-bold text-emerald-400">${simResult.payout.toLocaleString()}</p>
                    <p className="text-[10px] text-gray-500">Payout earned</p>
                  </div>
                  <div className="bg-gray-800/50 rounded-xl p-3 text-center">
                    <Zap className="w-4 h-4 text-blue-400 mx-auto mb-1" />
                    <p className={`text-lg font-bold ${simResult.reputation_change >= 0 ? 'text-blue-400' : 'text-red-400'}`}>
                      {simResult.reputation_change >= 0 ? '+' : ''}{simResult.reputation_change}
                    </p>
                    <p className="text-[10px] text-gray-500">Reputation</p>
                  </div>
                </div>
              </div>

              {/* Battle strength comparison */}
              <div>
                <p className="text-[10px] text-gray-500 uppercase tracking-wider font-semibold mb-2">Battle Overview</p>
                <div className="bg-gray-800/50 rounded-xl p-3">
                  <div className="flex items-center justify-between mb-2">
                    <span className="text-xs text-emerald-400 font-semibold">Allied Forces</span>
                    <span className="text-xs text-red-400 font-semibold">Enemy Forces</span>
                  </div>
                  <div className="flex items-center gap-2">
                    <span className="text-sm font-bold text-white w-12 text-left">{simResult.ally_strength}</span>
                    <div className="flex-1 h-3 bg-gray-700 rounded-full overflow-hidden flex">
                      {(() => {
                        const total = simResult.ally_strength + simResult.enemy_strength;
                        const allyPct = total > 0 ? (simResult.ally_strength / total) * 100 : 50;
                        return (
                          <>
                            <div className="h-full bg-emerald-500 rounded-l-full" style={{ width: `${allyPct}%` }} />
                            <div className="h-full bg-red-500 rounded-r-full" style={{ width: `${100 - allyPct}%` }} />
                          </>
                        );
                      })()}
                    </div>
                    <span className="text-sm font-bold text-white w-12 text-right">{simResult.enemy_strength}</span>
                  </div>
                </div>
              </div>

              {/* Random events */}
              {simResult.random_events.length > 0 && (
                <div>
                  <p className="text-[10px] text-gray-500 uppercase tracking-wider font-semibold mb-2">Battlefield Events</p>
                  <div className="space-y-1.5">
                    {simResult.random_events.map((event, i) => (
                      <div key={i} className={`flex items-start gap-2.5 rounded-xl px-3 py-2.5 ${
                        event.impact > 0 ? 'bg-emerald-500/10' : 'bg-red-500/10'
                      }`}>
                        <Sparkles className={`w-4 h-4 mt-0.5 shrink-0 ${event.impact > 0 ? 'text-emerald-400' : 'text-red-400'}`} />
                        <div>
                          <p className="text-xs text-white font-medium">
                            {event.type.replace(/_/g, ' ').replace(/\b\w/g, (c: string) => c.toUpperCase())}
                          </p>
                          <p className="text-xs text-gray-400 mt-0.5">{event.description}</p>
                          <span className={`text-[10px] font-bold ${event.impact > 0 ? 'text-emerald-400' : 'text-red-400'}`}>
                            {event.impact > 0 ? '+' : ''}{(event.impact * 100).toFixed(0)}% success modifier
                          </span>
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {/* Unit damage report */}
              {simResult.unit_report.length > 0 && (
                <div>
                  <p className="text-[10px] text-gray-500 uppercase tracking-wider font-semibold mb-2">Unit Damage Report</p>
                  <div className="space-y-2">
                    {simResult.unit_report.map((unit, i) => {
                      const Icon = typeIcons[unit.type] ?? Plane;
                      const critical = unit.condition_after < 30;
                      return (
                        <div key={i} className="bg-gray-800/50 rounded-xl p-3">
                          <div className="flex items-center gap-2.5 mb-2">
                            <Icon className={`w-4 h-4 ${critical ? 'text-red-400' : 'text-gray-400'}`} />
                            <span className="text-xs font-semibold text-white flex-1">{unit.name}</span>
                            {unit.damage_taken > 0 && (
                              <span className="text-[10px] font-bold text-red-400">-{unit.damage_taken}% dmg</span>
                            )}
                          </div>
                          <div className="flex items-center gap-2">
                            <div className="flex-1 h-2 bg-gray-700 rounded-full overflow-hidden">
                              {/* Show before (faded) and after (solid) */}
                              <div className="h-full relative">
                                <div
                                  className="absolute inset-y-0 left-0 bg-gray-600 rounded-full"
                                  style={{ width: `${unit.condition_before}%` }}
                                />
                                <div
                                  className={`absolute inset-y-0 left-0 rounded-full ${
                                    unit.condition_after >= 70 ? 'bg-emerald-500' :
                                    unit.condition_after >= 40 ? 'bg-amber-500' : 'bg-red-500'
                                  }`}
                                  style={{ width: `${unit.condition_after}%` }}
                                />
                              </div>
                            </div>
                            <span className="text-xs text-gray-400 w-16 text-right shrink-0">
                              {unit.condition_before}% → {unit.condition_after}%
                            </span>
                          </div>
                        </div>
                      );
                    })}
                  </div>
                </div>
              )}

              {/* Contractor fatigue report */}
              {simResult.contractor_report.length > 0 && (
                <div>
                  <p className="text-[10px] text-gray-500 uppercase tracking-wider font-semibold mb-2">Crew Fatigue Report</p>
                  <div className="space-y-2">
                    {simResult.contractor_report.map((c, i) => {
                      const exhausted = c.fatigue_after > 75;
                      return (
                        <div key={i} className="bg-gray-800/50 rounded-xl p-3">
                          <div className="flex items-center gap-2.5 mb-2">
                            <User className={`w-4 h-4 ${exhausted ? 'text-red-400' : 'text-gray-400'}`} />
                            <div className="flex-1 min-w-0">
                              <span className="text-xs font-semibold text-white">{c.name}</span>
                              <span className="text-[10px] text-gray-500 ml-1.5 capitalize">{c.specialization}</span>
                            </div>
                            {c.fatigue_gained > 0 && (
                              <span className="text-[10px] font-bold text-amber-400">+{c.fatigue_gained}% fatigue</span>
                            )}
                          </div>
                          <div className="flex items-center gap-2">
                            <div className="flex-1 h-2 bg-gray-700 rounded-full overflow-hidden">
                              <div className="h-full relative">
                                <div
                                  className={`absolute inset-y-0 left-0 rounded-full ${
                                    c.fatigue_after <= 30 ? 'bg-emerald-500' :
                                    c.fatigue_after <= 60 ? 'bg-amber-500' : 'bg-red-500'
                                  }`}
                                  style={{ width: `${c.fatigue_after}%` }}
                                />
                              </div>
                            </div>
                            <span className="text-xs text-gray-400 w-16 text-right shrink-0">
                              {c.fatigue_before}% → {c.fatigue_after}%
                            </span>
                          </div>
                        </div>
                      );
                    })}
                  </div>
                </div>
              )}

              {/* Updated stats */}
              <div>
                <p className="text-[10px] text-gray-500 uppercase tracking-wider font-semibold mb-2">Updated Stats</p>
                <div className="grid grid-cols-2 gap-2">
                  <div className="bg-gray-800/50 rounded-xl p-3 text-center">
                    <p className="text-[10px] text-gray-500">Balance</p>
                    <p className="text-sm font-bold text-white">${simResult.new_balance.toLocaleString()}</p>
                  </div>
                  <div className="bg-gray-800/50 rounded-xl p-3 text-center">
                    <p className="text-[10px] text-gray-500">Reputation</p>
                    <p className="text-sm font-bold text-white">{simResult.new_reputation}%</p>
                  </div>
                </div>
              </div>
            </div>

            {/* Dismiss button */}
            <div className="p-4 pb-6 sm:pb-4 border-t border-gray-800">
              <button
                onClick={() => setSimResult(null)}
                className="w-full bg-gray-800 text-white font-semibold text-sm py-3 rounded-xl active:bg-gray-700 transition-colors"
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
              const alreadyAccepted = activeContracts.some((c) => c.mission_template_id === template.id);

              return (
                <div
                  key={template.id}
                  className="bg-gray-900 rounded-2xl border border-gray-800/60 overflow-hidden card-press"
                >
                  <div className="p-4">
                    <div className="flex items-center justify-between mb-2.5">
                      <div className="flex items-center gap-2">
                        <div className={`w-2 h-2 rounded-full ${faction.dot}`} />
                        <span className={`text-xs font-medium ${faction.text}`}>{fName}</span>
                      </div>
                      <div className="flex items-center gap-1.5">
                        {template.battle_type && (
                          <span className="text-[10px] font-bold uppercase tracking-wider px-2 py-0.5 rounded-md bg-violet-500/15 text-violet-400">
                            {template.battle_type === 'air' ? '✈ Tactical' : '🚢 Naval'}
                          </span>
                        )}
                        <span className={`text-[10px] font-bold uppercase tracking-wider px-2 py-0.5 rounded-md ${risk.bg} ${risk.text}`}>
                          {risk.label} Risk
                        </span>
                      </div>
                    </div>

                    <h3 className="text-base font-bold text-white mb-1">{template.title}</h3>
                    {template.description && (
                      <p className="text-xs text-gray-500 mb-3">{template.description}</p>
                    )}

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

                    <div className="flex items-center gap-1.5 mb-4 flex-wrap">
                      <Target className="w-3 h-3 text-gray-600 shrink-0" />
                      <span className="text-[10px] text-gray-500 uppercase tracking-wider mr-1">Requires</span>
                      {requiredUnits.map((unit) => (
                        <span key={unit} className="text-xs bg-gray-800 text-gray-300 px-2 py-0.5 rounded-md font-medium">
                          {unit}
                        </span>
                      ))}
                    </div>

                    <button
                      onClick={() => alreadyAccepted ? null : openDeployModal(template)}
                      disabled={alreadyAccepted || actionLoading === template.id}
                      className={`
                        w-full flex items-center justify-center gap-2 font-semibold text-sm py-3 rounded-xl transition-colors
                        ${alreadyAccepted
                          ? 'bg-gray-800 text-gray-500 cursor-not-allowed'
                          : 'bg-emerald-500 text-white active:bg-emerald-600'
                        }
                      `}
                    >
                      {actionLoading === template.id ? (
                        <Loader2 className="w-4 h-4 animate-spin" />
                      ) : alreadyAccepted ? (
                        <>
                          <Check className="w-4 h-4" />
                          Already Accepted
                        </>
                      ) : template.battle_type ? (
                        <>
                          <Swords className="w-4 h-4" />
                          Enter Battle
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

              // Parse assigned resources
              const assignedUnitIds: number[] = contract.assigned_units ? JSON.parse(contract.assigned_units) : [];
              const assignedContractorIds: number[] = contract.assigned_contractors ? JSON.parse(contract.assigned_contractors) : [];
              const assignedUnitNames = assignedUnitIds.map((id) => ownedUnits.find((u) => u.id === id)?.name ?? `Unit #${id}`);
              const assignedContractorNames = assignedContractorIds.map((id) => ownedContractors.find((c) => c.id === id)?.name ?? `Contractor #${id}`);

              return (
                <div
                  key={contract.id}
                  className="bg-gray-900 rounded-2xl border border-gray-800/60 overflow-hidden"
                >
                  <div className="p-4">
                    <div className="flex items-center justify-between mb-3">
                      <div className="flex items-center gap-2">
                        <div className="w-2 h-2 rounded-full bg-emerald-400 animate-subtle-pulse" />
                        <span className="text-xs font-semibold text-emerald-400 uppercase tracking-wider">Ready to Deploy</span>
                      </div>
                      <div className="flex items-center gap-1.5 bg-gray-800 rounded-lg px-2.5 py-1">
                        <Clock className="w-3 h-3 text-amber-400" />
                        <span className="text-xs font-bold text-amber-400">{timeStr}</span>
                      </div>
                    </div>

                    <h3 className="text-base font-bold text-white">{template.title}</h3>
                    <div className="flex items-center gap-2 mt-1 mb-3">
                      <div className={`w-1.5 h-1.5 rounded-full ${faction.dot}`} />
                      <span className={`text-xs ${faction.text}`}>{fName}</span>
                      <span className="text-gray-700">·</span>
                      <span className={`text-xs ${risk.text}`}>{risk.label} Risk</span>
                      <span className="text-gray-700">·</span>
                      <span className="text-xs text-emerald-400">${template.base_payout.toLocaleString()}</span>
                    </div>

                    {/* Assigned resources */}
                    {(assignedUnitNames.length > 0 || assignedContractorNames.length > 0) && (
                      <div className="space-y-2 mb-4">
                        {assignedUnitNames.length > 0 && (
                          <div>
                            <p className="text-[10px] text-gray-500 uppercase tracking-wider mb-1">Deployed Units</p>
                            <div className="flex flex-wrap gap-1.5">
                              {assignedUnitNames.map((name, i) => (
                                <span key={i} className="text-xs bg-blue-500/15 text-blue-300 px-2.5 py-1 rounded-lg font-medium">{name}</span>
                              ))}
                            </div>
                          </div>
                        )}
                        {assignedContractorNames.length > 0 && (
                          <div>
                            <p className="text-[10px] text-gray-500 uppercase tracking-wider mb-1">Personnel</p>
                            <div className="flex flex-wrap gap-1.5">
                              {assignedContractorNames.map((name, i) => (
                                <span key={i} className="text-xs bg-violet-500/15 text-violet-300 px-2.5 py-1 rounded-lg font-medium">{name}</span>
                              ))}
                            </div>
                          </div>
                        )}
                      </div>
                    )}

                    <div className="flex gap-2">
                      <button
                        onClick={() => handleRunMission(contract.id)}
                        disabled={isLoading}
                        className="flex-1 flex items-center justify-center gap-2 bg-emerald-500 text-white font-semibold text-sm py-3 rounded-xl active:bg-emerald-600 disabled:opacity-60 transition-colors"
                      >
                        {isLoading ? (
                          <Loader2 className="w-4 h-4 animate-spin" />
                        ) : template?.battle_type ? (
                          <>
                            <Swords className="w-4 h-4" />
                            Enter Battle
                          </>
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
