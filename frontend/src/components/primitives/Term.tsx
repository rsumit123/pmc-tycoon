import { useState, useRef, useEffect, useLayoutEffect, type ReactNode } from "react";
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
 * Tap-driven + back-button aware for the Capacitor Android WebView. The
 * popover is positioned `fixed` and clamped to the viewport so it never
 * clips off-screen on narrow phones, regardless of where the term sits.
 */
export function Term({ k, children }: TermProps) {
  const key = k ?? (typeof children === "string" ? children : "");
  const entry = lookupTerm(key);
  const [open, setOpen] = useState(false);
  const [pos, setPos] = useState<{ left: number; top: number } | null>(null);
  const wrapRef = useRef<HTMLSpanElement>(null);

  useBackButtonClose(open, () => setOpen(false));

  // Position the popover relative to the trigger, clamped within the viewport
  // so it can't clip off the left/right edge on a narrow phone.
  useLayoutEffect(() => {
    if (!open || !wrapRef.current) return;
    const r = wrapRef.current.getBoundingClientRect();
    const width = Math.min(256, window.innerWidth * 0.8); // mirrors the w style below (16rem / 80vw)
    const center = r.left + r.width / 2;
    const left = Math.max(8, Math.min(center - width / 2, window.innerWidth - width - 8));
    setPos({ left, top: r.bottom + 4 });
  }, [open]);

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
        // stopPropagation is load-bearing: it stops BOTH the document
        // close-listener above AND any parent row/label tap-handler from
        // firing when the user taps the term to read its definition.
        onClick={(e) => { e.stopPropagation(); setOpen((v) => !v); }}
        className="underline decoration-dotted decoration-amber-500/60 underline-offset-2 cursor-help"
      >
        {children}
      </button>
      {open && pos && (
        <span
          role="tooltip"
          style={{ position: "fixed", left: pos.left, top: pos.top, width: "min(16rem, 80vw)" }}
          className="z-[60] rounded-lg border border-slate-700 bg-slate-900 p-3 text-left shadow-xl"
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
