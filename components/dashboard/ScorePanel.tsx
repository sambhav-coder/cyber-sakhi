"use client";

import React from "react";
import Link from "next/link";
import { ArrowUpRight, ShieldCheck, Info } from "lucide-react";
import { PillarStatus, SafetyScoreResult } from "@/lib/safetyScore";

/* Status tokens. Reserved for good/warning/serious/critical, never reused
 * as a series colour, and always shipped beside a text label. */
const STATUS_COLOR: Record<PillarStatus, string> = {
  GOOD: "#34d399", // emerald-400
  WARNING: "#fbbf24", // amber-400
  SERIOUS: "#fb923c", // orange-400
  CRITICAL: "#f87171", // red-400
};

const STATUS_TEXT: Record<PillarStatus, string> = {
  GOOD: "text-emerald-300",
  WARNING: "text-amber-300",
  SERIOUS: "text-orange-300",
  CRITICAL: "text-red-300",
};

const STATUS_LABEL: Record<PillarStatus, string> = {
  GOOD: "Good",
  WARNING: "Needs Attention",
  SERIOUS: "Weak",
  CRITICAL: "Critical",
};

function bandStatus(score: number): PillarStatus {
  if (score >= 85) return "GOOD";
  if (score >= 70) return "WARNING";
  if (score >= 50) return "SERIOUS";
  return "CRITICAL";
}

/* ------------------------------ the ring ----------------------------- */

const ScoreRing: React.FC<{ score: number; status: PillarStatus }> = ({
  score,
  status,
}) => {
  const r = 44;
  const circumference = 2 * Math.PI * r;
  const filled = (score / 100) * circumference;

  return (
    <svg
      viewBox="0 0 110 110"
      className="w-28 h-28 shrink-0"
      role="img"
      aria-label={`Safety index ${score} out of 100`}
    >
      <circle
        cx="55"
        cy="55"
        r={r}
        fill="none"
        stroke="rgba(148, 163, 184, 0.14)"
        strokeWidth="8"
      />
      <circle
        cx="55"
        cy="55"
        r={r}
        fill="none"
        stroke={STATUS_COLOR[status]}
        strokeWidth="8"
        strokeLinecap="round"
        strokeDasharray={`${filled} ${circumference - filled}`}
        transform="rotate(-90 55 55)"
        style={{ transition: "stroke-dasharray 700ms ease-out" }}
      />
      <text
        x="55"
        y="55"
        textAnchor="middle"
        className="fill-white"
        style={{ fontSize: 26, fontWeight: 900, fontVariantNumeric: "tabular-nums" }}
      >
        {score}
      </text>
      <text
        x="55"
        y="72"
        textAnchor="middle"
        className="fill-slate-500"
        style={{ fontSize: 9, letterSpacing: "0.08em" }}
      >
        / 100
      </text>
    </svg>
  );
};

/* --------------------------- the whole panel ------------------------- */

interface ScorePanelProps {
  result: SafetyScoreResult;
}

export const ScorePanel: React.FC<ScorePanelProps> = ({ result }) => {
  const status = bandStatus(result.score);
  const weakest = [...result.pillars].sort(
    (a, b) => a.earned / a.max - b.earned / b.max
  )[0];

  return (
    <div className="p-6 rounded-3xl glass-panel border-emergency-800/30 space-y-6">
      <div className="flex flex-col sm:flex-row items-start sm:items-center gap-5">
        <ScoreRing score={result.score} status={status} />

        <div className="space-y-2 min-w-0">
          <div className="flex flex-wrap items-center gap-2">
            <h2 className="text-xl font-bold text-white">
              Safety Posture: {result.bandLabel}
            </h2>
            <span
              className={`text-[11px] px-2.5 py-0.5 rounded-full border font-semibold ${STATUS_TEXT[status]}`}
              style={{ borderColor: `${STATUS_COLOR[status]}66` }}
            >
              {result.band}
            </span>
          </div>
          <p className="text-xs text-slate-400 leading-relaxed max-w-xl">
            Computed live from your own records across five weighted pillars.
            Nothing here is a fixed number, so the index moves as your contacts,
            vault and threat traffic change.
          </p>
          {weakest.action && (
            <p className="text-xs text-slate-300 flex items-start gap-1.5">
              <Info className="w-3.5 h-3.5 mt-0.5 text-emergency-400 shrink-0" />
              <span>
                Biggest Single Gain:{" "}
                <Link
                  href={weakest.href ?? "/dashboard"}
                  className="text-emergency-300 hover:underline font-medium"
                >
                  {weakest.action}
                </Link>{" "}
                <span className="text-slate-500">
                  (+{weakest.max - weakest.earned} pts available)
                </span>
              </span>
            </p>
          )}
        </div>
      </div>

      <div className="space-y-4 pt-1 border-t border-slate-800/80">
        <h3 className="text-xs font-bold text-slate-200 uppercase tracking-wider flex items-center gap-2 pt-4">
          <ShieldCheck className="w-4 h-4 text-emergency-400" />
          <span>Safety Index Breakdown</span>
        </h3>

        <div className="space-y-4">
          {result.pillars.map((pillar) => {
            const pct = (pillar.earned / pillar.max) * 100;
            return (
              <div key={pillar.key} className="space-y-1.5">
                <div className="flex items-baseline justify-between gap-3 text-xs">
                  <span className="text-slate-200 font-medium">{pillar.label}</span>
                  <span className="font-mono text-slate-400 tabular-nums shrink-0">
                    {pillar.earned}
                    <span className="text-slate-600">/{pillar.max}</span>
                  </span>
                </div>

                <div
                  className="w-full h-2 rounded-full overflow-hidden"
                  style={{ background: "rgba(148, 163, 184, 0.14)" }}
                >
                  <div
                    className="h-full rounded-full transition-[width] duration-700"
                    style={{
                      width: `${pct}%`,
                      background: STATUS_COLOR[pillar.status],
                    }}
                  />
                </div>

                <div className="flex flex-wrap items-center gap-x-2 gap-y-1 text-[11px]">
                  <span className={`font-semibold ${STATUS_TEXT[pillar.status]}`}>
                    {STATUS_LABEL[pillar.status]}
                  </span>
                  <span className="text-slate-500">·</span>
                  <span className="text-slate-400">{pillar.detail}</span>
                  {pillar.action && pillar.href && (
                    <Link
                      href={pillar.href}
                      className="text-emergency-300 hover:underline inline-flex items-center gap-0.5"
                    >
                      {pillar.action}
                      <ArrowUpRight className="w-3 h-3" />
                    </Link>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
};
