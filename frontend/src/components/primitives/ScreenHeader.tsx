import { Link } from "react-router-dom";
import type { ReactNode } from "react";

export interface ScreenHeaderProps {
  /** Screen title, e.g. "Hangar". Rendered in the display font, uppercased. */
  title: string;
  /** Optional mono sub-line, e.g. "34 sqns · 534 airframes". */
  subtitle?: string;
  /** Route the back button navigates to. */
  backTo: string;
  /** Back button label (default "Map"). */
  backLabel?: string;
  /** Optional right-aligned content (badge, action, etc.). */
  right?: ReactNode;
}

/**
 * Consistent command-UI header for interior screens: a proper tap-sized
 * back button + a display-font title + optional mono subtitle. Replaces the
 * bare "Map" text links scattered across the hub screens. Safe-area aware.
 */
export function ScreenHeader({ title, subtitle, backTo, backLabel = "Map", right }: ScreenHeaderProps) {
  return (
    <header className="safe-pt border-b border-slate-800/80 bg-[#0a0f1c]/80">
      <div className="mx-auto flex w-full max-w-3xl items-center gap-3 px-4 py-3">
        <Link
          to={backTo}
          aria-label={`Back to ${backLabel}`}
          className="flex min-h-[44px] items-center gap-1 rounded-lg border border-slate-700 px-3 font-tech text-[11px] uppercase tracking-wider text-amber-300/90 transition-colors hover:border-amber-600/60 hover:text-amber-200"
        >
          <span aria-hidden>‹</span> {backLabel}
        </Link>
        <div className="min-w-0 flex-1">
          <h1 className="truncate font-display text-lg font-bold uppercase leading-none tracking-[0.06em] text-slate-50">
            {title}
          </h1>
          {subtitle && (
            <p className="mt-1 truncate font-tech text-[10px] tracking-wider text-slate-500">{subtitle}</p>
          )}
        </div>
        {right && <div className="shrink-0">{right}</div>}
      </div>
    </header>
  );
}
