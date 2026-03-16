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
  ChevronDown,
  ChevronUp,
  AlertCircle,
} from 'lucide-react';
import { apiService } from '../../services/api';
import '../../styles/design-system.css';

interface Contractor {
  id: number; name: string; specialization: string; skill: number; fatigue: number; salary: number;
}

interface ContractorTemplate {
  id: number; name: string; specialization: string; base_skill: number; base_salary: number; description: string | null;
}

const specColors: Record<string, { bg: string; color: string }> = {
  pilot: { bg: 'rgba(91,139,160,0.15)', color: 'var(--color-blue)' },
  operator: { bg: 'rgba(34,211,238,0.12)', color: '#22d3ee' },
  technician: { bg: 'rgba(212,168,67,0.15)', color: 'var(--color-amber)' },
};

const fatigueLabel = (f: number) => {
  if (f <= 20) return { text: 'Rested', color: 'var(--color-green)' };
  if (f <= 50) return { text: 'Normal', color: 'var(--color-text-secondary)' };
  if (f <= 75) return { text: 'Tired', color: 'var(--color-amber)' };
  return { text: 'Exhausted', color: 'var(--color-red)' };
};

const fatigueBg = (f: number) => f <= 20 ? 'gauge-fill-green' : f <= 50 ? 'gauge-fill-amber' : f <= 75 ? 'gauge-fill-amber' : 'gauge-fill-red';

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
        apiService.getOwnedContractors(), apiService.getContractorTemplates(), apiService.getUser(1),
      ]);
      const owned = Array.isArray(ownedRes.data) ? ownedRes.data : [];
      const tmpls: ContractorTemplate[] = Array.isArray(templateRes.data) ? templateRes.data : [];
      setTemplates(tmpls);
      setBalance(userRes.data.balance);
      const enriched: Contractor[] = owned.map((c: any) => {
        const tmpl = tmpls.find(t => Number(t.id) === Number(c.template_id));
        return { id: c.id, name: tmpl?.name ?? 'Unknown', specialization: tmpl?.specialization ?? 'unknown', skill: c.skill_level ?? 50, fatigue: c.fatigue_level ?? 0, salary: c.current_salary ?? 0 };
      });
      setContractors(enriched);
    } catch {
      setContractors([
        { id: 1, name: 'Ace Pilot', specialization: 'pilot', skill: 80, fatigue: 10, salary: 5000 },
        { id: 2, name: 'Drone Operator', specialization: 'operator', skill: 70, fatigue: 45, salary: 3000 },
      ]);
    } finally { setLoading(false); }
  }, []);

  useEffect(() => { fetchData(); }, [fetchData]);

  const handleRest = async (contractorId: number) => {
    setActionLoading(contractorId);
    setContractors(prev => prev.map(c => c.id === contractorId ? { ...c, fatigue: Math.max(0, c.fatigue - 30) } : c));
    try {
      const contractor = contractors.find(c => c.id === contractorId);
      await apiService.updateOwnedContractor(contractorId, { fatigue_level: Math.max(0, (contractor?.fatigue ?? 0) - 30) });
    } catch { /* optimistic */ }
    finally { setActionLoading(null); }
  };

  const handleDismiss = async (contractorId: number) => {
    setActionLoading(contractorId);
    setContractors(prev => prev.filter(c => c.id !== contractorId));
    try { await apiService.deleteOwnedContractor(contractorId); }
    catch { /* already removed */ }
    finally { setActionLoading(null); setExpandedId(null); }
  };

  const handleHire = async (template: ContractorTemplate) => {
    if (balance < template.base_salary) return;
    setActionLoading(template.id);
    try {
      const newBalance = balance - template.base_salary;
      await Promise.all([
        apiService.createOwnedContractor({ user_id: 1, template_id: template.id, skill_level: template.base_skill, fatigue_level: 0, current_salary: template.base_salary }),
        apiService.updateUser(1, { balance: newBalance }),
      ]);
      setBalance(newBalance);
      await fetchData();
      setShowHire(false);
    } catch (err) { console.error('Failed to hire:', err); }
    finally { setActionLoading(null); }
  };

  if (loading) return (
    <div className="flex items-center justify-center h-full">
      <div className="flex flex-col items-center gap-3">
        <Loader2 className="w-6 h-6 animate-spin" style={{ color: 'var(--color-amber)' }} />
        <p className="text-sm" style={{ color: 'var(--color-text-muted)' }}>Loading dossiers...</p>
      </div>
    </div>
  );

  const totalSalary = contractors.reduce((sum, c) => sum + c.salary, 0);

  return (
    <div className="px-4 py-5 lg:px-8 lg:py-6 max-w-4xl mx-auto" style={{ color: 'var(--color-text)' }}>
      {/* Hire Modal */}
      {showHire && (
        <>
          <div className="bottom-sheet-backdrop" onClick={() => setShowHire(false)} />
          <div className="bottom-sheet p-0">
            <div className="bottom-sheet-handle" />
            <div className="flex items-center justify-between p-4" style={{ borderBottom: '1px solid var(--color-border)' }}>
              <div>
                <h2 className="font-display text-base tracking-wider" style={{ color: 'var(--color-amber)' }}>RECRUIT PERSONNEL</h2>
                <p className="font-data text-xs" style={{ color: 'var(--color-text-muted)' }}>Treasury: ${balance.toLocaleString()}</p>
              </div>
              <button onClick={() => setShowHire(false)} className="w-8 h-8 rounded-lg flex items-center justify-center" style={{ background: 'var(--color-surface)', color: 'var(--color-text-muted)' }}>
                <X className="w-4 h-4" />
              </button>
            </div>
            <div className="overflow-y-auto p-4 space-y-3 scroll-list" style={{ maxHeight: '65vh' }}>
              {templates.map(tmpl => {
                const spec = specColors[tmpl.specialization] ?? specColors['operator'];
                const isLoading = actionLoading === tmpl.id;
                const canAfford = balance >= tmpl.base_salary;
                return (
                  <div key={tmpl.id} className="card-dossier p-4">
                    <div className="flex items-center gap-3 mb-2">
                      <div className="w-10 h-10 rounded-lg flex items-center justify-center shrink-0" style={{ background: spec.bg }}>
                        <User className="w-5 h-5" style={{ color: spec.color }} />
                      </div>
                      <div className="flex-1 min-w-0">
                        <h3 className="text-sm font-semibold" style={{ color: 'var(--color-text)' }}>{tmpl.name}</h3>
                        <p className="text-xs capitalize font-display tracking-wider" style={{ color: 'var(--color-text-muted)' }}>{tmpl.specialization}</p>
                      </div>
                      <span className="font-data text-xs font-bold px-2 py-0.5 rounded" style={{ background: spec.bg, color: spec.color }}>
                        SKL {tmpl.base_skill}
                      </span>
                    </div>
                    {tmpl.description && <p className="text-xs mb-3" style={{ color: 'var(--color-text-muted)' }}>{tmpl.description}</p>}
                    <div className="flex items-center justify-between">
                      <span className="font-data text-xs" style={{ color: 'var(--color-text-secondary)' }}>${tmpl.base_salary.toLocaleString()}/mo</span>
                      <button onClick={() => handleHire(tmpl)} disabled={isLoading || !canAfford}
                        className={canAfford ? 'btn-primary text-xs py-2 px-4' : 'btn-secondary text-xs py-2 px-4 opacity-50'}>
                        {isLoading ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : canAfford ? `RECRUIT · $${tmpl.base_salary.toLocaleString()}` : 'INSUFFICIENT FUNDS'}
                      </button>
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        </>
      )}

      {/* Header */}
      <div className="flex items-center justify-between mb-1">
        <div>
          <h1 className="font-display text-xl tracking-wider">PERSONNEL DOSSIERS</h1>
          <p className="text-xs mt-0.5" style={{ color: 'var(--color-text-secondary)' }}>
            <span className="font-data">{contractors.length}</span> active · <span className="font-data" style={{ color: 'var(--color-amber)' }}>${totalSalary.toLocaleString()}/mo</span> payroll
          </p>
        </div>
        <button onClick={() => setShowHire(true)} className="btn-secondary flex items-center gap-1.5 text-xs py-2 px-3">
          <Plus className="w-4 h-4" /> RECRUIT
        </button>
      </div>

      <div className="divider" />

      {/* Contractor list */}
      {contractors.length === 0 ? (
        <div className="flex flex-col items-center justify-center py-16 text-center">
          <User className="w-12 h-12 mb-3" style={{ color: 'var(--color-text-muted)' }} />
          <p className="text-sm font-medium" style={{ color: 'var(--color-text-secondary)' }}>No personnel on roster</p>
          <p className="text-xs mt-1 mb-4" style={{ color: 'var(--color-text-muted)' }}>Recruit contractors to staff operations</p>
          <button onClick={() => setShowHire(true)} className="btn-primary text-sm flex items-center gap-2 py-2.5 px-5">
            <Plus className="w-4 h-4" /> BROWSE AVAILABLE
          </button>
        </div>
      ) : (
        <div className="space-y-2.5">
          {contractors.map(contractor => {
            const spec = specColors[contractor.specialization] ?? specColors['operator'];
            const fatigue = fatigueLabel(contractor.fatigue);
            const isExpanded = expandedId === contractor.id;

            return (
              <div key={contractor.id} className="card-dossier overflow-hidden card-press">
                {/* Main row */}
                <button onClick={() => setExpandedId(isExpanded ? null : contractor.id)} className="w-full flex items-center gap-3.5 p-4 text-left">
                  <div className="w-11 h-11 rounded-lg flex items-center justify-center shrink-0" style={{ background: spec.bg }}>
                    <User className="w-5 h-5" style={{ color: spec.color }} />
                  </div>
                  <div className="flex-1 min-w-0">
                    <h3 className="text-sm font-semibold truncate" style={{ color: 'var(--color-text)' }}>{contractor.name}</h3>
                    <div className="flex items-center gap-2 mt-1">
                      <span className="text-xs capitalize font-display tracking-wider" style={{ color: 'var(--color-text-muted)' }}>{contractor.specialization}</span>
                      <span style={{ color: 'var(--color-text-muted)' }}>·</span>
                      <span className="text-xs font-medium" style={{ color: fatigue.color }}>{fatigue.text}</span>
                    </div>
                  </div>
                  <div className="flex items-center gap-3 shrink-0">
                    <div className="text-right">
                      <p className="font-data text-sm font-bold" style={{ color: 'var(--color-text)' }}>{contractor.skill}</p>
                      <p className="text-[10px] font-display tracking-wider" style={{ color: 'var(--color-text-muted)' }}>SKILL</p>
                    </div>
                    {isExpanded ? <ChevronUp className="w-4 h-4" style={{ color: 'var(--color-text-muted)' }} /> : <ChevronDown className="w-4 h-4" style={{ color: 'var(--color-text-muted)' }} />}
                  </div>
                </button>

                {/* Fatigue bar */}
                <div className="px-4 pb-3 -mt-1">
                  <div className="flex items-center gap-2">
                    <Battery className="w-3 h-3" style={{ color: 'var(--color-text-muted)' }} />
                    <div className="flex-1 gauge-bar" style={{ height: '4px' }}>
                      <div className={`gauge-fill ${fatigueBg(contractor.fatigue)}`} style={{ width: `${contractor.fatigue}%` }} />
                    </div>
                    <span className="font-data text-[10px]" style={{ color: 'var(--color-text-muted)' }}>{contractor.fatigue}%</span>
                  </div>
                </div>

                {/* Expanded */}
                {isExpanded && (
                  <div className="px-4 pb-4 pt-3 space-y-3" style={{ borderTop: '1px solid var(--color-border)' }}>
                    <div className="flex gap-3">
                      <div className="flex-1 rounded-lg p-3" style={{ background: 'var(--color-surface-raised)' }}>
                        <p className="text-[10px] font-display tracking-wider" style={{ color: 'var(--color-text-muted)' }}>SKILL LEVEL</p>
                        <div className="flex items-center gap-1.5 mt-0.5">
                          <Zap className="w-3.5 h-3.5" style={{ color: 'var(--color-amber)' }} />
                          <p className="font-data text-sm font-bold" style={{ color: 'var(--color-text)' }}>{contractor.skill}/100</p>
                        </div>
                      </div>
                      <div className="flex-1 rounded-lg p-3" style={{ background: 'var(--color-surface-raised)' }}>
                        <p className="text-[10px] font-display tracking-wider" style={{ color: 'var(--color-text-muted)' }}>SALARY</p>
                        <p className="font-data text-sm font-bold mt-0.5" style={{ color: 'var(--color-text)' }}>${contractor.salary.toLocaleString()}/mo</p>
                      </div>
                    </div>

                    {contractor.fatigue > 50 && (
                      <div className="flex items-center gap-2 rounded-lg px-3 py-2.5" style={{ background: 'rgba(212,168,67,0.08)', border: '1px solid rgba(212,168,67,0.2)' }}>
                        <AlertCircle className="w-4 h-4 shrink-0" style={{ color: 'var(--color-amber)' }} />
                        <p className="text-xs" style={{ color: 'var(--color-amber)' }}>
                          High fatigue reduces mission effectiveness. Consider resting.
                        </p>
                      </div>
                    )}

                    <div className="flex gap-2">
                      <button onClick={e => { e.stopPropagation(); handleRest(contractor.id); }}
                        disabled={actionLoading === contractor.id || contractor.fatigue === 0}
                        className="btn-secondary flex-1 flex items-center justify-center gap-1.5 text-sm py-2.5">
                        {actionLoading === contractor.id ? <Loader2 className="w-4 h-4 animate-spin" /> : <BedDouble className="w-4 h-4" />}
                        REST
                      </button>
                      <button onClick={e => { e.stopPropagation(); handleDismiss(contractor.id); }}
                        disabled={actionLoading === contractor.id}
                        className="btn-danger flex items-center justify-center gap-1.5 text-sm py-2.5 px-4">
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
