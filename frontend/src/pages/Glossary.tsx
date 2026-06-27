import { useState, useMemo } from "react";
import { Link } from "react-router-dom";
import { GLOSSARY } from "../lib/glossary";

export function Glossary() {
  const [q, setQ] = useState("");
  const entries = useMemo(() => {
    const all = Object.values(GLOSSARY).sort((a, b) => a.term.localeCompare(b.term));
    const needle = q.trim().toLowerCase();
    if (!needle) return all;
    return all.filter(
      (e) => e.term.toLowerCase().includes(needle) || e.short.toLowerCase().includes(needle),
    );
  }, [q]);

  return (
    <div className="min-h-screen p-4 safe-pt safe-pb">
      <div className="max-w-2xl mx-auto space-y-4">
        <div className="flex items-center justify-between">
          <h1 className="text-2xl font-bold font-display uppercase tracking-wider">Glossary</h1>
          <Link to="/" className="text-xs text-slate-400 underline">Home</Link>
        </div>
        <p className="text-sm opacity-70">Plain-language definitions for the terms used across Chakravyuh.</p>
        <input
          value={q}
          onChange={(e) => setQ(e.target.value)}
          placeholder="Search terms…"
          className="w-full bg-slate-800 border border-slate-700 rounded-lg px-3 py-2 text-sm"
        />
        <div className="space-y-2">
          {entries.map((e) => (
            <div key={e.term} className="rounded-lg border border-slate-800 bg-slate-900 p-3">
              <div className="text-sm font-semibold text-amber-400">{e.term}</div>
              <div className="mt-1 text-sm text-slate-200">{e.short}</div>
              {e.why && (
                <div className="mt-1 text-xs text-slate-400" title={e.why} data-why={e.why} />
              )}
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
