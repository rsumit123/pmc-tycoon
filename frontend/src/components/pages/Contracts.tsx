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
import '../../styles/design-system.css';

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
  terrain_type: string | null;
  enemy_ground_composition: string | null;
  difficulty: number;
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
  atlantic_coalition: { bg: 'bg-[var(--color-blue)]/10', text: 'text-[var(--color-blue)]', dot: 'bg-[var(--color-blue)]' },
  desert_bloc: { bg: 'bg-[var(--color-amber)]/10', text: 'text-[var(--color-amber)]', dot: 'bg-[var(--color-amber)]' },
  pacific_alliance: { bg: 'bg-[var(--color-blue)]/10', text: 'text-[var(--color-blue)]', dot: 'bg-[var(--color-blue)]' },
  sahara_sindicate: { bg: 'bg-[var(--color-amber)]/10', text: 'text-[var(--color-amber)]', dot: 'bg-[var(--color-amber)]' },
};

const typeIcons: Record<string, typeof Plane> = {
  fighter: Plane,
  drone: Radio,
  submarine: Anchor,
};

const riskBadge = (risk: number) => {
  if (risk < 30) return { label: 'Low', stamp: 'stamp stamp-confidential', text: 'text-[var(--color-amber)]' };
  if (risk < 70) return { label: 'Med', stamp: 'stamp stamp-secret', text: 'text-[var(--color-red)]' };
  return { label: 'High', stamp: 'stamp stamp-top-secret', text: 'text-[#E53E3E]' };
};

const riskStampClass = (risk: number) => {
  if (risk < 30) return 'stamp-confidential';
  if (risk < 70) return 'stamp-secret';
  return 'stamp-top-secret';
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
  const [chapters, setChapters] = useState<any[]>([]);
  const [userRank, setUserRank] = useState<any>(null);

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

      const chaptersRes = await apiService.getChapters().catch(() => ({ data: [] }));
      setChapters(Array.isArray(chaptersRes.data) ? chaptersRes.data : []);
      const rankRes = await apiService.getUserRank(1).catch(() => ({ data: null }));
      setUserRank(rankRes.data);

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
    // Ground battle — go straight to force selection screen
    if (template.battle_type === 'ground') {
      navigate(`/battle/new?ground=1&template=${template.id}`);
      return;
    }

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
      if (template?.battle_type === 'ground') {
        navigate(`/battle/new?ground=1&template=${template.id}`);
        return;
      }
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
          <div className="w-8 h-8 border-2 rounded-full animate-spin" style={{ borderColor: 'var(--color-amber)', borderTopColor: 'transparent' }} />
          <p className="text-sm" style={{ color: 'var(--color-text-muted)' }}>Loading operations...</p>
        </div>
      </div>
    );
  }

  return (
    <div className="px-4 py-5 lg:px-8 lg:py-6 max-w-4xl mx-auto">
      {/* Battle Vehicle Picker Bottom Sheet */}
      {battlePickerTemplate && (
        <div className="bottom-sheet-backdrop" onClick={() => setBattlePickerTemplate(null)}>
          <div
            className="bottom-sheet flex flex-col"
            style={{ maxHeight: '80vh' }}
            onClick={(e) => e.stopPropagation()}
          >
            <div className="bottom-sheet-handle" />
            <div className="flex items-center justify-between p-4" style={{ borderBottom: '1px solid var(--color-border)' }}>
              <div>
                <h2 className="font-display text-lg" style={{ color: 'var(--color-text)' }}>
                  Select {battlePickerTemplate.battle_type === 'air' ? 'Aircraft' : 'Ship'}
                </h2>
                <p className="text-xs" style={{ color: 'var(--color-text-muted)' }}>{battlePickerTemplate.title}</p>
              </div>
              <button onClick={() => setBattlePickerTemplate(null)} className="btn-secondary w-8 h-8 flex items-center justify-center !p-0 !min-h-0" style={{ borderRadius: '8px' }}>
                <X className="w-4 h-4" />
              </button>
            </div>
            <div className="overflow-y-auto p-4 space-y-2 scroll-list">
              {(battlePickerTemplate.battle_type === 'air' ? aircraftList : shipList).map((v) => {
                const vehicleId = 'aircraft_id' in v ? v.aircraft_id : (v as any).ship_id;
                const isSelected = selectedVehicleId === vehicleId;
                return (
                  <button
                    key={v.id}
                    onClick={() => setSelectedVehicleId(vehicleId)}
                    className={`w-full text-left rounded-xl p-3 border transition-all ${
                      isSelected
                        ? 'border-[var(--color-amber)]'
                        : 'border-[var(--color-border)]'
                    }`}
                    style={{ background: isSelected ? 'rgba(212,168,67,0.1)' : 'var(--color-surface)' }}
                  >
                    <div className="flex items-center gap-3">
                      <div className="w-10 h-10 rounded-lg flex items-center justify-center"
                        style={{ background: isSelected ? 'rgba(212,168,67,0.2)' : 'var(--color-surface-raised)' }}>
                        {battlePickerTemplate.battle_type === 'air'
                          ? <Plane className="w-5 h-5" style={{ color: isSelected ? 'var(--color-amber)' : 'var(--color-text-muted)' }} />
                          : <Anchor className="w-5 h-5" style={{ color: isSelected ? 'var(--color-amber)' : 'var(--color-text-muted)' }} />
                        }
                      </div>
                      <div className="flex-1 min-w-0">
                        <p className="text-sm font-semibold truncate" style={{ color: 'var(--color-text)' }}>{v.name}</p>
                        <div className="flex items-center gap-2 mt-0.5">
                          <span className="text-[10px]" style={{ color: 'var(--color-text-muted)' }}>{v.origin}</span>
                          <span style={{ color: 'var(--color-border)' }}>·</span>
                          <span className="font-data text-[10px] font-semibold" style={{
                            color: v.condition >= 70 ? 'var(--color-green)' : v.condition >= 40 ? 'var(--color-amber)' : 'var(--color-red)'
                          }}>{v.condition}% condition</span>
                        </div>
                      </div>
                      {isSelected && (
                        <div className="w-5 h-5 rounded-full flex items-center justify-center shrink-0" style={{ background: 'var(--color-amber)' }}>
                          <Check className="w-3 h-3" style={{ color: 'var(--color-text-inverse)' }} />
                        </div>
                      )}
                    </div>
                  </button>
                );
              })}
            </div>
            <div className="p-4 pb-8" style={{ borderTop: '1px solid var(--color-border)', paddingBottom: 'max(2rem, calc(env(safe-area-inset-bottom, 0px) + 1.5rem))' }}>
              <button
                onClick={handleBattleDeploy}
                disabled={selectedVehicleId === null || actionLoading === battlePickerTemplate.id}
                className="btn-primary w-full flex items-center justify-center gap-2 text-sm py-4"
              >
                {actionLoading === battlePickerTemplate.id ? (
                  <Loader2 className="w-4 h-4 animate-spin" />
                ) : (
                  <Swords className="w-4 h-4" />
                )}
                DEPLOY & ENTER BATTLE
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Deploy Bottom Sheet */}
      {deployTemplate && (
        <div className="bottom-sheet-backdrop" onClick={() => setDeployTemplate(null)}>
          <div
            className="bottom-sheet flex flex-col"
            style={{ maxHeight: '80vh' }}
            onClick={(e) => e.stopPropagation()}
          >
            <div className="bottom-sheet-handle" />
            <div className="flex items-center justify-between p-4" style={{ borderBottom: '1px solid var(--color-border)' }}>
              <div>
                <h2 className="font-display text-lg" style={{ color: 'var(--color-text)' }}>Deploy Forces</h2>
                <p className="text-xs" style={{ color: 'var(--color-text-muted)' }}>{deployTemplate.title}</p>
              </div>
              <button onClick={() => setDeployTemplate(null)} className="btn-secondary w-8 h-8 flex items-center justify-center !p-0 !min-h-0" style={{ borderRadius: '8px' }}>
                <X className="w-4 h-4" />
              </button>
            </div>

            <div className="overflow-y-auto flex-1 scroll-list">
              {/* Select Units */}
              <div className="p-4" style={{ borderBottom: '1px solid var(--color-border-subtle)' }}>
                <p className="label-section mb-3">
                  Select Units ({selectedUnitIds.size} selected)
                </p>
                {ownedUnits.length === 0 ? (
                  <p className="text-xs py-2" style={{ color: 'var(--color-text-muted)' }}>No units available. Visit the Hangar to acquire units.</p>
                ) : (
                  <div className="space-y-2">
                    {ownedUnits.map((unit) => {
                      const Icon = typeIcons[unit.type] ?? Plane;
                      const selected = selectedUnitIds.has(unit.id);
                      return (
                        <button
                          key={unit.id}
                          onClick={() => toggleUnit(unit.id)}
                          className={`w-full flex items-center gap-3 p-3 rounded-xl text-left transition-all border ${
                            selected ? 'border-[var(--color-amber)]' : 'border-transparent'
                          }`}
                          style={{ background: selected ? 'rgba(212,168,67,0.1)' : 'var(--color-surface)' }}
                        >
                          <div className="w-8 h-8 rounded-lg flex items-center justify-center"
                            style={{ background: selected ? 'rgba(212,168,67,0.2)' : 'var(--color-surface-raised)' }}>
                            <Icon className="w-4 h-4" style={{ color: selected ? 'var(--color-amber)' : 'var(--color-text-secondary)' }} />
                          </div>
                          <div className="flex-1 min-w-0">
                            <p className="text-sm font-medium truncate" style={{ color: 'var(--color-text)' }}>{unit.name}</p>
                            <p className="text-xs capitalize" style={{ color: 'var(--color-text-muted)' }}>{unit.type} · <span className="font-data">{unit.condition}%</span> condition</p>
                          </div>
                          <div className={`w-5 h-5 rounded-full border-2 flex items-center justify-center shrink-0`}
                            style={{
                              borderColor: selected ? 'var(--color-amber)' : 'var(--color-text-muted)',
                              background: selected ? 'var(--color-amber)' : 'transparent'
                            }}>
                            {selected && <Check className="w-3 h-3" style={{ color: 'var(--color-text-inverse)' }} />}
                          </div>
                        </button>
                      );
                    })}
                  </div>
                )}
              </div>

              {/* Select Contractors */}
              <div className="p-4">
                <p className="label-section mb-3">
                  Assign Personnel ({selectedContractorIds.size} selected)
                </p>
                {ownedContractors.length === 0 ? (
                  <p className="text-xs py-2" style={{ color: 'var(--color-text-muted)' }}>No personnel available. Visit Personnel to hire contractors.</p>
                ) : (
                  <div className="space-y-2">
                    {ownedContractors.map((c) => {
                      const selected = selectedContractorIds.has(c.id);
                      return (
                        <button
                          key={c.id}
                          onClick={() => toggleContractor(c.id)}
                          className={`w-full flex items-center gap-3 p-3 rounded-xl text-left transition-all border ${
                            selected ? 'border-[var(--color-amber)]' : 'border-transparent'
                          }`}
                          style={{ background: selected ? 'rgba(212,168,67,0.1)' : 'var(--color-surface)' }}
                        >
                          <div className="w-8 h-8 rounded-lg flex items-center justify-center"
                            style={{ background: selected ? 'rgba(212,168,67,0.2)' : 'var(--color-surface-raised)' }}>
                            <User className="w-4 h-4" style={{ color: selected ? 'var(--color-amber)' : 'var(--color-text-secondary)' }} />
                          </div>
                          <div className="flex-1 min-w-0">
                            <p className="text-sm font-medium truncate" style={{ color: 'var(--color-text)' }}>{c.name}</p>
                            <p className="text-xs capitalize" style={{ color: 'var(--color-text-muted)' }}>{c.specialization} · Skill <span className="font-data">{c.skill_level}</span> · Fatigue <span className="font-data">{c.fatigue_level}%</span></p>
                          </div>
                          <div className={`w-5 h-5 rounded-full border-2 flex items-center justify-center shrink-0`}
                            style={{
                              borderColor: selected ? 'var(--color-amber)' : 'var(--color-text-muted)',
                              background: selected ? 'var(--color-amber)' : 'transparent'
                            }}>
                            {selected && <Check className="w-3 h-3" style={{ color: 'var(--color-text-inverse)' }} />}
                          </div>
                        </button>
                      );
                    })}
                  </div>
                )}
              </div>
            </div>

            {/* Deploy button */}
            <div className="p-4 pb-6 sm:pb-4" style={{ borderTop: '1px solid var(--color-border)' }}>
              <button
                onClick={handleAcceptWithDeployment}
                disabled={actionLoading === deployTemplate.id || (selectedUnitIds.size === 0 && selectedContractorIds.size === 0)}
                className="btn-primary w-full flex items-center justify-center gap-2 text-sm"
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
                <p className="text-xs text-center mt-2" style={{ color: 'var(--color-text-muted)' }}>Select at least one unit or contractor</p>
              )}
            </div>
          </div>
        </div>
      )}

      {/* After-Action Report Bottom Sheet */}
      {simResult && (
        <div className="bottom-sheet-backdrop" onClick={() => setSimResult(null)}>
          <div
            className="bottom-sheet flex flex-col"
            style={{ maxHeight: '90vh' }}
            onClick={(e) => e.stopPropagation()}
          >
            <div className="bottom-sheet-handle" />
            {/* Header banner */}
            <div className="p-5 text-center relative overflow-hidden" style={{ background: simResult.success ? 'rgba(92,138,77,0.1)' : 'rgba(196,69,60,0.1)' }}>
              <div className="w-14 h-14 rounded-full mx-auto flex items-center justify-center mb-2.5"
                style={{ background: simResult.success ? 'rgba(92,138,77,0.2)' : 'rgba(196,69,60,0.2)' }}>
                {simResult.success
                  ? <Trophy className="w-7 h-7" style={{ color: 'var(--color-green)' }} />
                  : <Skull className="w-7 h-7" style={{ color: 'var(--color-red)' }} />
                }
              </div>
              <h2 className="font-display text-lg" style={{ color: 'var(--color-text)' }}>
                {simResult.success ? 'Mission Success' : 'Mission Failed'}
              </h2>
              <p className="text-sm mt-0.5" style={{ color: 'var(--color-text-secondary)' }}>{simResult.mission_title}</p>
              <div className="flex items-center justify-center gap-3 mt-2">
                <span className={`stamp ${riskStampClass(simResult.risk_level)}`} style={{ fontSize: '10px', transform: 'none', padding: '2px 8px' }}>
                  {riskBadge(simResult.risk_level).label} Risk
                </span>
                <span className="font-data text-[10px]" style={{ color: 'var(--color-text-muted)' }}>
                  {simResult.success_probability}% success chance
                </span>
              </div>
              {simResult.success
                ? <div className="stamp stamp-success absolute top-3 right-3" style={{ fontSize: '10px' }}>Success</div>
                : <div className="stamp stamp-failed absolute top-3 right-3" style={{ fontSize: '10px' }}>Failed</div>
              }
            </div>

            {/* Scrollable content */}
            <div className="overflow-y-auto flex-1 p-4 space-y-4 scroll-list">

              {/* Rewards */}
              <div>
                <p className="label-section mb-2">Rewards</p>
                <div className="grid grid-cols-2 gap-2">
                  <div className="card-dossier p-3 text-center">
                    <DollarSign className="w-4 h-4 mx-auto mb-1" style={{ color: 'var(--color-green)' }} />
                    <p className="font-data text-lg font-bold" style={{ color: 'var(--color-green)' }}>${simResult.payout.toLocaleString()}</p>
                    <p className="text-[10px]" style={{ color: 'var(--color-text-muted)' }}>Payout earned</p>
                  </div>
                  <div className="card-dossier p-3 text-center">
                    <Zap className="w-4 h-4 mx-auto mb-1" style={{ color: 'var(--color-blue)' }} />
                    <p className="font-data text-lg font-bold" style={{ color: simResult.reputation_change >= 0 ? 'var(--color-blue)' : 'var(--color-red)' }}>
                      {simResult.reputation_change >= 0 ? '+' : ''}{simResult.reputation_change}
                    </p>
                    <p className="text-[10px]" style={{ color: 'var(--color-text-muted)' }}>Reputation</p>
                  </div>
                </div>
              </div>

              {/* Battle strength comparison */}
              <div>
                <p className="label-section mb-2">Battle Overview</p>
                <div className="card-dossier p-3">
                  <div className="flex items-center justify-between mb-2">
                    <span className="text-xs font-semibold" style={{ color: 'var(--color-green)' }}>Allied Forces</span>
                    <span className="text-xs font-semibold" style={{ color: 'var(--color-red)' }}>Enemy Forces</span>
                  </div>
                  <div className="flex items-center gap-2">
                    <span className="font-data text-sm font-bold w-12 text-left" style={{ color: 'var(--color-text)' }}>{simResult.ally_strength}</span>
                    <div className="gauge-bar flex-1" style={{ height: '12px' }}>
                      {(() => {
                        const total = simResult.ally_strength + simResult.enemy_strength;
                        const allyPct = total > 0 ? (simResult.ally_strength / total) * 100 : 50;
                        return (
                          <div className="flex h-full">
                            <div className="gauge-fill gauge-fill-green rounded-l-full" style={{ width: `${allyPct}%` }} />
                            <div className="gauge-fill gauge-fill-red rounded-r-full" style={{ width: `${100 - allyPct}%` }} />
                          </div>
                        );
                      })()}
                    </div>
                    <span className="font-data text-sm font-bold w-12 text-right" style={{ color: 'var(--color-text)' }}>{simResult.enemy_strength}</span>
                  </div>
                </div>
              </div>

              {/* Random events */}
              {simResult.random_events.length > 0 && (
                <div>
                  <p className="label-section mb-2">Battlefield Events</p>
                  <div className="space-y-1.5">
                    {simResult.random_events.map((event, i) => (
                      <div key={i} className="flex items-start gap-2.5 rounded-xl px-3 py-2.5"
                        style={{ background: event.impact > 0 ? 'rgba(92,138,77,0.1)' : 'rgba(196,69,60,0.1)' }}>
                        <Sparkles className="w-4 h-4 mt-0.5 shrink-0" style={{ color: event.impact > 0 ? 'var(--color-green)' : 'var(--color-red)' }} />
                        <div>
                          <p className="text-xs font-medium" style={{ color: 'var(--color-text)' }}>
                            {event.type.replace(/_/g, ' ').replace(/\b\w/g, (c: string) => c.toUpperCase())}
                          </p>
                          <p className="text-xs mt-0.5" style={{ color: 'var(--color-text-secondary)' }}>{event.description}</p>
                          <span className="font-data text-[10px] font-bold" style={{ color: event.impact > 0 ? 'var(--color-green)' : 'var(--color-red)' }}>
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
                  <p className="label-section mb-2">Unit Damage Report</p>
                  <div className="space-y-2">
                    {simResult.unit_report.map((unit, i) => {
                      const Icon = typeIcons[unit.type] ?? Plane;
                      const critical = unit.condition_after < 30;
                      return (
                        <div key={i} className="card-dossier p-3">
                          <div className="flex items-center gap-2.5 mb-2">
                            <Icon className="w-4 h-4" style={{ color: critical ? 'var(--color-red)' : 'var(--color-text-secondary)' }} />
                            <span className="text-xs font-semibold flex-1" style={{ color: 'var(--color-text)' }}>{unit.name}</span>
                            {unit.damage_taken > 0 && (
                              <span className="font-data text-[10px] font-bold" style={{ color: 'var(--color-red)' }}>-{unit.damage_taken}% dmg</span>
                            )}
                          </div>
                          <div className="flex items-center gap-2">
                            <div className="gauge-bar flex-1">
                              <div className="h-full relative">
                                <div
                                  className="absolute inset-y-0 left-0 rounded-full"
                                  style={{ width: `${unit.condition_before}%`, background: 'var(--color-text-muted)', opacity: 0.4 }}
                                />
                                <div
                                  className={`absolute inset-y-0 left-0 rounded-full gauge-fill ${
                                    unit.condition_after >= 70 ? 'gauge-fill-green' :
                                    unit.condition_after >= 40 ? 'gauge-fill-amber' : 'gauge-fill-red'
                                  }`}
                                  style={{ width: `${unit.condition_after}%` }}
                                />
                              </div>
                            </div>
                            <span className="font-data text-xs w-16 text-right shrink-0" style={{ color: 'var(--color-text-secondary)' }}>
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
                  <p className="label-section mb-2">Crew Fatigue Report</p>
                  <div className="space-y-2">
                    {simResult.contractor_report.map((c, i) => {
                      const exhausted = c.fatigue_after > 75;
                      return (
                        <div key={i} className="card-dossier p-3">
                          <div className="flex items-center gap-2.5 mb-2">
                            <User className="w-4 h-4" style={{ color: exhausted ? 'var(--color-red)' : 'var(--color-text-secondary)' }} />
                            <div className="flex-1 min-w-0">
                              <span className="text-xs font-semibold" style={{ color: 'var(--color-text)' }}>{c.name}</span>
                              <span className="text-[10px] ml-1.5 capitalize" style={{ color: 'var(--color-text-muted)' }}>{c.specialization}</span>
                            </div>
                            {c.fatigue_gained > 0 && (
                              <span className="font-data text-[10px] font-bold" style={{ color: 'var(--color-amber)' }}>+{c.fatigue_gained}% fatigue</span>
                            )}
                          </div>
                          <div className="flex items-center gap-2">
                            <div className="gauge-bar flex-1">
                              <div className="h-full relative">
                                <div
                                  className={`absolute inset-y-0 left-0 rounded-full gauge-fill ${
                                    c.fatigue_after <= 30 ? 'gauge-fill-green' :
                                    c.fatigue_after <= 60 ? 'gauge-fill-amber' : 'gauge-fill-red'
                                  }`}
                                  style={{ width: `${c.fatigue_after}%` }}
                                />
                              </div>
                            </div>
                            <span className="font-data text-xs w-16 text-right shrink-0" style={{ color: 'var(--color-text-secondary)' }}>
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
                <p className="label-section mb-2">Updated Stats</p>
                <div className="grid grid-cols-2 gap-2">
                  <div className="card-dossier p-3 text-center">
                    <p className="text-[10px]" style={{ color: 'var(--color-text-muted)' }}>Balance</p>
                    <p className="font-data text-sm font-bold" style={{ color: 'var(--color-text)' }}>${simResult.new_balance.toLocaleString()}</p>
                  </div>
                  <div className="card-dossier p-3 text-center">
                    <p className="text-[10px]" style={{ color: 'var(--color-text-muted)' }}>Reputation</p>
                    <p className="font-data text-sm font-bold" style={{ color: 'var(--color-text)' }}>{simResult.new_reputation}%</p>
                  </div>
                </div>
              </div>
            </div>

            {/* Dismiss button */}
            <div className="p-4 pb-6 sm:pb-4" style={{ borderTop: '1px solid var(--color-border)' }}>
              <button
                onClick={() => setSimResult(null)}
                className="btn-secondary w-full text-sm"
              >
                Dismiss
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Header */}
      <div className="flex items-center justify-between mb-5">
        <div className="flex items-center gap-3">
          <div>
            <h1 className="font-display text-xl lg:text-2xl" style={{ color: 'var(--color-text)' }}>Operations Center</h1>
            <p className="text-sm mt-0.5" style={{ color: 'var(--color-text-muted)' }}>Mission board & active deployments</p>
          </div>
          <span className="stamp stamp-confidential text-[10px]">Confidential</span>
        </div>
        <button
          onClick={handleRefresh}
          disabled={refreshing}
          className="btn-secondary w-10 h-10 flex items-center justify-center !p-0 !min-h-0"
        >
          <RefreshCw className={`w-4 h-4 ${refreshing ? 'animate-spin' : ''}`} />
        </button>
      </div>

      {/* Tab switcher */}
      <div className="tab-bar mb-5">
        <button
          onClick={() => setTab('available')}
          className={`tab-item ${tab === 'available' ? 'tab-item-active' : ''}`}
        >
          Available <span className="tab-count">{missionTemplates.length}</span>
        </button>
        <button
          onClick={() => setTab('active')}
          className={`tab-item ${tab === 'active' ? 'tab-item-active' : ''} relative`}
        >
          Active <span className="tab-count">{activeContracts.length}</span>
          {activeContracts.length > 0 && tab !== 'active' && (
            <span className="status-dot status-dot-active absolute top-1.5 right-3" />
          )}
        </button>
      </div>

      {/* Available contracts */}
      {tab === 'available' && (
        <div className="space-y-3">
          {/* Campaign chapters */}
          {chapters.length > 0 && (
            <div className="mb-4">
              <p className="label-section mb-2">CAMPAIGNS</p>
              <div className="space-y-2">
                {chapters.map((ch: any) => (
                  <div key={ch.key} className={ch.is_unlocked ? 'card-dossier-tab p-3' : 'card-redacted p-3'} style={!ch.is_unlocked ? { opacity: 0.6 } : {}}>
                    <div className="flex items-center justify-between mb-1">
                      <h3 className="font-display text-sm tracking-wider" style={{ color: ch.is_unlocked ? 'var(--color-text)' : 'var(--color-text-muted)' }}>
                        {ch.title}
                      </h3>
                      {ch.is_complete && <span className="stamp stamp-success text-[8px]">COMPLETE</span>}
                      {!ch.is_unlocked && <span className="text-[10px] font-display tracking-wider" style={{ color: 'var(--color-text-muted)' }}>&#128274; {ch.rank_name}</span>}
                    </div>
                    {ch.is_unlocked && (
                      <>
                        <p className="text-xs mb-2" style={{ color: 'var(--color-text-muted)' }}>{ch.description}</p>
                        <div className="flex items-center gap-2">
                          <div className="flex-1 gauge-bar" style={{ height: '4px' }}>
                            <div className="gauge-fill gauge-fill-amber" style={{ width: `${ch.total_missions > 0 ? (ch.completed_missions / ch.total_missions) * 100 : 0}%` }} />
                          </div>
                          <span className="font-data text-[10px]" style={{ color: 'var(--color-text-muted)' }}>{ch.completed_missions}/{ch.total_missions}</span>
                        </div>
                      </>
                    )}
                    {!ch.is_unlocked && (
                      <p className="text-[10px]" style={{ color: 'var(--color-text-muted)' }}>Requires {ch.rank_name} rank to unlock</p>
                    )}
                  </div>
                ))}
              </div>
              <div className="divider" />
            </div>
          )}

          {missionTemplates.length === 0 ? (
            <EmptyState message="No contracts available. Check back later." />
          ) : (
            missionTemplates.map((template) => {
              const faction = factionColors[template.faction] ?? factionColors['atlantic_coalition'];
              const fName = factionDisplayName[template.faction] ?? template.faction;
              const risk = riskBadge(template.risk_level);
              const requiredUnits = parseRequiredUnits(template.required_unit_types);
              const alreadyAccepted = activeContracts.some((c) => c.mission_template_id === template.id);
              const isLocked = (template as any).min_rank && userRank && (template as any).min_rank > userRank.rank_index;

              return (
                <div
                  key={template.id}
                  className={isLocked ? "card-redacted overflow-hidden" : "card-dossier-tab overflow-hidden"}
                  style={isLocked ? { opacity: 0.6 } : {}}
                >
                  <div className="p-4">
                    <div className="flex items-center justify-between mb-2.5">
                      <div className="flex items-center gap-2">
                        <div className={`w-2 h-2 rounded-full ${faction.dot}`} />
                        <span className={`text-xs font-medium ${faction.text}`}>{fName}</span>
                      </div>
                      <div className="flex items-center gap-1.5">
                        {template.battle_type && (
                          <span
                            className="text-[10px] font-bold uppercase tracking-wider px-2 py-0.5 rounded-md"
                            style={{
                              background: template.battle_type === 'ground' ? 'rgba(107,174,114,0.15)' : 'rgba(91,139,160,0.15)',
                              color: template.battle_type === 'ground' ? 'var(--color-green)' : 'var(--color-blue)',
                            }}
                          >
                            {template.battle_type === 'air' ? '✈ Tactical' : template.battle_type === 'naval' ? '🚢 Naval' : '⚔ Ground'}
                          </span>
                        )}
                        <span className={`stamp ${riskStampClass(template.risk_level)}`} style={{ fontSize: '10px', transform: 'none', padding: '2px 8px' }}>
                          {risk.label} Risk
                        </span>
                      </div>
                    </div>

                    <h3 className="text-base font-bold mb-1" style={{ color: 'var(--color-text)' }}>{template.title}</h3>
                    {template.description && (
                      <p className="text-xs mb-2" style={{ color: 'var(--color-text-muted)' }}>{template.description}</p>
                    )}
                    {template.terrain_type && (
                      <div className="flex items-center gap-2 mb-2">
                        <span className="text-[10px] px-2 py-0.5 rounded" style={{ background: 'rgba(107,174,114,0.12)', color: 'var(--color-green)' }}>
                          {template.terrain_type.toUpperCase()} TERRAIN
                        </span>
                        <span className="text-[10px] px-2 py-0.5 rounded" style={{ background: 'rgba(229,62,62,0.12)', color: 'var(--color-red)' }}>
                          DIFF {template.difficulty || 1}
                        </span>
                      </div>
                    )}

                    <div className="grid grid-cols-3 gap-2 mb-3">
                      <div className="rounded-xl px-3 py-2" style={{ background: 'var(--color-surface-raised)' }}>
                        <div className="flex items-center gap-1 mb-0.5">
                          <DollarSign className="w-3 h-3" style={{ color: 'var(--color-green)' }} />
                          <span className="text-[10px]" style={{ color: 'var(--color-text-muted)' }}>Payout</span>
                        </div>
                        <p className="font-data text-sm font-bold" style={{ color: 'var(--color-text)' }}>${(template.base_payout / 1000).toFixed(0)}k</p>
                      </div>
                      <div className="rounded-xl px-3 py-2" style={{ background: 'var(--color-surface-raised)' }}>
                        <div className="flex items-center gap-1 mb-0.5">
                          <Clock className="w-3 h-3" style={{ color: 'var(--color-text-secondary)' }} />
                          <span className="text-[10px]" style={{ color: 'var(--color-text-muted)' }}>Duration</span>
                        </div>
                        <p className="font-data text-sm font-bold" style={{ color: 'var(--color-text)' }}>{template.estimated_duration_hours}h</p>
                      </div>
                      <div className="rounded-xl px-3 py-2" style={{ background: 'var(--color-surface-raised)' }}>
                        <div className="flex items-center gap-1 mb-0.5">
                          <Zap className="w-3 h-3" style={{ color: 'var(--color-amber)' }} />
                          <span className="text-[10px]" style={{ color: 'var(--color-text-muted)' }}>Impact</span>
                        </div>
                        <p className="font-data text-sm font-bold" style={{ color: template.political_impact >= 0 ? 'var(--color-green)' : 'var(--color-red)' }}>
                          {template.political_impact > 0 ? '+' : ''}{template.political_impact}
                        </p>
                      </div>
                    </div>

                    <div className="flex items-center gap-1.5 mb-4 flex-wrap">
                      <Target className="w-3 h-3 shrink-0" style={{ color: 'var(--color-text-muted)' }} />
                      <span className="label-section mr-1">Requires</span>
                      {requiredUnits.map((unit) => (
                        <span key={unit} className="text-xs px-2 py-0.5 rounded-md font-medium" style={{ background: 'var(--color-surface-raised)', color: 'var(--color-text-secondary)' }}>
                          {unit}
                        </span>
                      ))}
                    </div>

                    {isLocked ? (
                      <div className="w-full flex items-center justify-center gap-2 text-sm py-3 rounded-xl" style={{ background: 'var(--color-surface-raised)', color: 'var(--color-text-muted)' }}>
                        &#128274; Requires higher rank
                      </div>
                    ) : (
                      <button
                        onClick={() => alreadyAccepted ? null : openDeployModal(template)}
                        disabled={alreadyAccepted || actionLoading === template.id}
                        className={`
                          w-full flex items-center justify-center gap-2 text-sm py-3 rounded-xl transition-colors
                          ${alreadyAccepted
                            ? 'btn-secondary cursor-not-allowed opacity-40'
                            : 'btn-primary'
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
                    )}
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
                  className="card-dossier-tab overflow-hidden"
                >
                  <div className="p-4">
                    <div className="flex items-center justify-between mb-3">
                      <div className="flex items-center gap-2">
                        <span className="status-dot status-dot-active" />
                        <span className="label-section" style={{ color: 'var(--color-green)' }}>Ready to Deploy</span>
                      </div>
                      <div className="flex items-center gap-1.5 rounded-lg px-2.5 py-1" style={{ background: 'var(--color-surface-raised)' }}>
                        <Clock className="w-3 h-3" style={{ color: 'var(--color-amber)' }} />
                        <span className="font-data text-xs font-bold" style={{ color: 'var(--color-amber)' }}>{timeStr}</span>
                      </div>
                    </div>

                    <h3 className="text-base font-bold" style={{ color: 'var(--color-text)' }}>{template.title}</h3>
                    <div className="flex items-center gap-2 mt-1 mb-3">
                      <div className={`w-1.5 h-1.5 rounded-full ${faction.dot}`} />
                      <span className={`text-xs ${faction.text}`}>{fName}</span>
                      <span style={{ color: 'var(--color-border)' }}>·</span>
                      <span className={`text-xs ${risk.text}`}>{risk.label} Risk</span>
                      <span style={{ color: 'var(--color-border)' }}>·</span>
                      <span className="font-data text-xs" style={{ color: 'var(--color-green)' }}>${template.base_payout.toLocaleString()}</span>
                    </div>

                    {/* Assigned resources */}
                    {(assignedUnitNames.length > 0 || assignedContractorNames.length > 0) && (
                      <div className="space-y-2 mb-4">
                        {assignedUnitNames.length > 0 && (
                          <div>
                            <p className="label-section mb-1">Deployed Units</p>
                            <div className="flex flex-wrap gap-1.5">
                              {assignedUnitNames.map((name, i) => (
                                <span key={i} className="text-xs px-2.5 py-1 rounded-lg font-medium" style={{ background: 'rgba(91,139,160,0.15)', color: 'var(--color-blue)' }}>{name}</span>
                              ))}
                            </div>
                          </div>
                        )}
                        {assignedContractorNames.length > 0 && (
                          <div>
                            <p className="label-section mb-1">Personnel</p>
                            <div className="flex flex-wrap gap-1.5">
                              {assignedContractorNames.map((name, i) => (
                                <span key={i} className="text-xs px-2.5 py-1 rounded-lg font-medium" style={{ background: 'rgba(212,168,67,0.15)', color: 'var(--color-amber)' }}>{name}</span>
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
                        className="btn-primary flex-1 flex items-center justify-center gap-2 text-sm"
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
                        className="btn-danger flex items-center justify-center gap-1.5 text-sm px-4"
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
      <div className="w-16 h-16 rounded-2xl flex items-center justify-center mb-4" style={{ background: 'var(--color-surface-raised)' }}>
        <AlertTriangle className="w-8 h-8" style={{ color: 'var(--color-text-muted)' }} />
      </div>
      <p className="font-medium" style={{ color: 'var(--color-text-secondary)' }}>{message}</p>
    </div>
  );
}
