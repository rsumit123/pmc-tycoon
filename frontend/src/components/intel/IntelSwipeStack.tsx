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
      <p className="mt-3 text-center text-xs opacity-60">
        Swipe to dismiss • {remaining.length} remaining
      </p>
    </div>
  );
}
