import { useCallback, useEffect, useRef, useState } from "react";
import { hapticBuzz } from "../../lib/audio";

export interface CommitHoldButtonProps {
  onCommit: () => void;
  label?: string;
  holdMs?: number;
  disabled?: boolean;
  className?: string;
}

export function CommitHoldButton({
  onCommit,
  label = "Hold to commit",
  holdMs = 2000,
  disabled = false,
  className = "",
}: CommitHoldButtonProps) {
  const [progress, setProgress] = useState(0);
  const [showStamp, setShowStamp] = useState(false);
  const rafRef = useRef<number | null>(null);
  const startedAtRef = useRef<number | null>(null);

  const stop = useCallback(() => {
    if (rafRef.current !== null) cancelAnimationFrame(rafRef.current);
    rafRef.current = null;
    startedAtRef.current = null;
    setProgress(0);
  }, []);

  const tick = useCallback(() => {
    if (startedAtRef.current == null) return;
    const elapsed = performance.now() - startedAtRef.current;
    const frac = Math.min(1, elapsed / holdMs);
    setProgress(frac);
    if (frac >= 1) {
      stop();
      hapticBuzz();
      setShowStamp(true);
      setTimeout(() => setShowStamp(false), 600);
      onCommit();
    } else {
      rafRef.current = requestAnimationFrame(tick);
    }
  }, [holdMs, onCommit, stop]);

  const onPointerDown = useCallback(() => {
    if (disabled) return;
    startedAtRef.current = performance.now();
    rafRef.current = requestAnimationFrame(tick);
  }, [disabled, tick]);

  useEffect(() => () => { if (rafRef.current !== null) cancelAnimationFrame(rafRef.current); }, []);

  return (
    <button
      type="button"
      aria-disabled={disabled}
      disabled={disabled}
      onPointerDown={onPointerDown}
      onPointerUp={stop}
      onPointerLeave={stop}
      onPointerCancel={stop}
      className={[
        "relative overflow-hidden rounded-lg px-4 py-3 font-semibold",
        "bg-amber-600 text-slate-900 select-none",
        disabled ? "opacity-50 cursor-not-allowed" : "hover:bg-amber-500 active:bg-amber-700",
        className,
      ].join(" ")}
    >
      <span
        aria-hidden
        className="absolute inset-0 bg-amber-400/40 origin-left"
        style={{ transform: `scaleX(${progress})` }}
      />
      {showStamp && (
        <div className="stamp-animation absolute inset-0 flex items-center justify-center z-10">
          <span className="text-4xl text-amber-500 font-black tracking-wider">SIGNED</span>
        </div>
      )}
      <span className="relative">{label}</span>
    </button>
  );
}
