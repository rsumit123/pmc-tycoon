import { useState } from 'react';
import '../../styles/design-system.css';

interface SubsystemSlot {
  slot_type: string;
  module_name: string;
  key_stat: string;
  condition_pct: number;
}

interface AircraftDiagramProps {
  slots: SubsystemSlot[];
  selectedSlot: string | null;
  onSlotSelect: (slotType: string) => void;
}

const SLOT_POSITIONS: Record<string, { x: string; y: string; label: string }> = {
  radar: { x: '12%', y: '42%', label: 'RADAR' },
  computer: { x: '30%', y: '28%', label: 'COMPUTER' },
  engine: { x: '82%', y: '42%', label: 'ENGINE' },
  airframe: { x: '50%', y: '62%', label: 'AIRFRAME' },
  ecm: { x: '38%', y: '72%', label: 'ECM' },
  countermeasures: { x: '72%', y: '28%', label: 'C/M' },
};

const conditionColor = (c: number) =>
  c > 70 ? 'var(--color-green)' : c > 40 ? 'var(--color-amber)' : 'var(--color-red)';

export const AircraftDiagram = ({ slots, selectedSlot, onSlotSelect }: AircraftDiagramProps) => {
  const [hoveredSlot, setHoveredSlot] = useState<string | null>(null);

  return (
    <div className="relative w-full" style={{ aspectRatio: '16/9', maxHeight: '220px' }}>
      {/* Aircraft silhouette SVG */}
      <svg viewBox="0 0 400 200" className="w-full h-full" style={{ filter: 'drop-shadow(0 0 8px rgba(212,168,67,0.08))' }}>
        {/* Fuselage */}
        <path
          d="M 60,100 L 30,95 L 15,100 L 30,105 Z"
          fill="none" stroke="var(--color-amber-dim)" strokeWidth="1" opacity="0.6"
        />
        <path
          d="M 60,90 Q 40,100 60,110 L 320,115 Q 350,105 360,100 Q 350,95 320,85 Z"
          fill="rgba(212,168,67,0.04)" stroke="var(--color-amber-dim)" strokeWidth="1.2" opacity="0.7"
        />
        {/* Nose cone / radome */}
        <path
          d="M 60,90 Q 30,95 20,100 Q 30,105 60,110"
          fill="rgba(212,168,67,0.06)" stroke="var(--color-amber-dim)" strokeWidth="1" opacity="0.6"
        />
        {/* Canopy */}
        <ellipse cx="110" cy="93" rx="20" ry="8" fill="rgba(91,139,160,0.1)" stroke="var(--color-blue-dim)" strokeWidth="0.8" opacity="0.6" />
        {/* Wings */}
        <path
          d="M 160,95 L 100,40 L 130,42 L 200,85"
          fill="rgba(212,168,67,0.03)" stroke="var(--color-amber-dim)" strokeWidth="1" opacity="0.5"
        />
        <path
          d="M 160,105 L 100,160 L 130,158 L 200,115"
          fill="rgba(212,168,67,0.03)" stroke="var(--color-amber-dim)" strokeWidth="1" opacity="0.5"
        />
        {/* Tail fins */}
        <path
          d="M 310,90 L 330,50 L 345,55 L 325,88"
          fill="rgba(212,168,67,0.03)" stroke="var(--color-amber-dim)" strokeWidth="0.8" opacity="0.5"
        />
        <path
          d="M 310,110 L 330,150 L 345,145 L 325,112"
          fill="rgba(212,168,67,0.03)" stroke="var(--color-amber-dim)" strokeWidth="0.8" opacity="0.5"
        />
        {/* Engine exhaust */}
        <circle cx="365" cy="100" r="8" fill="none" stroke="var(--color-amber-dim)" strokeWidth="0.8" opacity="0.4" />
        <circle cx="365" cy="100" r="4" fill="rgba(212,168,67,0.1)" />
      </svg>

      {/* Hotspot zones */}
      {Object.entries(SLOT_POSITIONS).map(([slotType, pos]) => {
        const slot = slots.find(s => s.slot_type === slotType);
        const isSelected = selectedSlot === slotType;
        const isHovered = hoveredSlot === slotType;
        const condition = slot?.condition_pct ?? 100;
        const color = conditionColor(condition);

        return (
          <button
            key={slotType}
            onClick={() => onSlotSelect(slotType)}
            onMouseEnter={() => setHoveredSlot(slotType)}
            onMouseLeave={() => setHoveredSlot(null)}
            className="absolute flex flex-col items-center transition-all"
            style={{
              left: pos.x,
              top: pos.y,
              transform: 'translate(-50%, -50%)',
              zIndex: isSelected || isHovered ? 10 : 1,
            }}
          >
            {/* Pulsing dot */}
            <div
              className="relative"
              style={{
                width: isSelected ? '16px' : '12px',
                height: isSelected ? '16px' : '12px',
                transition: 'all 0.2s',
              }}
            >
              <div
                className="absolute inset-0 rounded-full"
                style={{
                  background: color,
                  boxShadow: `0 0 ${isSelected ? '12px' : '6px'} ${color}`,
                  opacity: isSelected ? 1 : 0.8,
                }}
              />
              {/* Pulse ring */}
              {isSelected && (
                <div
                  className="absolute inset-0 rounded-full animate-ping"
                  style={{ background: color, opacity: 0.3 }}
                />
              )}
            </div>

            {/* Label */}
            <div
              className="mt-1 px-1.5 py-0.5 rounded text-center whitespace-nowrap transition-all"
              style={{
                background: isSelected ? 'var(--color-surface-raised)' : isHovered ? 'var(--color-surface)' : 'transparent',
                border: isSelected ? `1px solid ${color}` : '1px solid transparent',
                minWidth: '40px',
              }}
            >
              <span
                className="text-[8px] font-display tracking-wider font-bold block"
                style={{ color: isSelected ? color : 'var(--color-text-muted)' }}
              >
                {pos.label}
              </span>
              {(isSelected || isHovered) && slot && (
                <span className="text-[7px] font-data block" style={{ color: 'var(--color-text-secondary)' }}>
                  {slot.key_stat}
                </span>
              )}
            </div>
          </button>
        );
      })}
    </div>
  );
};
