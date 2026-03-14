import { useState, useEffect, useCallback } from 'react';
import {
  User,
  Zap,
  Battery,
  BedDouble,
  Trash2,
  Plus,
  X,
  Loader2,
  ShoppingCart,
  ChevronDown,
  ChevronUp,
  AlertCircle,
} from 'lucide-react';
import { apiService } from '../../services/api';

interface Contractor {
  id: number;
  name: string;
  specialization: string;
  skill: number;
  fatigue: number;
  salary: number;
}

interface ContractorTemplate {
  id: number;
  name: string;
  specialization: string;
  base_skill: number;
  base_salary: number;
  description: string | null;
}

const specColors: Record<string, { bg: string; text: string }> = {
  pilot: { bg: 'bg-blue-500/15', text: 'text-blue-400' },
  operator: { bg: 'bg-cyan-500/15', text: 'text-cyan-400' },
  technician: { bg: 'bg-amber-500/15', text: 'text-amber-400' },
};

const fatigueLabel = (f: number) => {
  if (f <= 20) return { text: 'Rested', color: 'text-emerald-400' };
  if (f <= 50) return { text: 'Normal', color: 'text-gray-400' };
  if (f <= 75) return { text: 'Tired', color: 'text-amber-400' };
  return { text: 'Exhausted', color: 'text-red-400' };
};

const fatigueBarColor = (f: number) => {
  if (f <= 20) return 'bg-emerald-500';
  if (f <= 50) return 'bg-gray-500';
  if (f <= 75) return 'bg-amber-500';
  return 'bg-red-500';
};

export const Personnel = () => {
  const [contractors, setContractors] = useState<Contractor[]>([]);
  const [templates, setTemplates] = useState<ContractorTemplate[]>([]);
  const [loading, setLoading] = useState(true);
  const [expandedId, setExpandedId] = useState<number | null>(null);
  const [showHire, setShowHire] = useState(false);
  const [actionLoading, setActionLoading] = useState<number | null>(null);
  const [balance, setBalance] = useState(0);

  const fetchData = useCallback(async () => {
    try {
      const [ownedRes, templateRes, userRes] = await Promise.all([
        apiService.getOwnedContractors(),
        apiService.getContractorTemplates(),
        apiService.getUser(1),
      ]);

      const owned = Array.isArray(ownedRes.data) ? ownedRes.data : [];
      const tmpls: ContractorTemplate[] = Array.isArray(templateRes.data) ? templateRes.data : [];
      setTemplates(tmpls);
      setBalance(userRes.data.balance);

      const enriched: Contractor[] = owned.map((c: any) => {
        const tmpl = tmpls.find((t) => Number(t.id) === Number(c.template_id));
        return {
          id: c.id,
          name: tmpl?.name ?? 'Unknown',
          specialization: tmpl?.specialization ?? 'unknown',
          skill: c.skill_level ?? 50,
          fatigue: c.fatigue_level ?? 0,
          salary: c.current_salary ?? 0,
        };
      });
      setContractors(enriched);
    } catch {
      setContractors([
        { id: 1, name: 'Ace Pilot', specialization: 'pilot', skill: 80, fatigue: 10, salary: 5000 },
        { id: 2, name: 'Drone Operator', specialization: 'operator', skill: 70, fatigue: 45, salary: 3000 },
        { id: 3, name: 'Submarine Commander', specialization: 'operator', skill: 85, fatigue: 80, salary: 8000 },
      ]);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchData();
  }, [fetchData]);

  const handleRest = async (contractorId: number) => {
    setActionLoading(contractorId);
    setContractors((prev) =>
      prev.map((c) => (c.id === contractorId ? { ...c, fatigue: Math.max(0, c.fatigue - 30) } : c))
    );
    try {
      const contractor = contractors.find((c) => c.id === contractorId);
      await apiService.updateOwnedContractor(contractorId, {
        fatigue_level: Math.max(0, (contractor?.fatigue ?? 0) - 30),
      });
    } catch { /* optimistic */ }
    finally { setActionLoading(null); }
  };

  const handleDismiss = async (contractorId: number) => {
    setActionLoading(contractorId);
    setContractors((prev) => prev.filter((c) => c.id !== contractorId));
    try {
      await apiService.deleteOwnedContractor(contractorId);
    } catch { /* already removed */ }
    finally {
      setActionLoading(null);
      setExpandedId(null);
    }
  };

  const handleHire = async (template: ContractorTemplate) => {
    if (balance < template.base_salary) return;
    setActionLoading(template.id);
    try {
      const newBalance = balance - template.base_salary;
      await Promise.all([
        apiService.createOwnedContractor({
          user_id: 1,
          template_id: template.id,
          skill_level: template.base_skill,
          fatigue_level: 0,
          current_salary: template.base_salary,
        }),
        apiService.updateUser(1, { balance: newBalance }),
      ]);
      setBalance(newBalance);
      await fetchData();
      setShowHire(false);
    } catch (err) {
      console.error('Failed to hire:', err);
    } finally {
      setActionLoading(null);
    }
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center h-full">
        <div className="flex flex-col items-center gap-3">
          <div className="w-8 h-8 border-2 border-emerald-500 border-t-transparent rounded-full animate-spin" />
          <p className="text-sm text-gray-500">Loading personnel...</p>
        </div>
      </div>
    );
  }

  const totalSalary = contractors.reduce((sum, c) => sum + c.salary, 0);

  return (
    <div className="px-4 py-5 lg:px-8 lg:py-6 max-w-4xl mx-auto">
      {/* Hire Modal */}
      {showHire && (
        <div className="fixed inset-0 bg-black/70 backdrop-blur-sm z-[60] flex items-end sm:items-center justify-center" onClick={() => setShowHire(false)}>
          <div
            className="bg-gray-900 rounded-t-2xl sm:rounded-2xl border-t sm:border border-gray-800 w-full sm:max-w-md max-h-[80vh] overflow-hidden flex flex-col"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-center justify-between p-4 border-b border-gray-800">
              <div>
                <h2 className="text-lg font-bold text-white">Hire Personnel</h2>
                <p className="text-xs text-gray-500">Balance: ${balance.toLocaleString()}</p>
              </div>
              <button onClick={() => setShowHire(false)} className="w-8 h-8 rounded-lg bg-gray-800 flex items-center justify-center text-gray-400">
                <X className="w-4 h-4" />
              </button>
            </div>
            <div className="overflow-y-auto p-4 space-y-3">
              {templates.map((tmpl) => {
                const spec = specColors[tmpl.specialization] ?? specColors['operator'];
                const isLoading = actionLoading === tmpl.id;
                const canAfford = balance >= tmpl.base_salary;
                return (
                  <div key={tmpl.id} className="bg-gray-800/50 rounded-xl p-4">
                    <div className="flex items-center gap-3 mb-2">
                      <div className={`w-10 h-10 rounded-xl ${spec.bg} flex items-center justify-center`}>
                        <User className={`w-5 h-5 ${spec.text}`} />
                      </div>
                      <div className="flex-1 min-w-0">
                        <h3 className="text-sm font-semibold text-white">{tmpl.name}</h3>
                        <p className="text-xs text-gray-500 capitalize">{tmpl.specialization}</p>
                      </div>
                      <span className={`text-xs font-bold ${spec.text} px-2 py-0.5 rounded-md ${spec.bg}`}>
                        Skill {tmpl.base_skill}
                      </span>
                    </div>
                    {tmpl.description && (
                      <p className="text-xs text-gray-500 mb-3">{tmpl.description}</p>
                    )}
                    <div className="flex items-center justify-between">
                      <span className="text-xs text-gray-400">${tmpl.base_salary.toLocaleString()}/mo salary</span>
                      <button
                        onClick={() => handleHire(tmpl)}
                        disabled={isLoading || !canAfford}
                        className={`flex items-center gap-1.5 font-semibold text-xs py-2 px-4 rounded-lg transition-colors ${
                          canAfford
                            ? 'bg-emerald-500 text-white active:bg-emerald-600 disabled:opacity-60'
                            : 'bg-gray-700 text-gray-500 cursor-not-allowed'
                        }`}
                      >
                        {isLoading ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <ShoppingCart className="w-3.5 h-3.5" />}
                        {canAfford ? `Hire · $${tmpl.base_salary.toLocaleString()}` : 'Can\'t afford'}
                      </button>
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        </div>
      )}

      {/* Header */}
      <div className="flex items-center justify-between mb-5">
        <div>
          <h1 className="text-xl font-bold text-white lg:text-2xl">Personnel</h1>
          <p className="text-sm text-gray-500 mt-0.5">
            {contractors.length} contractor{contractors.length !== 1 ? 's' : ''} · ${totalSalary.toLocaleString()}/mo payroll
          </p>
        </div>
        <button
          onClick={() => setShowHire(true)}
          className="w-10 h-10 rounded-xl bg-emerald-500/15 flex items-center justify-center text-emerald-400 active:bg-emerald-500/25 transition-colors"
        >
          <Plus className="w-5 h-5" />
        </button>
      </div>

      {/* Contractor list */}
      {contractors.length === 0 ? (
        <div className="flex flex-col items-center justify-center py-16 text-center">
          <div className="w-16 h-16 rounded-2xl bg-gray-800 flex items-center justify-center mb-4">
            <User className="w-8 h-8 text-gray-600" />
          </div>
          <p className="text-gray-400 font-medium">No personnel hired</p>
          <p className="text-sm text-gray-600 mt-1 mb-4">Hire contractors to staff your operations</p>
          <button
            onClick={() => setShowHire(true)}
            className="flex items-center gap-2 bg-emerald-500 text-white font-semibold text-sm py-2.5 px-5 rounded-xl active:bg-emerald-600 transition-colors"
          >
            <Plus className="w-4 h-4" />
            Browse Available
          </button>
        </div>
      ) : (
        <div className="space-y-3">
          {contractors.map((contractor) => {
            const spec = specColors[contractor.specialization] ?? specColors['operator'];
            const fatigue = fatigueLabel(contractor.fatigue);
            const isExpanded = expandedId === contractor.id;

            return (
              <div
                key={contractor.id}
                className="bg-gray-900 rounded-2xl border border-gray-800/60 overflow-hidden card-press"
              >
                {/* Main row */}
                <button
                  onClick={() => setExpandedId(isExpanded ? null : contractor.id)}
                  className="w-full flex items-center gap-3.5 p-4 text-left"
                >
                  <div className={`w-11 h-11 rounded-xl ${spec.bg} flex items-center justify-center shrink-0`}>
                    <User className={`w-5 h-5 ${spec.text}`} />
                  </div>

                  <div className="flex-1 min-w-0">
                    <h3 className="text-sm font-semibold text-white truncate">{contractor.name}</h3>
                    <div className="flex items-center gap-2 mt-1">
                      <span className="text-xs text-gray-500 capitalize">{contractor.specialization}</span>
                      <span className="text-gray-700">·</span>
                      <span className={`text-xs font-medium ${fatigue.color}`}>{fatigue.text}</span>
                    </div>
                  </div>

                  <div className="flex items-center gap-3 shrink-0">
                    <div className="text-right">
                      <p className="text-sm font-bold text-white">{contractor.skill}</p>
                      <p className="text-[10px] text-gray-500">Skill</p>
                    </div>
                    {isExpanded
                      ? <ChevronUp className="w-4 h-4 text-gray-600" />
                      : <ChevronDown className="w-4 h-4 text-gray-600" />
                    }
                  </div>
                </button>

                {/* Fatigue bar */}
                <div className="px-4 pb-3 -mt-1">
                  <div className="flex items-center gap-2">
                    <Battery className="w-3 h-3 text-gray-600" />
                    <div className="flex-1 h-1.5 bg-gray-800 rounded-full overflow-hidden">
                      <div
                        className={`h-full rounded-full transition-all duration-500 ${fatigueBarColor(contractor.fatigue)}`}
                        style={{ width: `${contractor.fatigue}%` }}
                      />
                    </div>
                    <span className="text-[10px] text-gray-500 w-8 text-right">{contractor.fatigue}%</span>
                  </div>
                </div>

                {/* Expanded */}
                {isExpanded && (
                  <div className="px-4 pb-4 border-t border-gray-800/60 pt-3 space-y-3">
                    <div className="flex gap-3">
                      <div className="flex-1 bg-gray-800/50 rounded-xl p-3">
                        <p className="text-[10px] text-gray-500 uppercase tracking-wider">Skill Level</p>
                        <div className="flex items-center gap-1.5 mt-0.5">
                          <Zap className="w-3.5 h-3.5 text-emerald-400" />
                          <p className="text-sm font-semibold text-white">{contractor.skill}/100</p>
                        </div>
                      </div>
                      <div className="flex-1 bg-gray-800/50 rounded-xl p-3">
                        <p className="text-[10px] text-gray-500 uppercase tracking-wider">Salary</p>
                        <p className="text-sm font-semibold text-white mt-0.5">${contractor.salary.toLocaleString()}/mo</p>
                      </div>
                    </div>

                    {contractor.fatigue > 50 && (
                      <div className="flex items-center gap-2 bg-amber-500/10 rounded-xl px-3 py-2.5">
                        <AlertCircle className="w-4 h-4 text-amber-400 shrink-0" />
                        <p className="text-xs text-amber-300">
                          High fatigue reduces mission effectiveness. Consider resting this contractor.
                        </p>
                      </div>
                    )}

                    <div className="flex gap-2">
                      <button
                        onClick={(e) => { e.stopPropagation(); handleRest(contractor.id); }}
                        disabled={actionLoading === contractor.id || contractor.fatigue === 0}
                        className="flex-1 flex items-center justify-center gap-1.5 bg-blue-500/15 text-blue-400 font-medium text-sm py-2.5 rounded-xl active:bg-blue-500/25 disabled:opacity-40 transition-colors"
                      >
                        {actionLoading === contractor.id
                          ? <Loader2 className="w-4 h-4 animate-spin" />
                          : <BedDouble className="w-4 h-4" />
                        }
                        Rest
                      </button>
                      <button
                        onClick={(e) => { e.stopPropagation(); handleDismiss(contractor.id); }}
                        disabled={actionLoading === contractor.id}
                        className="flex items-center justify-center gap-1.5 bg-gray-800 text-gray-400 font-medium text-sm py-2.5 px-4 rounded-xl active:bg-gray-700 transition-colors"
                      >
                        <Trash2 className="w-4 h-4" />
                      </button>
                    </div>
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
};
