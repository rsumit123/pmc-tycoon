import { useState } from 'react';
import {
  FlaskConical,
  Zap,
  Lock,
  CheckCircle,
  ChevronRight,
  Sparkles,
} from 'lucide-react';

interface Research {
  id: number;
  name: string;
  description: string;
  cost: number;
  category: string;
  benefits: string[];
  prerequisite: number | null;
}

interface CompletedResearch {
  id: number;
  name: string;
  category: string;
  completedAt: string;
}

const categoryStyle: Record<string, { bg: string; text: string; icon: string }> = {
  Stealth: { bg: 'bg-violet-500/15', text: 'text-violet-400', icon: '🛡' },
  Performance: { bg: 'bg-cyan-500/15', text: 'text-cyan-400', icon: '⚡' },
  Combat: { bg: 'bg-red-500/15', text: 'text-red-400', icon: '🎯' },
  Defense: { bg: 'bg-amber-500/15', text: 'text-amber-400', icon: '🔒' },
  Maintenance: { bg: 'bg-emerald-500/15', text: 'text-emerald-400', icon: '🔧' },
};

export const RAndD = () => {
  const [researchPoints, setResearchPoints] = useState(150);

  const [availableResearch, setAvailableResearch] = useState<Research[]>([
    {
      id: 1,
      name: 'Stealth Coating',
      description: 'Reduces unit detection by enemy radar systems',
      cost: 100,
      category: 'Stealth',
      benefits: ['-20% enemy detection range', '+15% survivability'],
      prerequisite: null,
    },
    {
      id: 2,
      name: 'Fuel Efficiency',
      description: 'Improves engine performance and operational range',
      cost: 150,
      category: 'Performance',
      benefits: ['+25% unit range', '-10% fuel consumption'],
      prerequisite: null,
    },
    {
      id: 3,
      name: 'Advanced Targeting',
      description: 'Enhances weapon accuracy and target tracking',
      cost: 200,
      category: 'Combat',
      benefits: ['+30% weapon accuracy', '+15% critical hit chance'],
      prerequisite: 1,
    },
    {
      id: 4,
      name: 'Reinforced Armor',
      description: 'Increases unit durability and hull integrity',
      cost: 180,
      category: 'Defense',
      benefits: ['+40% unit defense', '+20% hull integrity'],
      prerequisite: 2,
    },
  ]);

  const [completedResearch, setCompletedResearch] = useState<CompletedResearch[]>([
    {
      id: 0,
      name: 'Basic Maintenance Protocols',
      category: 'Maintenance',
      completedAt: '2026-03-10',
    },
  ]);

  const canAfford = (cost: number) => researchPoints >= cost;
  const hasPrereq = (prereqId: number | null) => {
    if (prereqId === null) return true;
    return completedResearch.some((r) => r.id === prereqId);
  };

  const handleResearch = (id: number) => {
    const research = availableResearch.find((r) => r.id === id);
    if (!research || !canAfford(research.cost) || !hasPrereq(research.prerequisite)) return;

    setResearchPoints((p) => p - research.cost);
    setCompletedResearch((prev) => [
      ...prev,
      { id: research.id, name: research.name, category: research.category, completedAt: new Date().toISOString().split('T')[0] },
    ]);
    setAvailableResearch((prev) => prev.filter((r) => r.id !== id));
  };

  return (
    <div className="px-4 py-5 lg:px-8 lg:py-6 max-w-4xl mx-auto">
      {/* Header */}
      <div className="mb-5">
        <h1 className="text-xl font-bold text-white lg:text-2xl">Research & Development</h1>
        <p className="text-sm text-gray-500 mt-0.5">Advance your technological capabilities</p>
      </div>

      {/* Research points banner */}
      <div className="bg-gray-900 rounded-2xl border border-gray-800/60 p-4 mb-5">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="w-11 h-11 rounded-xl bg-emerald-500/15 flex items-center justify-center">
              <FlaskConical className="w-5 h-5 text-emerald-400" />
            </div>
            <div>
              <p className="text-xs text-gray-500 uppercase tracking-wider">Research Points</p>
              <p className="text-2xl font-bold text-white">{researchPoints} <span className="text-sm text-gray-500 font-normal">RP</span></p>
            </div>
          </div>
          <div className="flex items-center gap-4 text-xs text-gray-500">
            <div className="text-center">
              <p className="text-lg font-bold text-white">{completedResearch.length}</p>
              <p>Complete</p>
            </div>
            <div className="text-center">
              <p className="text-lg font-bold text-white">{availableResearch.length}</p>
              <p>Available</p>
            </div>
          </div>
        </div>
      </div>

      {/* Available research */}
      <div className="mb-6">
        <div className="flex items-center gap-2 mb-3">
          <Sparkles className="w-4 h-4 text-gray-500" />
          <h2 className="text-sm font-semibold text-gray-400 uppercase tracking-wider">Available Research</h2>
        </div>

        <div className="space-y-3">
          {availableResearch.map((research) => {
            const style = categoryStyle[research.category] ?? categoryStyle['Maintenance'];
            const affordable = canAfford(research.cost);
            const prereqMet = hasPrereq(research.prerequisite);
            const locked = !prereqMet;
            const disabled = !affordable || locked;

            return (
              <div
                key={research.id}
                className={`bg-gray-900 rounded-2xl border border-gray-800/60 overflow-hidden ${disabled ? 'opacity-60' : ''}`}
              >
                <div className="p-4">
                  {/* Category + cost */}
                  <div className="flex items-center justify-between mb-2.5">
                    <span className={`text-[10px] font-bold uppercase tracking-wider px-2 py-0.5 rounded-md ${style.bg} ${style.text}`}>
                      {style.icon} {research.category}
                    </span>
                    <div className="flex items-center gap-1.5">
                      {locked && <Lock className="w-3 h-3 text-gray-600" />}
                      <span className={`text-xs font-bold ${affordable ? 'text-emerald-400' : 'text-red-400'}`}>
                        {research.cost} RP
                      </span>
                    </div>
                  </div>

                  {/* Name + description */}
                  <h3 className="text-base font-bold text-white mb-1">{research.name}</h3>
                  <p className="text-xs text-gray-500 mb-3">{research.description}</p>

                  {/* Benefits */}
                  <div className="space-y-1.5 mb-4">
                    {research.benefits.map((benefit, i) => (
                      <div key={i} className="flex items-center gap-2">
                        <Zap className="w-3 h-3 text-emerald-400 shrink-0" />
                        <span className="text-xs text-gray-300">{benefit}</span>
                      </div>
                    ))}
                  </div>

                  {/* Prerequisite warning */}
                  {locked && (
                    <div className="flex items-center gap-2 bg-gray-800/50 rounded-xl px-3 py-2 mb-3">
                      <Lock className="w-3.5 h-3.5 text-gray-500 shrink-0" />
                      <p className="text-xs text-gray-500">
                        Requires: {availableResearch.find((r) => r.id === research.prerequisite)?.name ?? 'Unknown'}
                      </p>
                    </div>
                  )}

                  {/* Action */}
                  <button
                    onClick={() => handleResearch(research.id)}
                    disabled={disabled}
                    className={`
                      w-full flex items-center justify-center gap-2 font-semibold text-sm py-3 rounded-xl transition-colors
                      ${disabled
                        ? 'bg-gray-800 text-gray-600 cursor-not-allowed'
                        : 'bg-emerald-500 text-white active:bg-emerald-600'
                      }
                    `}
                  >
                    {locked ? (
                      <>
                        <Lock className="w-4 h-4" />
                        Locked
                      </>
                    ) : (
                      <>
                        <FlaskConical className="w-4 h-4" />
                        Research ({research.cost} RP)
                      </>
                    )}
                  </button>
                </div>
              </div>
            );
          })}
        </div>
      </div>

      {/* Completed research */}
      <div>
        <div className="flex items-center gap-2 mb-3">
          <CheckCircle className="w-4 h-4 text-gray-500" />
          <h2 className="text-sm font-semibold text-gray-400 uppercase tracking-wider">Completed</h2>
        </div>

        {completedResearch.length === 0 ? (
          <div className="text-center py-8">
            <p className="text-sm text-gray-600">No research completed yet</p>
          </div>
        ) : (
          <div className="space-y-2">
            {completedResearch.map((research) => {
              const style = categoryStyle[research.category] ?? categoryStyle['Maintenance'];
              return (
                <div
                  key={research.id}
                  className="bg-gray-900 rounded-xl border border-gray-800/60 p-3.5 flex items-center gap-3"
                >
                  <div className={`w-9 h-9 rounded-lg ${style.bg} flex items-center justify-center shrink-0`}>
                    <CheckCircle className={`w-4 h-4 ${style.text}`} />
                  </div>
                  <div className="flex-1 min-w-0">
                    <h3 className="text-sm font-semibold text-white truncate">{research.name}</h3>
                    <p className="text-xs text-gray-500">{research.category} · {research.completedAt}</p>
                  </div>
                  <ChevronRight className="w-4 h-4 text-gray-700 shrink-0" />
                </div>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
};
