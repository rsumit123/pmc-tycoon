import { useState } from "react";

function Row({ kind, color, label }: { kind: "ring" | "dot"; color: string; label: string }) {
  return (
    <div className="flex items-center gap-2">
      {kind === "ring" ? (
        <span className="inline-block h-3 w-3 flex-shrink-0 rounded-full border-2" style={{ borderColor: color }} />
      ) : (
        <span className="inline-block h-2.5 w-2.5 flex-shrink-0 rounded-full border border-slate-900" style={{ background: color }} />
      )}
      <span className="text-slate-300">{label}</span>
    </div>
  );
}

/** Compact, collapsible key for the map markers (readiness ring + asset badges). */
export function MapLegend() {
  const [open, setOpen] = useState(false);
  return (
    <div className="absolute bottom-7 left-2 z-[6]">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        className="font-tech rounded border border-slate-700 bg-[#0a0f1c]/85 px-2 py-1 text-[10px] uppercase tracking-wider text-amber-300/90 backdrop-blur"
      >
        {open ? "▾ Key" : "▸ Key"}
      </button>
      {open && (
        <div className="font-tech mt-1 w-44 space-y-1.5 rounded-lg border border-slate-700 bg-[#0a0f1c]/90 p-2.5 text-[10px] backdrop-blur">
          <div className="tracking-widest text-amber-500/70">BASE READINESS</div>
          <Row kind="ring" color="#34d399" label="Ready ≥75%" />
          <Row kind="ring" color="#f59e0b" label="Strained 55–74%" />
          <Row kind="ring" color="#fb7185" label="Critical <55%" />
          <div className="pt-1 tracking-widest text-amber-500/70">ASSET BADGES</div>
          <Row kind="dot" color="#34d399" label="AWACS" />
          <Row kind="dot" color="#fb923c" label="Tanker" />
          <Row kind="dot" color="#fde047" label="AD battery" />
          <Row kind="dot" color="#38bdf8" label="ISR / UCAV" />
          <div className="pt-1 tracking-widest text-amber-500/70">VIEW</div>
          <div className="text-slate-400">Drag to pan · two-finger drag to tilt</div>
        </div>
      )}
    </div>
  );
}
