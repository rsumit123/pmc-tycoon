import { useState, useRef, useEffect, type ReactNode } from "react";
import { lookupTerm } from "../../lib/glossary";
import { useBackButtonClose } from "../../lib/useBackButtonClose";

export interface TermProps {
  /** Glossary key. Defaults to the lowercased text of `children`. */
  k?: string;
  children: ReactNode;
}

/**
 * Inline jargon term. Tap to reveal a plain-language definition popover.
 * If the key isn't in the glossary it renders the children as plain text.
 * Tap-driven + back-button aware for the Capacitor Android WebView.
 */
export function Term({ k, children }: TermProps) {
  const key = k ?? (typeof children === "string" ? children : "");
  const entry = lookupTerm(key);
  const [open, setOpen] = useState(false);
  const wrapRef = useRef<HTMLSpanElement>(null);

  useBackButtonClose(open, () => setOpen(false));

  useEffect(() => {
    if (!open) return;
    function onDocClick(e: MouseEvent) {
      if (wrapRef.current && !wrapRef.current.contains(e.target as Node)) setOpen(false);
    }
    document.addEventListener("click", onDocClick);
    return () => document.removeEventListener("click", onDocClick);
  }, [open]);

  if (!entry) return <>{children}</>;

  return (
    <span ref={wrapRef} className="relative inline-block">
      <button
        type="button"
        aria-label={`Define ${key}`}
        onClick={(e) => { e.stopPropagation(); setOpen((v) => !v); }}
        className="underline decoration-dotted decoration-amber-500/60 underline-offset-2 cursor-help"
      >
        {children}
      </button>
      {open && (
        <span
          role="tooltip"
          className="absolute left-1/2 -translate-x-1/2 top-full mt-1 z-50 w-[min(16rem,80vw)] rounded-lg border border-slate-700 bg-slate-900 p-3 text-left shadow-xl"
        >
          <span className="block text-xs font-semibold text-amber-400">{entry.term}</span>
          <span className="mt-1 block text-xs text-slate-200 leading-relaxed">{entry.short}</span>
          {entry.why && (
            <span className="mt-1 block text-[11px] text-slate-400 leading-relaxed">{entry.why}</span>
          )}
        </span>
      )}
    </span>
  );
}
