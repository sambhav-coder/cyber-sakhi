"use client";

import React, { useEffect, useState } from "react";
import Link from "next/link";
import { clsx } from "clsx";
import { Database, FlaskConical, Landmark, PlugZap } from "lucide-react";
import registry from "@/docs/datasets/registry.json";
import connectorsDoc from "@/docs/datasets/connectors.json";
import uciEntry from "@/docs/datasets/uci-phishing-websites-327/registry-entry.json";

interface Connector {
  id: string;
  category: string;
  status: string;
  records: string;
  coverage: string;
  auth: string;
  license?: string;
  limitation: string;
}

const STATUS_STYLE: Record<string, string> = {
  Live: "bg-emerald-400/10 text-emerald-300",
  Connected: "bg-teal-400/10 text-teal-300",
  Research: "bg-amber-400/10 text-amber-300",
  Staged: "bg-slate-700/40 text-slate-300",
  Disconnected: "bg-slate-700/40 text-slate-400",
  Failed: "bg-rose-400/10 text-rose-300",
  "Pending Setup": "bg-slate-700/40 text-slate-300",
};

interface ProdTotals {
  metrics: { total: number };
  generatedAt: string;
}

/**
 * Data Sources (PART 23): categories A–D with per-connector status, counts,
 * coverage, license, and limitations. Live connector states come from the
 * build-time connectors registry (probed 2026-09-25); keys never leave the
 * server and are never shown here.
 */
export function GovDataSourcesView() {
  const connectors = (connectorsDoc as { connectors: Connector[] }).connectors;
  const [prod, setProd] = useState<ProdTotals | null>(null);
  const [prodState, setProdState] = useState<"loading" | "ready" | "forbidden" | "error">("loading");

  useEffect(() => {
    let alive = true;
    fetch("/gov/api/dashboard?range=90d", { cache: "no-store" })
      .then(async (r) => {
        if (!alive) return;
        if (r.status === 403) { setProdState("forbidden"); return; }
        if (!r.ok) throw new Error(String(r.status));
        setProd((await r.json()) as ProdTotals);
        setProdState("ready");
      })
      .catch(() => { if (alive) setProdState("error"); });
    return () => { alive = false; };
  }, []);

  const byCategory = (prefix: string) => connectors.filter((c) => c.category.startsWith(prefix));

  const connectorCard = (c: Connector) => (
    <article key={c.id} className="rounded-xl border border-slate-800 bg-slate-900/40 p-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h3 className="font-mono text-sm font-bold text-slate-100">{c.id}</h3>
        <span className={clsx("rounded-full px-2.5 py-1 font-mono text-[10px] font-bold uppercase tracking-widest", STATUS_STYLE[c.status] ?? "bg-slate-700/40 text-slate-300")}>
          {c.status}
        </span>
      </div>
      <dl className="mt-2 space-y-1 text-xs">
        {[["Records", c.records], ["Coverage", c.coverage], ["Access", c.auth], ...(c.license ? [["License", c.license] as [string, string]] : [])].map(([k, v]) => (
          <div key={k} className="flex gap-2">
            <dt className="w-20 shrink-0 font-mono uppercase text-slate-500">{k}</dt>
            <dd className="text-slate-300">{v}</dd>
          </div>
        ))}
      </dl>
      <p className="mt-2 text-[11px] leading-relaxed text-slate-500">Limitation: {c.limitation}</p>
    </article>
  );

  return (
    <div className="space-y-5">
      <section aria-label="Production data" className="gov-panel space-y-3 p-5">
        <div className="flex items-center gap-2.5">
          <Database className="h-5 w-5 text-teal-300" />
          <h2 className="text-xl font-bold text-slate-100">A. Cyber-Sakhi Production</h2>
        </div>
        {prodState === "loading" && <p className="text-sm text-slate-500">Loading scoped totals...</p>}
        {prodState === "forbidden" && (
          <p className="rounded-lg border border-slate-700/60 bg-slate-900/40 p-3 text-xs text-slate-400">
            Production totals are not visible for your role (no case-metrics permission).
          </p>
        )}
        {prodState === "error" && <p className="text-sm text-rose-300" role="alert">Production totals unavailable (query failure — not zero).</p>}
        {prodState === "ready" && prod && (
          <p className="text-xs text-slate-400">
            <span className="font-mono text-3xl font-bold text-slate-100">{prod.metrics.total}</span>{" "}
            accessible cases (all time) · as of {new Date(prod.generatedAt).toLocaleString("en-IN")}
          </p>
        )}
        <div className="grid gap-3 md:grid-cols-2">
          {byCategory("A.").map(connectorCard)}
        </div>
      </section>

      <section aria-label="External intelligence connectors" className="gov-panel space-y-3 p-5">
        <div className="flex items-center gap-2.5">
          <PlugZap className="h-5 w-5 text-sky-300" />
          <div>
            <h2 className="text-xl font-bold text-slate-100">B. External Intelligence</h2>
            <p className="text-xs text-slate-400">Live IOC feeds · separate domain, never production cases · <Link href="/gov/external" className="text-teal-300 underline">browse the corpus</Link></p>
          </div>
        </div>
        <div className="grid gap-3 md:grid-cols-2">{byCategory("B.").map(connectorCard)}</div>
      </section>

      <section aria-label="Research data" className="gov-panel space-y-3 p-5">
        <div className="flex items-center gap-2.5">
          <FlaskConical className="h-5 w-5 text-amber-300" />
          <div>
            <h2 className="text-xl font-bold text-slate-100">C. ML / Research Data</h2>
            <p className="text-xs text-slate-400">{(registry as { policy: string }).policy} <Link href="/gov/ml" className="text-teal-300 underline">ML Intelligence</Link></p>
          </div>
        </div>
        <div className="grid gap-3 md:grid-cols-2">{byCategory("C.").map(connectorCard)}</div>
        <article className="rounded-xl border border-amber-400/25 bg-amber-400/5 p-4 text-xs leading-relaxed text-slate-400">
          <p className="font-bold text-slate-200">UCI Phishing Websites (id 327) — offline benchmark</p>
          <p className="mt-1">Source: {(uciEntry as { source_name: string }).source_name} · DOI {(uciEntry as { citation_doi: string }).citation_doi} · License {(uciEntry as { license: string }).license} · 11,055 rows staged, 0 rejected. Reproduce via scripts/gov-datasets/import-uci-phishing-327.mjs. Never training input (no URL strings), never cases.</p>
        </article>
      </section>

      <section aria-label="Disconnected sources" className="gov-panel space-y-3 p-5">
        <div className="flex items-center gap-2.5">
          <Landmark className="h-5 w-5 text-slate-500" />
          <div>
            <h2 className="text-xl font-bold text-slate-100">D. Disconnected / Pending Sources</h2>
            <p className="text-xs text-slate-400">Disabled connectors with exact reasons — never shown as live anywhere.</p>
          </div>
        </div>
        <div className="grid gap-3 md:grid-cols-2">{byCategory("D.").map(connectorCard)}</div>
      </section>
    </div>
  );
}
