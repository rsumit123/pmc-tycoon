import { useState, useEffect } from 'react';
import {
  DollarSign,
  Shield,
  Cpu,
  Plane,
  FileText,
  Users,
  ChevronRight,
  Trophy,
  Skull,
} from 'lucide-react';
import { Link } from 'react-router-dom';
import { apiService } from '../../services/api';
import '../../styles/design-system.css';

interface MissionLogEntry {
  id: number;
  mission_template_id: number;
  status: string;
  payout_earned: number;
  reputation_change: number;
  ended_at: string;
}

export const Dashboard = () => {
  const [stats, setStats] = useState({
    balance: 0, monthlyProfit: 0, reputation: 0, techLevel: 0,
    totalAssets: 0, activeContracts: 0, totalContractors: 0,
  });
  const [missionLogs, setMissionLogs] = useState<MissionLogEntry[]>([]);
  const [missionTemplateNames, setMissionTemplateNames] = useState<Record<number, string>>({});
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const fetchDashboardData = async () => {
      try {
        setLoading(true);
        const [userRes, unitsRes, contractsRes, contractorsRes, logsRes, templatesRes] = await Promise.all([
          apiService.getUser(1), apiService.getOwnedUnits(), apiService.getActiveContracts(),
          apiService.getOwnedContractors(), apiService.getMissionHistory(1), apiService.getMissionTemplates(),
        ]);
        const user = userRes.data;
        const units = Array.isArray(unitsRes.data) ? unitsRes.data : [];
        const contracts = Array.isArray(contractsRes.data) ? contractsRes.data : [];
        const contractors = Array.isArray(contractorsRes.data) ? contractorsRes.data : [];
        const logs: MissionLogEntry[] = Array.isArray(logsRes.data) ? logsRes.data : [];
        const templates = Array.isArray(templatesRes.data) ? templatesRes.data : [];
        const active = contracts.filter((c: any) => c.status === 'active');
        const nameMap: Record<number, string> = {};
        templates.forEach((t: any) => { nameMap[t.id] = t.title; });
        setMissionTemplateNames(nameMap);
        setMissionLogs(logs.slice(0, 5));
        setStats({
          balance: user.balance, monthlyProfit: 2500, reputation: user.reputation,
          techLevel: user.tech_level, totalAssets: units.length,
          activeContracts: active.length, totalContractors: contractors.length,
        });
      } catch {
        setStats({ balance: 10000, monthlyProfit: 2500, reputation: 75, techLevel: 3, totalAssets: 5, activeContracts: 2, totalContractors: 4 });
      } finally { setLoading(false); }
    };
    fetchDashboardData();
  }, []);

  if (loading) return (
    <div className="flex items-center justify-center h-full">
      <div className="flex flex-col items-center gap-3">
        <div className="w-6 h-6 border-2 border-t-transparent rounded-full animate-spin" style={{ borderColor: 'var(--color-amber)', borderTopColor: 'transparent' }} />
        <p className="text-sm" style={{ color: 'var(--color-text-muted)' }}>Loading briefing...</p>
      </div>
    </div>
  );

  // Rank calculation
  const rep = stats.reputation;
  const rank = rep >= 80 ? 'LEGENDARY' : rep >= 60 ? 'ELITE' : rep >= 40 ? 'ESTABLISHED' : rep >= 20 ? 'LICENSED' : 'STARTUP';
  const rankClass = rep >= 80 ? 'rank-legendary' : rep >= 60 ? 'rank-elite' : rep >= 40 ? 'rank-established' : rep >= 20 ? 'rank-licensed' : 'rank-startup';
  const nextRank = rep >= 80 ? null : rep >= 60 ? 'LEGENDARY' : rep >= 40 ? 'ELITE' : rep >= 20 ? 'ESTABLISHED' : 'LICENSED';
  const nextThreshold = rep >= 80 ? 100 : rep >= 60 ? 80 : rep >= 40 ? 60 : rep >= 20 ? 40 : 20;
  const prevThreshold = rep >= 80 ? 80 : rep >= 60 ? 60 : rep >= 40 ? 40 : rep >= 20 ? 20 : 0;
  const rankProgress = nextThreshold > prevThreshold ? ((rep - prevThreshold) / (nextThreshold - prevThreshold)) * 100 : 100;

  return (
    <div className="px-4 py-5 lg:px-8 lg:py-6 max-w-4xl mx-auto" style={{ color: 'var(--color-text)' }}>
      {/* Header */}
      <div className="flex items-center justify-between mb-1">
        <div>
          <h1 className="font-display text-xl tracking-wider">COMMAND BRIEFING</h1>
          <p className="font-data text-xs mt-0.5" style={{ color: 'var(--color-text-muted)' }}>
            {new Date().toLocaleDateString('en-US', { day: '2-digit', month: 'short', year: 'numeric' }).toUpperCase()}
          </p>
        </div>
        <span className="stamp stamp-confidential text-[9px]">CLASSIFIED</span>
      </div>

      <div className="divider" />

      {/* Primary stat cards */}
      <div className="grid grid-cols-3 gap-2.5 mb-4">
        <div className="card-dossier p-3.5">
          <div className="flex items-center gap-2 mb-2">
            <DollarSign className="w-4 h-4" style={{ color: 'var(--color-green)' }} />
            <span className="label-section" style={{ margin: 0 }}>TREASURY</span>
          </div>
          <div className="font-data text-xl font-bold" style={{ color: 'var(--color-text)' }}>${stats.balance.toLocaleString()}</div>
          <div className="font-data text-[11px] mt-0.5" style={{ color: 'var(--color-green)' }}>+${stats.monthlyProfit.toLocaleString()}/mo</div>
        </div>
        <div className="card-dossier p-3.5">
          <div className="flex items-center gap-2 mb-2">
            <Shield className="w-4 h-4" style={{ color: 'var(--color-blue)' }} />
            <span className="label-section" style={{ margin: 0 }}>STANDING</span>
          </div>
          <div className="font-data text-xl font-bold" style={{ color: 'var(--color-text)' }}>{stats.reputation}%</div>
          <div className="gauge-bar mt-1.5" style={{ height: '4px' }}>
            <div className="gauge-fill gauge-fill-amber" style={{ width: `${stats.reputation}%` }} />
          </div>
        </div>
        <div className="card-dossier p-3.5">
          <div className="flex items-center gap-2 mb-2">
            <Cpu className="w-4 h-4" style={{ color: 'var(--color-amber)' }} />
            <span className="label-section" style={{ margin: 0 }}>TECH</span>
          </div>
          <div className="font-data text-xl font-bold" style={{ color: 'var(--color-text)' }}>TIER {stats.techLevel}</div>
          <div className="flex gap-0.5 mt-1.5">
            {[1,2,3,4,5].map(i => (
              <div key={i} className="h-1.5 flex-1 rounded-sm" style={{ background: i <= stats.techLevel ? 'var(--color-amber)' : 'var(--color-border)' }} />
            ))}
          </div>
        </div>
      </div>

      {/* PMC Rank */}
      <div className="card-dossier-tab p-4 mb-4">
        <div className="flex items-center justify-between mb-2">
          <span className="label-section" style={{ margin: 0 }}>PMC RANK</span>
          <span className={`rank-badge ${rankClass}`}>{rank}</span>
        </div>
        <div className="gauge-bar mb-1.5">
          <div className="gauge-fill gauge-fill-amber" style={{ width: `${rankProgress}%` }} />
        </div>
        <div className="flex items-center justify-between">
          <span className="font-data text-[11px]" style={{ color: 'var(--color-text-muted)' }}>{stats.reputation}/{nextThreshold} REP</span>
          {nextRank && <span className="text-[11px]" style={{ color: 'var(--color-text-muted)' }}>Next: <span style={{ color: 'var(--color-amber)' }}>{nextRank}</span></span>}
        </div>
      </div>

      {/* Quick stats + actions */}
      <div className="grid grid-cols-3 gap-2.5 mb-4">
        {[
          { label: 'AIRCRAFT', value: stats.totalAssets, icon: Plane, link: '/hangar' },
          { label: 'ACTIVE OPS', value: stats.activeContracts, icon: FileText, link: '/contracts' },
          { label: 'PERSONNEL', value: stats.totalContractors, icon: Users, link: '/personnel' },
        ].map(item => (
          <Link key={item.label} to={item.link} className="card-dossier p-3 card-press flex flex-col items-center gap-1.5 text-center">
            <item.icon className="w-5 h-5" style={{ color: 'var(--color-text-secondary)' }} />
            <span className="font-data text-lg font-bold" style={{ color: 'var(--color-text)' }}>{item.value}</span>
            <span className="text-[10px] font-display tracking-wider" style={{ color: 'var(--color-text-muted)' }}>{item.label}</span>
          </Link>
        ))}
      </div>

      {/* Quick actions */}
      <div className="grid grid-cols-2 gap-2.5 mb-4">
        <Link to="/contracts" className="card-dossier p-3.5 card-press flex items-center gap-3" style={{ borderColor: 'var(--color-amber-dim)', borderLeftWidth: '3px' }}>
          <FileText className="w-5 h-5 shrink-0" style={{ color: 'var(--color-amber)' }} />
          <div>
            <p className="text-sm font-display tracking-wider" style={{ color: 'var(--color-amber)' }}>BROWSE OPS</p>
            <p className="text-xs" style={{ color: 'var(--color-text-muted)' }}>Find missions</p>
          </div>
        </Link>
        <Link to="/hangar" className="card-dossier p-3.5 card-press flex items-center gap-3" style={{ borderColor: 'var(--color-blue-dim)', borderLeftWidth: '3px' }}>
          <Plane className="w-5 h-5 shrink-0" style={{ color: 'var(--color-blue)' }} />
          <div>
            <p className="text-sm font-display tracking-wider" style={{ color: 'var(--color-blue)' }}>MANAGE FLEET</p>
            <p className="text-xs" style={{ color: 'var(--color-text-muted)' }}>Equipment dossier</p>
          </div>
        </Link>
      </div>

      {/* Mission History */}
      <div className="card-dossier overflow-hidden">
        <div className="flex items-center justify-between px-4 py-3" style={{ borderBottom: '1px solid var(--color-border)' }}>
          <span className="label-section" style={{ margin: 0 }}>RECENT INTEL</span>
          <Link to="/contracts" className="text-xs font-display tracking-wider" style={{ color: 'var(--color-amber)' }}>VIEW ALL</Link>
        </div>
        <div>
          {missionLogs.length === 0 ? (
            <div className="px-4 py-8 text-center">
              <p className="text-sm" style={{ color: 'var(--color-text-muted)' }}>No missions completed yet</p>
              <Link to="/contracts" className="text-xs font-display tracking-wider mt-1 inline-block" style={{ color: 'var(--color-amber)' }}>ACCEPT YOUR FIRST MISSION</Link>
            </div>
          ) : (
            missionLogs.map((log, i) => {
              const isSuccess = log.status === 'completed_success';
              return (
                <div key={log.id} className="flex items-center gap-3 px-4 py-3" style={{ borderBottom: i < missionLogs.length - 1 ? '1px solid var(--color-border-subtle)' : 'none' }}>
                  <div className="w-8 h-8 rounded-lg flex items-center justify-center shrink-0"
                    style={{ background: isSuccess ? 'rgba(92,138,77,0.15)' : 'rgba(196,69,60,0.15)' }}>
                    {isSuccess
                      ? <Trophy className="w-4 h-4" style={{ color: 'var(--color-green)' }} />
                      : <Skull className="w-4 h-4" style={{ color: 'var(--color-red)' }} />
                    }
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="text-sm truncate" style={{ color: 'var(--color-text)' }}>
                      {missionTemplateNames[log.mission_template_id] ?? `Mission #${log.mission_template_id}`}
                    </p>
                    <p className="font-data text-[11px]" style={{ color: 'var(--color-text-muted)' }}>
                      {isSuccess ? 'Success' : 'Failed'} · ${log.payout_earned.toLocaleString()}
                    </p>
                  </div>
                  <ChevronRight className="w-3.5 h-3.5 shrink-0" style={{ color: 'var(--color-text-muted)' }} />
                </div>
              );
            })
          )}
        </div>
      </div>
    </div>
  );
};
