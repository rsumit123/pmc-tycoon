interface LoaderProps {
  /** Short status line shown under the ring (rendered uppercase). */
  label?: string;
  /** Center in a tall area (default) vs. a compact inline block. */
  fullScreen?: boolean;
}

/**
 * Shared themed loading indicator: a mini chakravyuh formation (two counter-
 * rotating amber arcs + core) over a tactical status label. Used app-wide in
 * place of bare "Loading…" text for a cohesive look.
 */
export function Loader({ label = "Establishing uplink", fullScreen = true }: LoaderProps) {
  const content = (
    <div className="flex flex-col items-center gap-3" role="status" aria-label={label}>
      <svg viewBox="0 0 64 64" className="h-12 w-12" aria-hidden="true">
        <circle cx="32" cy="32" r="28" fill="none" stroke="#f59e0b" strokeOpacity="0.15" strokeWidth="2" />
        <circle
          className="cv-loader-a" cx="32" cy="32" r="28" fill="none" stroke="#f59e0b"
          strokeWidth="2" strokeDasharray="36 112" strokeLinecap="round"
        />
        <circle
          className="cv-loader-b" cx="32" cy="32" r="18" fill="none" stroke="#fbbf24"
          strokeOpacity="0.8" strokeWidth="2" strokeDasharray="22 72" strokeLinecap="round"
        />
        <circle cx="32" cy="32" r="3" fill="#f59e0b" />
      </svg>
      <div className="font-tech text-[11px] uppercase tracking-[0.25em] text-amber-500/80">
        {label}
        <span className="text-amber-500/80">…</span>
      </div>
    </div>
  );

  if (fullScreen) {
    return <div className="flex min-h-[60vh] items-center justify-center p-6">{content}</div>;
  }
  return <div className="flex justify-center py-6">{content}</div>;
}
