"use client";

import React, { useState } from "react";
import Link from "next/link";
import { clsx } from "clsx";
import { AlertTriangle, FlaskConical } from "lucide-react";
import modelJson from "@/docs/ml/url-risk-v1/model.json";
import evaluationJson from "@/docs/ml/url-risk-v1/evaluation.json";
import metadataJson from "@/docs/ml/url-risk-v1/training-metadata.json";
import { scoreUrlModel } from "@/lib/gov/ml/urlRiskModel";

interface Evaluation {
  accuracy: number;
  precision_malicious: number;
  recall_malicious: number;
  f1_malicious: number;
  confusion_matrix: { tn: number; fp: number; fn: number; tp: number };
  test_size: number;
  note: string;
  ood_check: { corpus: string; n: number; "flagged_at_0.5": number; flag_rate: number; interpretation: string };
}

interface Metadata {
  version: string;
  trained_at: string;
  random_state: number;
  status: string;
  corpus: Record<string, unknown>;
  split: string;
  algorithm: string;
  limitations: string[];
}

const EVAL = evaluationJson as Evaluation;
const META = metadataJson as Metadata;
const MODEL = modelJson as { version: string; threshold: number };

/**
 * ML Intelligence (DOMAIN C + inference transparency, PART 7-9).
 * Experimental model card, live client-side scoring demo, OOD evidence,
 * and the analyst-review contract. Nothing here is a verdict.
 */
export function GovMlWorkspace() {
  const [demoUrl, setDemoUrl] = useState("http://176.65.139.229/x86_64/setup.exe");
  const [demo, setDemo] = useState(() => scoreUrlModel("http://176.65.139.229/x86_64/setup.exe"));

  return (
    <div className="space-y-5">
      <section aria-label="Model status" className="gov-panel space-y-4 p-5">
        <div className="flex items-center gap-2.5">
          <FlaskConical className="h-5 w-5 text-fuchsia-300" />
          <div>
            <h2 className="text-xl font-bold text-slate-100">ML Intelligence</h2>
            <p className="text-xs text-slate-400">Experimental assistance · every output is a suggestion needing analyst review</p>
          </div>
          <span className="ml-auto rounded-full bg-amber-400/10 px-3 py-1 font-mono text-[10px] font-bold uppercase tracking-widest text-amber-200">
            {META.status}
          </span>
        </div>

        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
          {[
            ["Model", MODEL.version],
            ["Trained", new Date(META.trained_at).toLocaleString("en-IN")],
            ["Threshold", String(MODEL.threshold)],
            ["Test size", String(EVAL.test_size)],
          ].map(([k, v]) => (
            <div key={k} className="rounded-xl border border-slate-800 bg-slate-900/40 p-3">
              <p className="text-xs text-slate-500">{k}</p>
              <p className="mt-1 font-mono text-sm font-bold text-slate-100">{v}</p>
            </div>
          ))}
        </div>

        <div className="grid gap-4 lg:grid-cols-2">
          <article className="rounded-xl border border-slate-800 bg-slate-900/40 p-4">
            <h3 className="text-sm font-bold text-slate-100">Held-out evaluation (same-distribution)</h3>
            <dl className="mt-2 grid grid-cols-2 gap-2 font-mono text-xs">
              <div><dt className="text-slate-500">Accuracy</dt><dd className="text-lg text-slate-100">{EVAL.accuracy}</dd></div>
              <div><dt className="text-slate-500">F1 malicious</dt><dd className="text-lg text-slate-100">{EVAL.f1_malicious}</dd></div>
              <div><dt className="text-slate-500">Precision</dt><dd className="text-slate-100">{EVAL.precision_malicious}</dd></div>
              <div><dt className="text-slate-500">Recall</dt><dd className="text-slate-100">{EVAL.recall_malicious}</dd></div>
            </dl>
            <p className="mt-2 font-mono text-[11px] text-slate-500">
              Confusion — TN {EVAL.confusion_matrix.tn} · FP {EVAL.confusion_matrix.fp} · FN {EVAL.confusion_matrix.fn} · TP {EVAL.confusion_matrix.tp}
            </p>
            <p className="mt-1 text-[11px] text-slate-600">{EVAL.note}</p>
          </article>
          <article className="rounded-xl border border-amber-400/30 bg-amber-400/5 p-4">
            <h3 className="flex items-center gap-1.5 text-sm font-bold text-amber-200">
              <AlertTriangle className="h-4 w-4" /> Out-of-distribution probe (why test accuracy misleads)
            </h3>
            <p className="mt-2 font-mono text-2xl font-bold text-amber-100">{(EVAL.ood_check.flag_rate * 100).toFixed(1)}%</p>
            <p className="mt-1 text-xs leading-relaxed text-slate-400">
              Only {EVAL.ood_check["flagged_at_0.5"]} of {EVAL.ood_check.n} reporter-tagged phishing URLs score
              above threshold. {EVAL.ood_check.interpretation}
            </p>
          </article>
        </div>

        <details className="rounded-xl border border-slate-800 bg-slate-900/40 p-4">
          <summary className="cursor-pointer text-xs font-bold text-slate-200">Training corpus, algorithm, limitations</summary>
          <dl className="mt-2 grid grid-cols-1 gap-1.5 text-xs sm:grid-cols-2">
            {Object.entries(META.corpus).map(([k, v]) => (
              <div key={k} className="flex gap-2">
                <dt className="w-36 shrink-0 font-mono uppercase text-slate-500">{k.replaceAll("_", " ")}</dt>
                <dd className="break-words font-mono text-slate-300">{String(v).slice(0, 120)}</dd>
              </div>
            ))}
            <div className="flex gap-2"><dt className="w-36 shrink-0 font-mono uppercase text-slate-500">Split</dt><dd className="font-mono text-slate-300">{META.split}</dd></div>
            <div className="flex gap-2"><dt className="w-36 shrink-0 font-mono uppercase text-slate-500">Algorithm</dt><dd className="font-mono text-slate-300">{META.algorithm}</dd></div>
          </dl>
          <ul className="mt-2 list-disc space-y-1 pl-5 text-xs leading-relaxed text-slate-400">
            {META.limitations.map((l) => <li key={l.slice(0, 40)}>{l}</li>)}
          </ul>
        </details>
      </section>

      <section aria-label="Live scoring demo" className="gov-panel space-y-3 p-5">
        <h3 className="text-sm font-bold text-slate-100">Live scoring demo (runs in your browser, nothing is uploaded)</h3>
        <div className="flex gap-2">
          <input
            value={demoUrl}
            onChange={(e) => { setDemoUrl(e.target.value); setDemo(scoreUrlModel(e.target.value)); }}
            maxLength={2048}
            placeholder="Paste a URL to score"
            aria-label="URL to score"
            className="min-w-0 flex-1 rounded-lg border border-slate-700/60 bg-slate-950 px-3 py-2 font-mono text-xs text-slate-100"
          />
        </div>
        {!demo ? (
          <p className="text-xs text-slate-500">Enter a parseable http(s) URL.</p>
        ) : (
          <div className="rounded-xl border border-slate-800 bg-slate-900/40 p-4 text-xs">
            <p className="flex flex-wrap items-center gap-2">
              <span className={clsx(
                "rounded-full px-2.5 py-1 font-mono text-[11px] font-bold",
                demo.aboveThreshold ? "bg-rose-400/10 text-rose-300" : "bg-emerald-400/10 text-emerald-300",
              )}>
                Model suggestion: {demo.aboveThreshold ? "MALICIOUS" : "LEGITIMATE"} · score {demo.score.toFixed(3)} (uncalibrated)
              </span>
              <span className="rounded-full bg-slate-700/40 px-2.5 py-1 font-mono text-[11px] font-bold text-slate-300">
                Rules: {demo.rules.band} ({demo.rules.score})
              </span>
              <span className="rounded-full bg-amber-400/10 px-2.5 py-1 font-mono text-[11px] font-bold text-amber-200">
                {demo.reviewState.replaceAll("_", " ")}
              </span>
            </p>
            <p className="mt-2 text-slate-400">Rule signals: {demo.rules.signals.map((s) => `${s.code}(${s.points})`).join(", ") || "none"}</p>
            <p className="mt-1 text-slate-600">Model {demo.version} · threshold 0.5 · not a final investigative conclusion. Record reviews on the External Intelligence page (audit-backed).</p>
          </div>
        )}
        <p className="text-center text-xs text-slate-600">
          Review workflow: <Link href="/gov/external" className="text-teal-300 underline">External Intelligence</Link> · research benchmark: <Link href="/gov/sources" className="text-teal-300 underline">Data Sources</Link>
        </p>
      </section>
    </div>
  );
}
