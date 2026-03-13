import { useState, useEffect } from 'react';
import {
  DollarSign,
  Shield,
  Cpu,
  Plane,
  FileText,
  Users,
  TrendingUp,
  ChevronRight,
  Trophy,
  Skull,
} from 'lucide-react';
import { Link } from 'react-router-dom';
import { apiService } from '../../services/api';

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
    balance: 0,
    monthlyProfit: 0,
    reputation: 0,
    techLevel: 0,
    totalAssets: 0,
    activeContracts: 0,
    totalContractors: 0,
  });
  const [missionLogs, setMissionLogs] = useState<MissionLogEntry[]>([]);
  const [missionTemplateNames, setMissionTemplateNames] = useState<Record<number, string>>({});
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const fetchDashboardData = async () => {
      try {
        setLoading(true);
        const [userRes, unitsRes, contractsRes, contractorsRes, logsRes, templatesRes] = await Promise.all([
          apiService.getUser(1),
          apiService.getOwnedUnits(),
          apiService.getActiveContracts(),
          apiService.getOwnedContractors(),
          apiService.getMissionHistory(1),
          apiService.getMissionTemplates(),
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
          balance: user.balance,
          monthlyProfit: 2500,
          reputation: user.reputation,
          techLevel: user.tech_level,
          totalAssets: units.length,
          activeContracts: active.length,
          totalContractors: contractors.length,
        });
      } catch {
        setStats({
          balance: 10000,
          monthlyProfit: 2500,
          reputation: 75,
          techLevel: 3,
          totalAssets: 5,
          activeContracts: 2,
          totalContractors: 4,
        });
      } finally {
        setLoading(false);
      }
    };

    fetchDashboardData();
  }, []);

  if (loading) {
    return (
      <div className="flex items-center justify-center h-full">
        <div className="flex flex-col items-center gap-3">
          <div className="w-8 h-8 border-2 border-emerald-500 border-t-transparent rounded-full animate-spin" />
          <p className="text-sm text-gray-500">Loading HQ...</p>
        </div>
      </div>
    );
  }

  const statCards = [
    {
      label: 'Balance',
      value: `$${stats.balance.toLocaleString()}`,
      sub: `+$${stats.monthlyProfit.toLocaleString()}/mo`,
      subColor: 'text-emerald-400',
      icon: DollarSign,
      iconBg: 'bg-emerald-500/15',
      iconColor: 'text-emerald-400',
    },
    {
      label: 'Reputation',
      value: `${stats.reputation}%`,
      sub: 'Faction standing',
      subColor: 'text-gray-500',
      icon: Shield,
      iconBg: 'bg-blue-500/15',
      iconColor: 'text-blue-400',
    },
    {
      label: 'Tech Level',
      value: stats.techLevel.toString(),
      sub: 'Research tier',
      subColor: 'text-gray-500',
      icon: Cpu,
      iconBg: 'bg-violet-500/15',
      iconColor: 'text-violet-400',
    },
  ];

  const quickStats = [
    { label: 'Units', value: stats.totalAssets, icon: Plane, link: '/hangar' },
    { label: 'Active Ops', value: stats.activeContracts, icon: FileText, link: '/contracts' },
    { label: 'Personnel', value: stats.totalContractors, icon: Users, link: '/hangar' },
  ];

  return (
    <div className="px-4 py-5 lg:px-8 lg:py-6 max-w-4xl mx-auto">
      <div className="mb-6">
        <h1 className="text-xl font-bold text-white lg:text-2xl">Command Center</h1>
        <p className="text-sm text-gray-500 mt-0.5">War room overview</p>
      </div>

      {/* Primary stat cards */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 mb-5">
        {statCards.map((card) => (
          <div key={card.label} className="bg-gray-900 rounded-2xl p-4 border border-gray-800/60">
            <div className="flex items-center gap-3 mb-3">
              <div className={`w-9 h-9 rounded-xl ${card.iconBg} flex items-center justify-center`}>
                <card.icon className={`w-4.5 h-4.5 ${card.iconColor}`} />
              </div>
              <span className="text-xs font-medium text-gray-500 uppercase tracking-wider">{card.label}</span>
            </div>
            <div className="text-2xl font-bold text-white tracking-tight">{card.value}</div>
            <div className={`text-xs mt-1 ${card.subColor}`}>{card.sub}</div>
          </div>
        ))}
      </div>

      {/* Quick stats */}
      <div className="grid grid-cols-3 gap-2.5 mb-5">
        {quickStats.map((item) => (
          <Link
            key={item.label}
            to={item.link}
            className="bg-gray-900 rounded-xl p-3.5 border border-gray-800/60 card-press flex flex-col items-center gap-1.5 text-center"
          >
            <item.icon className="w-5 h-5 text-gray-400" />
            <span className="text-lg font-bold text-white">{item.value}</span>
            <span className="text-[11px] text-gray-500 font-medium">{item.label}</span>
          </Link>
        ))}
      </div>

      {/* Quick actions */}
      <div className="grid grid-cols-2 gap-2.5 mb-5">
        <Link
          to="/contracts"
          className="bg-emerald-500/10 border border-emerald-500/20 rounded-xl p-4 card-press flex items-center gap-3"
        >
          <div className="w-10 h-10 rounded-xl bg-emerald-500/20 flex items-center justify-center shrink-0">
            <FileText className="w-5 h-5 text-emerald-400" />
          </div>
          <div className="min-w-0">
            <p className="text-sm font-semibold text-emerald-400">Browse Ops</p>
            <p className="text-xs text-emerald-400/60 truncate">Find missions</p>
          </div>
        </Link>
        <Link
          to="/hangar"
          className="bg-blue-500/10 border border-blue-500/20 rounded-xl p-4 card-press flex items-center gap-3"
        >
          <div className="w-10 h-10 rounded-xl bg-blue-500/20 flex items-center justify-center shrink-0">
            <Plane className="w-5 h-5 text-blue-400" />
          </div>
          <div className="min-w-0">
            <p className="text-sm font-semibold text-blue-400">Manage Fleet</p>
            <p className="text-xs text-blue-400/60 truncate">Units & crew</p>
          </div>
        </Link>
      </div>

      {/* Mission History / Recent Activity */}
      <div className="bg-gray-900 rounded-2xl border border-gray-800/60 overflow-hidden">
        <div className="flex items-center justify-between px-4 py-3 border-b border-gray-800/60">
          <div className="flex items-center gap-2">
            <TrendingUp className="w-4 h-4 text-gray-500" />
            <h2 className="text-sm font-semibold text-gray-300">Mission History</h2>
          </div>
          <Link to="/contracts" className="text-xs text-emerald-400 font-medium">View all</Link>
        </div>
        <div className="divide-y divide-gray-800/40">
          {missionLogs.length === 0 ? (
            <div className="px-4 py-8 text-center">
              <p className="text-sm text-gray-600">No missions completed yet</p>
              <Link to="/contracts" className="text-xs text-emerald-400 font-medium mt-1 inline-block">Accept your first mission</Link>
            </div>
          ) : (
            missionLogs.map((log) => {
              const isSuccess = log.status === 'completed_success';
              return (
                <div key={log.id} className="flex items-center gap-3 px-4 py-3">
                  <div className={`w-8 h-8 rounded-lg flex items-center justify-center shrink-0 ${
                    isSuccess ? 'bg-emerald-500/15' : 'bg-red-500/15'
                  }`}>
                    {isSuccess
                      ? <Trophy className="w-4 h-4 text-emerald-400" />
                      : <Skull className="w-4 h-4 text-red-400" />
                    }
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="text-sm text-gray-300 truncate">
                      {missionTemplateNames[log.mission_template_id] ?? `Mission #${log.mission_template_id}`}
                    </p>
                    <p className="text-xs text-gray-600">
                      {isSuccess ? 'Success' : 'Failed'} · ${log.payout_earned.toLocaleString()} earned
                    </p>
                  </div>
                  <ChevronRight className="w-3.5 h-3.5 text-gray-700 shrink-0" />
                </div>
              );
            })
          )}
        </div>
      </div>
    </div>
  );
};
