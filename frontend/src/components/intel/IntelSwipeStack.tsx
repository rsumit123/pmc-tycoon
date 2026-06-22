import { useState, useEffect } from "react";
import { SwipeStack } from "../primitives/SwipeStack";
import { IntelCard } from "./IntelCard";
import type { IntelCard as IntelCardType } from "../../lib/types";

export interface IntelSwipeStackProps {
  cards: IntelCardType[];
  className?: string;
}

export function IntelSwipeStack({ cards, className = "" }: IntelSwipeStackProps) {
  const [remaining, setRemaining] = useState<IntelCardType[]>(cards);

  useEffect(() => { setRemaining(cards); }, [cards]);

  if (cards.length === 0) {
    return (
      <div className={["text-sm opacity-60 text-center p-6 border border-dashed border-slate-700 rounded-lg", className].join(" ")}>
        No intel this quarter.
      </div>
    );
  }

  return (
    <div className={["max-w-sm mx-auto", className].join(" ")}>
      <SwipeStack
        items={remaining}
        renderCard={(c) => <IntelCard card={c} />}
        onDismiss={(item) => setRemaining((r) => r.filter((x) => x.id !== item.id))}
      />
      {remaining.length > 0 && (
        <button
          type="button"
          onClick={() => setRemaining((r) => r.slice(1))}
          className="mt-3 w-full min-h-[40px] rounded-lg border border-slate-700 bg-slate-800 hover:bg-slate-700 text-sm font-semibold text-slate-100"
          aria-label="Dismiss top intel card"
        >
          Dismiss ↓
        </button>
      )}
      <p className="mt-3 text-center text-xs opacity-60">
        Swipe or tap Dismiss • {remaining.length} remaining
      </p>
    </div>
  );
}
