import { useEffect } from "react";
import type { Toast as ToastType } from "../../lib/types";

const VARIANT_STYLES: Record<string, string> = {
  success: "bg-emerald-600/90 text-slate-900 border-emerald-400",
  info: "bg-slate-700/95 text-slate-100 border-slate-500",
  warning: "bg-amber-600/90 text-slate-900 border-amber-400",
  error: "bg-red-700/95 text-slate-100 border-red-400",
};

export interface ToastProps {
  toast: ToastType;
  onDismiss: (id: string) => void;
}

export function Toast({ toast, onDismiss }: ToastProps) {
  const duration = toast.duration ?? 3000;
  useEffect(() => {
    if (duration <= 0) return;
    const t = setTimeout(() => onDismiss(toast.id), duration);
    return () => clearTimeout(t);
  }, [toast.id, duration, onDismiss]);

  return (
    <div
      role="status"
      onClick={() => onDismiss(toast.id)}
      className={[
        "px-4 py-2 rounded-lg shadow-lg border text-sm cursor-pointer",
        "max-w-[calc(100vw-2rem)] sm:max-w-sm",
        VARIANT_STYLES[toast.variant] ?? VARIANT_STYLES.info,
      ].join(" ")}
    >
      {toast.message}
    </div>
  );
}
