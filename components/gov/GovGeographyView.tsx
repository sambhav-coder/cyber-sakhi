"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { geoMercator, geoPath } from "d3-geo";
import { feature } from "topojson-client";
import world from "world-atlas/countries-110m.json";

type Metric = { cases: number; new7d: number; highRisk: number; open: number };
type Row = { code: string; label: string; metric: Metric };
type GeoResult = {
  level: "india" | "state" | "district";
  state: string | null; district: string | null; rows: Row[]; total: Metric;
  threatBreakdown?: Array<{ label: string; count: number }>;
  riskBreakdown?: Array<{ label: string; count: number }>;
  cases?: Array<{ id: string; caseNumber: string; stateCode: string | null; districtCode: string | null; threatCategory: string | null; riskLevel: string | null; govStatus: string }>;
};

const METRICS: Array<{ key: keyof Metric; label: string }> = [
  { key: "cases", label: "Case volume" }, { key: "new7d", label: "New 7d" },
  { key: "highRisk", label: "High risk" }, { key: "open", label: "Open cases" },
];

function IndiaOutline() {
  const india = useMemo(() => {
    const collection = feature(world as never, (world as any).objects.countries) as any;
    return collection.features.find((item: any) => item.properties?.name === "India") ?? null;
  }, []);
  const path = useMemo(() => india ? geoPath(geoMercator().fitSize([440, 360], india))(india) : null, [india]);
  return <svg viewBox="0 0 440 360" role="img" aria-label="India national boundary" className="mx-auto w-full max-w-[440px]">
    <path d={path ?? ""} className="fill-teal-400/20 stroke-teal-300" strokeWidth="1.5" />
    <text x="220" y="330" textAnchor="middle" className="fill-slate-400 text-[12px]">India · aggregate only</text>
  </svg>;
}

export function GovGeographyView() {
  const [state, setState] = useState<string | null>(null);
  const [district, setDistrict] = useState<string | null>(null);
  const [metric, setMetric] = useState<keyof Metric>("cases");
  const [data, setData] = useState<GeoResult | null>(null);
  const [error, setError] = useState<string | null>(null);
  const load = useCallback(async () => {
    setError(null); const p = new URLSearchParams(); if (state) p.set("state", state); if (district) p.set("district", district);
    const response = await fetch(`/api/gov/geo?${p}`, { cache: "no-store" });
    if (!response.ok) throw new Error(`Unable to load geographic intelligence (${response.status}).`);
    setData(await response.json());
  }, [state, district]);
  useEffect(() => { void load().catch((e) => setError(e.message)); }, [load]);
  const title = district ? `Localities / subdivisions — ${district}` : state ? `Districts — ${state}` : "India — States / UTs";
  const max = Math.max(1, ...(data?.rows ?? []).map((r) => r.metric[metric]));
  const choose = (code: string) => { if (!state) setState(code); else if (!district) setDistrict(code); };
  const back = () => { if (district) setDistrict(null); else setState(null); };
  return <div className="space-y-5">
    <section className="gov-panel p-5"><div className="flex flex-wrap items-start justify-between gap-4"><div><h2 className="text-xl font-bold text-slate-100">Geographic Intelligence</h2><p className="mt-1 text-sm text-slate-400">Cyber-Sakhi Cases · server-scoped aggregation · never exact victim locations.</p></div><div className="flex flex-wrap gap-2">{METRICS.map((item) => <button key={item.key} type="button" onClick={() => setMetric(item.key)} className={`rounded-lg border px-3 py-1.5 text-xs font-semibold ${metric === item.key ? "border-teal-300 bg-teal-400/15 text-teal-200" : "border-slate-700 text-slate-400"}`}>{item.label}</button>)}</div></div></section>
    {error ? <section className="gov-panel p-5 text-rose-300">{error}</section> : !data ? <section className="gov-panel p-5 text-slate-400">Loading scoped geographic aggregates…</section> : <>
      <section className="grid gap-5 lg:grid-cols-[0.9fr_1.1fr]"><div className="gov-panel p-5"><IndiaOutline/><p className="mt-2 text-center text-xs text-slate-500">National boundary: world-atlas 110m. State and district polygons are not configured, so lower levels use their real database labels instead of fabricated boundaries.</p></div><div className="gov-panel p-5"><div className="flex items-center justify-between gap-3"><div><h3 className="font-bold text-slate-100">{title}</h3><p className="mt-1 text-xs text-slate-500">Color intensity represents {METRICS.find((item) => item.key === metric)?.label.toLowerCase()}.</p></div>{(state || district) && <button type="button" onClick={back} className="rounded border border-slate-700 px-3 py-1.5 text-xs text-slate-300">Back</button>}</div><div className="mt-4 space-y-2">{data.rows.map((row) => <button key={row.code} type="button" disabled={Boolean(district)} onClick={() => choose(row.code)} className="flex w-full items-center gap-3 rounded-lg px-2 py-2 text-left transition hover:bg-slate-800/70 disabled:cursor-default"><span className="w-36 truncate text-sm text-slate-200">{row.label}</span><span className="h-2 flex-1 overflow-hidden rounded-full bg-slate-800"><span className="block h-full rounded-full bg-teal-400/70" style={{ width: `${(row.metric[metric] / max) * 100}%` }} /></span><span className="w-10 text-right font-mono text-sm text-slate-300">{row.metric[metric]}</span></button>)}{data.rows.length === 0 && <p className="py-8 text-center text-sm text-slate-500">No located, scoped data for this level.</p>}</div></div></section>
      <section className="grid gap-5 lg:grid-cols-2"><div className="gov-panel p-5"><h3 className="font-bold text-slate-100">Selected area</h3><dl className="mt-3 grid grid-cols-2 gap-3 text-sm"><div><dt className="text-slate-500">Cases</dt><dd className="font-mono text-lg text-slate-100">{data.total.cases}</dd></div><div><dt className="text-slate-500">New 7d</dt><dd className="font-mono text-lg text-slate-100">{data.total.new7d}</dd></div><div><dt className="text-slate-500">High risk</dt><dd className="font-mono text-lg text-slate-100">{data.total.highRisk}</dd></div><div><dt className="text-slate-500">Open</dt><dd className="font-mono text-lg text-slate-100">{data.total.open}</dd></div></dl></div><div className="gov-panel p-5"><h3 className="font-bold text-slate-100">Threat and risk breakdown</h3><div className="mt-3 grid grid-cols-2 gap-4 text-sm"><ul>{data.threatBreakdown?.map((x) => <li key={x.label} className="flex justify-between gap-2 py-1 text-slate-300"><span className="truncate">{x.label}</span><span className="font-mono">{x.count}</span></li>)}</ul><ul>{data.riskBreakdown?.map((x) => <li key={x.label} className="flex justify-between gap-2 py-1 text-slate-300"><span>{x.label}</span><span className="font-mono">{x.count}</span></li>)}</ul></div></div></section>
      {district && <section className="gov-panel p-5"><h3 className="font-bold text-slate-100">Cases in selected locality</h3><div className="mt-3 overflow-x-auto"><table className="w-full text-left text-sm"><thead className="border-b border-slate-700 text-xs uppercase text-slate-500"><tr><th className="p-2">Case</th><th>Threat</th><th>Risk</th><th>Status</th></tr></thead><tbody>{data.cases?.map((row) => <tr key={row.id} className="border-b border-slate-800 text-slate-300"><td className="p-2"><Link className="font-mono text-teal-300" href={`/gov/cases/${row.id}`}>{row.caseNumber || row.id}</Link></td><td>{row.threatCategory ?? "—"}</td><td>{row.riskLevel ?? "Unset"}</td><td>{row.govStatus}</td></tr>)}</tbody></table></div></section>}
    </>}
  </div>;
}
