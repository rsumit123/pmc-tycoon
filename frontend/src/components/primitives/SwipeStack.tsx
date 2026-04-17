import { useCallback, useRef, useState } from "react";

export interface SwipeStackProps<T> {
  items: T[];
  renderCard: (item: T, index: number) => React.ReactNode;
  onDismiss: (item: T, direction: "left" | "right") => void;
  className?: string;
  threshold?: number;
}

export function SwipeStack<T>({
  items,
  renderCard,
  onDismiss,
  className = "",
  threshold = 80,
}: SwipeStackProps<T>) {
  const [dx, setDx] = useState(0);
  const startXRef = useRef<number | null>(null);

  const onPointerDown = useCallback((e: React.PointerEvent) => {
    startXRef.current = e.clientX;
    setDx(0);
  }, []);

  const onPointerMove = useCallback((e: React.PointerEvent) => {
    if (startXRef.current == null) return;
    setDx(e.clientX - startXRef.current);
  }, []);

  const onPointerUp = useCallback(
    (e: React.PointerEvent, itemsSnapshot: T[]) => {
      if (startXRef.current == null) return;
      const movement = e.clientX - startXRef.current;
      startXRef.current = null;
      setDx(0);
      if (Math.abs(movement) >= threshold && itemsSnapshot.length > 0) {
        const direction: "left" | "right" = movement > 0 ? "right" : "left";
        onDismiss(itemsSnapshot[0], direction);
      }
    },
    [threshold, onDismiss],
  );

  const onPointerCancel = useCallback(() => {
    startXRef.current = null;
    setDx(0);
  }, []);

  if (items.length === 0) {
    return (
      <div className={["text-sm opacity-60 text-center p-6", className].join(" ")}>
        No more cards.
      </div>
    );
  }

  const top = items[0];
  const beneath = items.slice(1, 4);

  return (
    <div className={["relative select-none touch-none", className].join(" ")}>
      {beneath.map((item, i) => (
        <div
          key={i}
          className="absolute inset-0"
          style={{
            transform: `translateY(${(i + 1) * 6}px) scale(${1 - (i + 1) * 0.03})`,
            zIndex: -i,
            opacity: 1 - (i + 1) * 0.15,
          }}
        >
          {renderCard(item, i + 1)}
        </div>
      ))}
      <div
        onPointerDown={onPointerDown}
        onPointerMove={onPointerMove}
        onPointerUp={(e) => onPointerUp(e, items)}
        onPointerCancel={onPointerCancel}
        onPointerLeave={onPointerCancel}
        className="relative cursor-grab active:cursor-grabbing"
        style={{
          transform: `translateX(${dx}px) rotate(${dx / 40}deg)`,
          transition: startXRef.current == null ? "transform 0.2s ease" : "none",
        }}
      >
        {renderCard(top, 0)}
      </div>
    </div>
  );
}
