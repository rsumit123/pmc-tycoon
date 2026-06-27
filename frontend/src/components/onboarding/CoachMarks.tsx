import { useState, useLayoutEffect, useCallback } from "react";
import { useBackButtonClose } from "../../lib/useBackButtonClose";

export interface CoachStep {
  /** data-tour attribute value of the element to spotlight. */
  targetId: string;
  title: string;
  body: string;
}

export interface CoachMarksProps {
  steps: CoachStep[];
  onDone: () => void;
}

interface Rect { top: number; left: number; width: number; height: number; }

/**
 * Guided tour overlay. Dims the screen, spotlights the current step's target
 * element (by data-tour), and shows a card with Back/Next/Skip. Resilient to
 * missing targets (card centers). Tap + back-button driven for Android.
 */
export function CoachMarks({ steps, onDone }: CoachMarksProps) {
  const [i, setI] = useState(0);
  const [rect, setRect] = useState<Rect | null>(null);
  const step = steps[i];

  useBackButtonClose(true, () => (i > 0 ? setI(i - 1) : onDone()));

  useLayoutEffect(() => {
    if (!step) return;
    const el = document.querySelector<HTMLElement>(`[data-tour="${step.targetId}"]`);
    if (el) {
      const r = el.getBoundingClientRect();
      setRect({ top: r.top, left: r.left, width: r.width, height: r.height });
    } else {
      setRect(null);
    }
  }, [step]);

  const next = useCallback(() => {
    if (i + 1 >= steps.length) onDone();
    else setI(i + 1);
  }, [i, steps.length, onDone]);

  if (!step) return null;
  const isLast = i + 1 >= steps.length;

  return (
    <div className="fixed inset-0 z-[100] bg-black/70 safe-pt safe-pb" role="dialog" aria-label="Tutorial">
      {rect && (
        <div
          className="absolute rounded-lg ring-2 ring-amber-400 pointer-events-none transition-all"
          style={{ top: rect.top - 6, left: rect.left - 6, width: rect.width + 12, height: rect.height + 12 }}
        />
      )}
      <div className="absolute left-1/2 -translate-x-1/2 bottom-6 w-[min(22rem,90vw)] rounded-xl border border-slate-700 bg-slate-900 p-4 shadow-2xl">
        <div className="text-xs text-amber-500/80 font-tech">{i + 1} of {steps.length}</div>
        <div className="mt-1 text-base font-semibold">{step.title}</div>
        <div className="mt-1 text-sm text-slate-300 leading-relaxed">{step.body}</div>
        <div className="mt-4 flex items-center justify-between gap-2">
          <button type="button" onClick={onDone} className="text-xs text-slate-400 underline min-h-[44px] px-2">Skip</button>
          <div className="flex gap-2">
            {i > 0 && (
              <button type="button" onClick={() => setI(i - 1)} className="rounded-lg border border-slate-600 px-4 min-h-[44px] text-sm">Back</button>
            )}
            <button type="button" onClick={next} className="rounded-lg bg-amber-600 text-slate-900 font-semibold px-4 min-h-[44px] text-sm">
              {isLast ? "Done" : "Next"}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
