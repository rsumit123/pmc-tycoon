import { useEffect, useState } from "react";
import { Link } from "react-router-dom";

interface Credit {
  id: string;
  attribution: string;
  author: string;
  license: string;
  source_url: string;
}

export function ImageCredits() {
  const [credits, setCredits] = useState<Credit[]>([]);
  const [loaded, setLoaded] = useState(false);

  useEffect(() => {
    fetch(`${import.meta.env.BASE_URL}platforms/attributions.json`)
      .then((r) => (r.ok ? r.json() : []))
      .then((data) => setCredits(Array.isArray(data) ? data : []))
      .catch(() => setCredits([]))
      .finally(() => setLoaded(true));
  }, []);

  return (
    <div className="mx-auto min-h-[100dvh] w-full max-w-2xl px-5 py-8">
      <div className="mb-6 flex items-center justify-between">
        <h1 className="font-display text-2xl font-bold uppercase tracking-[0.1em]">Image Credits</h1>
        <Link to="/" className="text-sm text-amber-400 underline">← Back</Link>
      </div>
      <p className="font-tech mb-6 text-xs uppercase tracking-wider text-slate-500">
        Platform imagery via Wikimedia Commons, used under each image's license.
      </p>
      {loaded && credits.length === 0 && (
        <p className="text-sm text-slate-400">No image credits available.</p>
      )}
      <ul className="space-y-3">
        {credits.map((c) => (
          <li key={c.id} className="rounded-lg border border-slate-800 bg-slate-900/50 p-3 text-sm">
            <div className="font-medium text-slate-100">{c.attribution || c.id}</div>
            <div className="mt-1 text-xs text-slate-400">
              {c.author && <span>© {c.author} · </span>}
              <span>{c.license}</span>
            </div>
            {c.source_url && (
              <a href={c.source_url} target="_blank" rel="noreferrer"
                 className="font-tech mt-1 inline-block text-[11px] uppercase tracking-wider text-amber-400 underline">
                View source ↗
              </a>
            )}
          </li>
        ))}
      </ul>
    </div>
  );
}
