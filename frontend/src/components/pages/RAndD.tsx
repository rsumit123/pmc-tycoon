import { useState } from 'react';
import {
  FlaskConical,
  Zap,
  Lock,
  CheckCircle,
  ChevronRight,
  Sparkles,
} from 'lucide-react';
import '../../styles/design-system.css';

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
  Stealth: { bg: 'bg-[var(--color-blue)]/15', text: 'text-[var(--color-blue)]', icon: '🛡' },
  Performance: { bg: 'bg-[var(--color-blue)]/15', text: 'text-[var(--color-blue)]', icon: '⚡' },
  Combat: { bg: 'bg-[var(--color-red)]/15', text: 'text-[var(--color-red)]', icon: '🎯' },
  Defense: { bg: 'bg-[var(--color-amber)]/15', text: 'text-[var(--color-amber)]', icon: '🔒' },
  Maintenance: { bg: 'bg-[var(--color-green)]/15', text: 'text-[var(--color-green)]', icon: '🔧' },
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
      <div className="mb-5 flex items-center justify-between">
        <div>
          <h1 className="font-display text-xl lg:text-2xl" style={{ color: 'var(--color-text)' }}>R&D Division</h1>
          <p className="text-sm mt-0.5" style={{ color: 'var(--color-text-muted)' }}>Advance your technological capabilities</p>
        </div>
        <span className="stamp stamp-secret text-xs">Restricted</span>
      </div>

      {/* Research points banner */}
      <div className="card-dossier-tab p-4 mb-5">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="w-11 h-11 rounded-xl flex items-center justify-center" style={{ background: 'rgba(212,168,67,0.15)' }}>
              <FlaskConical className="w-5 h-5" style={{ color: 'var(--color-amber)' }} />
            </div>
            <div>
              <p className="label-section">Research Points</p>
              <p className="font-data text-2xl font-bold" style={{ color: 'var(--color-text)' }}>{researchPoints} <span className="text-sm font-normal" style={{ color: 'var(--color-text-muted)' }}>RP</span></p>
            </div>
          </div>
          <div className="flex items-center gap-4 text-xs" style={{ color: 'var(--color-text-muted)' }}>
            <div className="text-center">
              <p className="font-data text-lg font-bold" style={{ color: 'var(--color-text)' }}>{completedResearch.length}</p>
              <p>Complete</p>
            </div>
            <div className="text-center">
              <p className="font-data text-lg font-bold" style={{ color: 'var(--color-text)' }}>{availableResearch.length}</p>
              <p>Available</p>
            </div>
          </div>
        </div>
      </div>

      {/* Available research */}
      <div className="mb-6">
        <div className="flex items-center gap-2 mb-3">
          <Sparkles className="w-4 h-4" style={{ color: 'var(--color-text-muted)' }} />
          <h2 className="label-section">Available Research</h2>
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
                className={`${locked ? 'card-redacted' : 'card-dossier'} ${disabled ? 'opacity-60' : ''}`}
              >
                <div className="p-4">
                  {/* Category + cost */}
                  <div className="flex items-center justify-between mb-2.5">
                    <span className={`text-[10px] font-bold uppercase tracking-wider px-2 py-0.5 rounded-md ${style.bg} ${style.text}`}>
                      {style.icon} {research.category}
                    </span>
                    <div className="flex items-center gap-1.5">
                      {locked && <Lock className="w-3 h-3" style={{ color: 'var(--color-text-muted)' }} />}
                      <span className={`font-data text-xs font-bold`} style={{ color: affordable ? 'var(--color-green)' : 'var(--color-red)' }}>
                        {research.cost} RP
                      </span>
                    </div>
                  </div>

                  {/* Name + description */}
                  <h3 className="text-base font-bold mb-1" style={{ color: 'var(--color-text)' }}>{research.name}</h3>
                  <p className="text-xs mb-3" style={{ color: 'var(--color-text-muted)' }}>{research.description}</p>

                  {/* Benefits */}
                  <div className="space-y-1.5 mb-4">
                    {research.benefits.map((benefit, i) => (
                      <div key={i} className="flex items-center gap-2">
                        <Zap className="w-3 h-3 shrink-0" style={{ color: 'var(--color-green)' }} />
                        <span className="stat-up" style={{ fontSize: '12px' }}>{benefit}</span>
                      </div>
                    ))}
                  </div>

                  {/* Prerequisite warning */}
                  {locked && (
                    <div className="flex items-center gap-2 rounded-xl px-3 py-2 mb-3" style={{ background: 'var(--color-surface-raised)' }}>
                      <Lock className="w-3.5 h-3.5 shrink-0" style={{ color: 'var(--color-text-muted)' }} />
                      <p className="text-xs" style={{ color: 'var(--color-text-muted)' }}>
                        Requires: {availableResearch.find((r) => r.id === research.prerequisite)?.name ?? 'Unknown'}
                      </p>
                    </div>
                  )}

                  {/* Action */}
                  <button
                    onClick={() => handleResearch(research.id)}
                    disabled={disabled}
                    className={`
                      w-full flex items-center justify-center gap-2 text-sm py-3 rounded-xl transition-colors
                      ${disabled
                        ? 'btn-secondary cursor-not-allowed opacity-40'
                        : 'btn-primary'
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
          <CheckCircle className="w-4 h-4" style={{ color: 'var(--color-text-muted)' }} />
          <h2 className="label-section">Completed</h2>
        </div>

        {completedResearch.length === 0 ? (
          <div className="text-center py-8">
            <p className="text-sm" style={{ color: 'var(--color-text-muted)' }}>No research completed yet</p>
          </div>
        ) : (
          <div className="space-y-2">
            {completedResearch.map((research) => {
              const style = categoryStyle[research.category] ?? categoryStyle['Maintenance'];
              return (
                <div
                  key={research.id}
                  className="card-dossier p-3.5 flex items-center gap-3"
                >
                  <div className={`w-9 h-9 rounded-lg ${style.bg} flex items-center justify-center shrink-0`}>
                    <CheckCircle className={`w-4 h-4 ${style.text}`} />
                  </div>
                  <div className="flex-1 min-w-0">
                    <h3 className="text-sm font-semibold truncate" style={{ color: 'var(--color-text)' }}>{research.name}</h3>
                    <p className="text-xs" style={{ color: 'var(--color-text-muted)' }}>{research.category} · <span className="font-data">{research.completedAt}</span></p>
                  </div>
                  <ChevronRight className="w-4 h-4 shrink-0" style={{ color: 'var(--color-border)' }} />
                </div>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
};
