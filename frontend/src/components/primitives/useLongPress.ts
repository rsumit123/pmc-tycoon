import { useCallback, useRef } from "react";
import type { PointerEvent as ReactPointerEvent } from "react";

export interface LongPressOptions {
  onLongPress: (e: ReactPointerEvent) => void;
  onClick?: (e: ReactPointerEvent) => void;
  durationMs?: number;
}

export interface LongPressHandlers {
  onPointerDown:   (e: ReactPointerEvent) => void;
  onPointerUp:     (e: ReactPointerEvent) => void;
  onPointerLeave:  (e: ReactPointerEvent) => void;
  onPointerCancel: (e: ReactPointerEvent) => void;
  onPointerMove:   (e: ReactPointerEvent) => void;
}

export function useLongPress(opts: LongPressOptions): LongPressHandlers {
  const duration = opts.durationMs ?? 400;
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const firedRef = useRef(false);
  const startPointRef = useRef<{ x: number; y: number } | null>(null);

  const clear = useCallback(() => {
    if (timerRef.current) {
      clearTimeout(timerRef.current);
      timerRef.current = null;
    }
    startPointRef.current = null;
  }, []);

  const onPointerDown = useCallback((e: ReactPointerEvent) => {
    firedRef.current = false;
    startPointRef.current = { x: e.clientX, y: e.clientY };
    timerRef.current = setTimeout(() => {
      firedRef.current = true;
      opts.onLongPress(e);
    }, duration);
  }, [opts, duration]);

  const onPointerUp = useCallback((e: ReactPointerEvent) => {
    const wasLongPress = firedRef.current;
    clear();
    if (!wasLongPress && opts.onClick) opts.onClick(e);
  }, [opts, clear]);

  const onPointerLeave = useCallback(() => { clear(); }, [clear]);
  const onPointerCancel = useCallback(() => { clear(); }, [clear]);

  const onPointerMove = useCallback((e: ReactPointerEvent) => {
    const start = startPointRef.current;
    if (!start || !timerRef.current) return;
    const dx = e.clientX - start.x;
    const dy = e.clientY - start.y;
    if (dx * dx + dy * dy > 64 /* 8px */ * 8) clear();
  }, [clear]);

  return { onPointerDown, onPointerUp, onPointerLeave, onPointerCancel, onPointerMove };
}
