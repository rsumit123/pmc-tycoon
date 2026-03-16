import { useState, useEffect, useCallback } from 'react';
import {
  FlaskConical,
  Zap,
  Lock,
  CheckCircle,
  Loader2,
  Clock,
  Play,
  Check,
} from 'lucide-react';
import { apiService } from '../../services/api';
import '../../styles/design-system.css';

interface ResearchItemData {
  id: number;
  name: string;
  description: string | null;
  branch: string;
  tier: number;
  cost_money: number;
  cost_rp: number;
  duration_hours: number;
  prerequisite_id: number | null;
  prerequisite_name: string | null;
  unlocks_module_name: string | null;
  unlocks_module_stats: Record<string, any> | null;
  status: string;
  started_at: string | null;
}

interface ResearchStatus {
  research_points: number;
  tech_level: number;
  completed_count: number;
  in_progress_count: number;
  available_count: number;
}

const branchStyle: Record<string, { color: string; bg: string; icon: string }> = {
  sensors: { color: 'var(--color-blue)', bg: 'rgba(91,139,160,0.15)', icon: '📡' },
  propulsion: { color: 'var(--color-amber)', bg: 'rgba(212,168,67,0.15)', icon: '🔥' },
  ew: { color: '#22d3ee', bg: 'rgba(34,211,238,0.12)', icon: '📴' },
  structures: { color: 'var(--color-green)', bg: 'rgba(92,138,77,0.15)', icon: '🛡' },
  weapons: { color: 'var(--color-red)', bg: 'rgba(196,69,60,0.15)', icon: '🎯' },
};

const branchLabels: Record<string, string> = {
  sensors: 'SENSORS', propulsion: 'PROPULSION', ew: 'ELECTRONIC WARFARE',
  structures: 'STRUCTURES & COUNTERMEASURES', weapons: 'WEAPONS INTEGRATION',
};

const tierBadge = (t: number) => t >= 3 ? 'bg-accent-amber/20 text-accent-amber border-accent-amber/30' :
  t >= 2 ? 'bg-accent-blue/20 text-accent-blue border-accent-blue/30' : 'bg-ink-faint/40 text-ink-secondary border-border';

export const RAndD = () => {
  const [items, setItems] = useState<ResearchItemData[]>([]);
  const [status, setStatus] = useState<ResearchStatus | null>(null);
  const [loading, setLoading] = useState(true);
  const [actionLoading, setActionLoading] = useState<number | null>(null);

  const fetchData = useCallback(async () => {
    try {
      const [itemsRes, statusRes] = await Promise.all([
        apiService.getResearchItems(),
        apiService.getResearchStatus(),
      ]);
      setItems(Array.isArray(itemsRes.data) ? itemsRes.data : []);
      setStatus(statusRes.data);
    } catch {
      setItems([]);
      setStatus({ research_points: 150, tech_level: 1, completed_count: 0, in_progress_count: 0, available_count: 0 });
    } finally { setLoading(false); }
  }, []);

  useEffect(() => { fetchData(); }, [fetchData]);

  const handleStart = async (itemId: number) => {
    setActionLoading(itemId);
    try { await apiService.startResearch(itemId); await fetchData(); }
    catch (err) { console.error('Start research failed:', err); }
    finally { setActionLoading(null); }
  };

  const handleComplete = async (itemId: number) => {
    setActionLoading(itemId);
    try { await apiService.completeResearch(itemId); await fetchData(); }
    catch (err) { console.error('Complete research failed:', err); }
    finally { setActionLoading(null); }
  };

  if (loading) return (
    <div className="flex items-center justify-center h-full">
      <div className="flex flex-col items-center gap-3">
        <Loader2 className="w-6 h-6 animate-spin" style={{ color: 'var(--color-amber)' }} />
        <p className="text-sm" style={{ color: 'var(--color-text-muted)' }}>Loading research data...</p>
      </div>
    </div>
  );

  const branches = Object.keys(branchLabels);
  const groupedByBranch: Record<string, ResearchItemData[]> = {};
  for (const b of branches) groupedByBranch[b] = items.filter(i => i.branch === b);

  const completedItems = items.filter(i => i.status === 'completed');
  const inProgressItems = items.filter(i => i.status === 'in_progress');

  return (
    <div className="px-4 py-5 lg:px-8 lg:py-6 max-w-4xl mx-auto" style={{ color: 'var(--color-text)' }}>
      <div className="flex items-center justify-between mb-1">
        <div>
          <h1 className="font-display text-xl tracking-wider">R&D DIVISION</h1>
          <p className="text-xs mt-0.5" style={{ color: 'var(--color-text-muted)' }}>Advance technological capabilities</p>
        </div>
        <span className="stamp stamp-secret text-[9px]">RESTRICTED</span>
      </div>
      <div className="divider" />

      {/* RP banner */}
      {status && (
        <div className="card-dossier-tab p-4 mb-4">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-3">
              <div className="w-11 h-11 rounded-lg flex items-center justify-center" style={{ background: 'rgba(212,168,67,0.15)' }}>
                <FlaskConical className="w-5 h-5" style={{ color: 'var(--color-amber)' }} />
              </div>
              <div>
                <p className="text-[10px] font-display tracking-wider" style={{ color: 'var(--color-text-muted)' }}>RESEARCH POINTS</p>
                <p className="font-data text-2xl font-bold" style={{ color: 'var(--color-text)' }}>
                  {status.research_points} <span className="text-sm font-normal" style={{ color: 'var(--color-text-muted)' }}>RP</span>
                </p>
              </div>
            </div>
            <div className="flex items-center gap-4 text-center">
              <div>
                <p className="font-data text-lg font-bold" style={{ color: 'var(--color-green)' }}>{status.completed_count}</p>
                <p className="text-[10px] font-display tracking-wider" style={{ color: 'var(--color-text-muted)' }}>DONE</p>
              </div>
              <div>
                <p className="font-data text-lg font-bold" style={{ color: 'var(--color-amber)' }}>{status.in_progress_count}</p>
                <p className="text-[10px] font-display tracking-wider" style={{ color: 'var(--color-text-muted)' }}>ACTIVE</p>
              </div>
              <div>
                <p className="font-data text-lg font-bold" style={{ color: 'var(--color-text)' }}>{status.available_count}</p>
                <p className="text-[10px] font-display tracking-wider" style={{ color: 'var(--color-text-muted)' }}>AVAIL</p>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Active research */}
      {inProgressItems.length > 0 && (
        <div className="mb-4">
          <p className="label-section mb-2">ACTIVE RESEARCH</p>
          {inProgressItems.map(item => {
            const branch = branchStyle[item.branch] || branchStyle.sensors;
            return (
              <div key={item.id} className="card-dossier p-4 mb-2" style={{ borderLeft: `3px solid ${branch.color}` }}>
                <div className="flex items-center justify-between mb-2">
                  <div className="flex items-center gap-2">
                    <span className="text-sm">{branch.icon}</span>
                    <span className="font-display text-xs tracking-wider" style={{ color: branch.color }}>{branchLabels[item.branch]}</span>
                  </div>
                  <span className={`text-[9px] font-bold px-1.5 py-0.5 rounded border font-display ${tierBadge(item.tier)}`}>TIER {item.tier}</span>
                </div>
                <h3 className="text-base font-semibold mb-1" style={{ color: 'var(--color-text)' }}>{item.name}</h3>
                {item.description && <p className="text-xs mb-2" style={{ color: 'var(--color-text-muted)' }}>{item.description}</p>}
                {item.unlocks_module_name && (
                  <div className="flex items-center gap-1.5 mb-3">
                    <Zap className="w-3 h-3" style={{ color: 'var(--color-green)' }} />
                    <span className="text-xs" style={{ color: 'var(--color-green)' }}>Unlocks: {item.unlocks_module_name}</span>
                  </div>
                )}
                <div className="flex items-center gap-2 mb-3">
                  <Clock className="w-3.5 h-3.5" style={{ color: 'var(--color-amber)' }} />
                  <span className="font-data text-xs" style={{ color: 'var(--color-amber)' }}>In progress — {item.duration_hours}h duration</span>
                </div>
                <button onClick={() => handleComplete(item.id)} disabled={actionLoading === item.id}
                  className="btn-primary w-full flex items-center justify-center gap-2 text-sm">
                  {actionLoading === item.id ? <Loader2 className="w-4 h-4 animate-spin" /> : <Check className="w-4 h-4" />}
                  COMPLETE RESEARCH
                </button>
              </div>
            );
          })}
        </div>
      )}

      {/* Tech tree by branch */}
      {branches.map(branch => {
        const branchItems = groupedByBranch[branch];
        if (!branchItems || branchItems.length === 0) return null;
        const style = branchStyle[branch] || branchStyle.sensors;

        return (
          <div key={branch} className="mb-5">
            <div className="flex items-center gap-2 mb-2.5">
              <span>{style.icon}</span>
              <p className="label-section" style={{ margin: 0, color: style.color }}>{branchLabels[branch]}</p>
            </div>
            <div className="space-y-0">
              {branchItems.map((item, idx) => {
                const isCompleted = item.status === 'completed';
                const isInProgress = item.status === 'in_progress';
                const isAvailable = item.status === 'available';
                const isLocked = item.status === 'locked';
                const canAfford = status ? status.research_points >= item.cost_rp : false;

                return (
                  <div key={item.id} className="relative flex gap-3">
                    <div className="flex flex-col items-center w-5 shrink-0">
                      <div className="w-3.5 h-3.5 rounded-full shrink-0 mt-3 flex items-center justify-center" style={{
                        background: isCompleted ? 'var(--color-green)' : isInProgress ? 'var(--color-amber)' : isAvailable ? 'var(--color-text-secondary)' : 'var(--color-border)',
                      }}>
                        {isCompleted && <Check className="w-2 h-2 text-white" />}
                      </div>
                      {idx < branchItems.length - 1 && <div className="w-px flex-1 my-1" style={{ background: 'var(--color-border)' }} />}
                    </div>

                    <div className={`flex-1 mb-2 p-3 rounded-lg ${isLocked ? 'card-redacted' : 'card-dossier'}`} style={isLocked ? { opacity: 0.6 } : {}}>
                      <div className="flex items-center justify-between mb-1">
                        <div className="flex items-center gap-2">
                          <h3 className="text-sm font-semibold" style={{ color: isLocked ? 'var(--color-text-muted)' : 'var(--color-text)' }}>{item.name}</h3>
                          <span className={`text-[8px] font-bold px-1.5 py-0.5 rounded border font-display ${tierBadge(item.tier)}`}>T{item.tier}</span>
                        </div>
                        {!isCompleted && !isInProgress && (
                          <span className="font-data text-xs font-bold" style={{ color: isLocked ? 'var(--color-text-muted)' : canAfford ? 'var(--color-green)' : 'var(--color-red)' }}>
                            {item.cost_rp} RP
                          </span>
                        )}
                        {isCompleted && <CheckCircle className="w-4 h-4" style={{ color: 'var(--color-green)' }} />}
                        {isInProgress && <Clock className="w-4 h-4" style={{ color: 'var(--color-amber)' }} />}
                      </div>

                      {item.description && !isLocked && <p className="text-xs mb-1.5" style={{ color: 'var(--color-text-muted)' }}>{item.description}</p>}

                      {item.unlocks_module_name && !isLocked && (
                        <div className="flex items-center gap-1.5 mb-1.5">
                          <Zap className="w-3 h-3" style={{ color: 'var(--color-green)' }} />
                          <span className="text-[11px]" style={{ color: 'var(--color-green)' }}>Unlocks: {item.unlocks_module_name}</span>
                        </div>
                      )}

                      {!isCompleted && !isInProgress && !isLocked && (
                        <p className="font-data text-[11px] mb-2" style={{ color: 'var(--color-text-muted)' }}>
                          {item.cost_rp} RP + ${item.cost_money.toLocaleString()} · {item.duration_hours}h
                        </p>
                      )}

                      {isLocked && item.prerequisite_name && (
                        <div className="flex items-center gap-1.5 mt-1">
                          <Lock className="w-3 h-3" style={{ color: 'var(--color-text-muted)' }} />
                          <span className="text-[11px]" style={{ color: 'var(--color-text-muted)' }}>Requires: {item.prerequisite_name}</span>
                        </div>
                      )}

                      {isAvailable && (
                        <button onClick={() => handleStart(item.id)}
                          disabled={actionLoading === item.id || !canAfford}
                          className="btn-primary w-full flex items-center justify-center gap-2 text-xs mt-2 py-2">
                          {actionLoading === item.id ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Play className="w-3.5 h-3.5" />}
                          BEGIN RESEARCH ({item.cost_rp} RP + ${item.cost_money.toLocaleString()})
                        </button>
                      )}
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        );
      })}

      {/* Completed */}
      {completedItems.length > 0 && (
        <div>
          <p className="label-section mb-2">COMPLETED RESEARCH</p>
          <div className="space-y-1.5">
            {completedItems.map(item => (
              <div key={item.id} className="card-dossier p-3 flex items-center gap-3">
                <CheckCircle className="w-4 h-4 shrink-0" style={{ color: 'var(--color-green)' }} />
                <div className="flex-1 min-w-0">
                  <h3 className="text-sm font-semibold truncate" style={{ color: 'var(--color-text)' }}>{item.name}</h3>
                  <p className="text-[11px]" style={{ color: 'var(--color-text-muted)' }}>
                    {branchLabels[item.branch]} · Tier {item.tier}
                    {item.unlocks_module_name && <> · Unlocked: <span style={{ color: 'var(--color-green)' }}>{item.unlocks_module_name}</span></>}
                  </p>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
};
