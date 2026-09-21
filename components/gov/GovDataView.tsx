"use client";
import { useEffect, useState } from "react";

/** Small, safe operational viewer shared by read-only console modules. */
export function GovDataView({ title, description, endpoint }: { title: string; description: string; endpoint: string }) {
  const [data, setData] = useState<unknown>(null); const [error, setError] = useState<string | null>(null);
  useEffect(() => { let alive = true; fetch(endpoint, { cache: "no-store" }).then(async r => { if (!r.ok) throw new Error(`Request failed (${r.status})`); return r.json(); }).then(v => { if (alive) setData(v); }).catch(e => { if (alive) setError(e.message); }); return () => { alive = false; }; }, [endpoint]);
  return <section className="gov-panel space-y-4 p-6"><div><h2 className="text-lg font-bold text-slate-100">{title}</h2><p className="mt-1 text-sm text-slate-400">{description}</p></div>{error ? <p className="rounded-lg border border-rose-400/30 bg-rose-400/10 p-3 text-sm text-rose-200">{error}</p> : data === null ? <p className="text-sm text-slate-500">Loading scoped live data…</p> : <pre className="max-h-[65vh] overflow-auto rounded-lg border border-slate-800 bg-slate-950/70 p-4 text-xs leading-relaxed text-slate-300">{JSON.stringify(data, null, 2)}</pre>}<p className="font-mono text-[10px] uppercase tracking-wider text-slate-600">Source: Cyber-Sakhi Cases · server-scoped · external government data: not connected</p></section>;
}
