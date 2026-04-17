import { useCallback } from "react";

export interface StepperProps {
  value: number;
  onChange: (next: number) => void;
  step?: number;
  min?: number;
  max?: number;
  formatValue?: (v: number) => string;
  unitSuffix?: string;
  disabled?: boolean;
  className?: string;
  ariaLabel?: string;
}

export function Stepper({
  value,
  onChange,
  step = 1,
  min = Number.NEGATIVE_INFINITY,
  max = Number.POSITIVE_INFINITY,
  formatValue = (v) => String(v),
  unitSuffix = "",
  disabled = false,
  className = "",
  ariaLabel,
}: StepperProps) {
  const canDec = !disabled && value > min;
  const canInc = !disabled && value < max;

  const inc = useCallback(() => {
    if (!canInc) return;
    onChange(Math.min(max, value + step));
  }, [canInc, max, value, step, onChange]);

  const dec = useCallback(() => {
    if (!canDec) return;
    onChange(Math.max(min, value - step));
  }, [canDec, min, value, step, onChange]);

  const onKeyDown = useCallback(
    (e: React.KeyboardEvent) => {
      if (e.key === "ArrowUp" || e.key === "ArrowRight") {
        e.preventDefault();
        inc();
      } else if (e.key === "ArrowDown" || e.key === "ArrowLeft") {
        e.preventDefault();
        dec();
      }
    },
    [inc, dec],
  );

  return (
    <div
      className={[
        "inline-flex items-stretch rounded-lg border border-slate-800 bg-slate-900/60 select-none",
        className,
      ].join(" ")}
      role="group"
      aria-label={ariaLabel}
      tabIndex={disabled ? -1 : 0}
      onKeyDown={onKeyDown}
    >
      <button
        type="button"
        aria-label="decrement"
        disabled={!canDec}
        onClick={dec}
        className={[
          "w-9 flex items-center justify-center text-lg",
          canDec ? "hover:bg-slate-800 active:bg-slate-700" : "opacity-40 cursor-not-allowed",
        ].join(" ")}
      >
        −
      </button>
      <div className="flex-1 px-3 py-1.5 text-center font-mono text-sm tabular-nums">
        {formatValue(value)}
        {unitSuffix}
      </div>
      <button
        type="button"
        aria-label="increment"
        disabled={!canInc}
        onClick={inc}
        className={[
          "w-9 flex items-center justify-center text-lg",
          canInc ? "hover:bg-slate-800 active:bg-slate-700" : "opacity-40 cursor-not-allowed",
        ].join(" ")}
      >
        +
      </button>
    </div>
  );
}
