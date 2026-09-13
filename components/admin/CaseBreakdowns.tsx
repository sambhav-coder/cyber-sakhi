"use client";

import React, { useMemo } from "react";
import { BarChart3 } from "lucide-react";
import type { LedgerRow } from "./CaseLedger";

/* ------------------------------------------------------------------ *
 * Case breakdowns.
 *
 * The live overview API already returns bySeverity / byStatus /
 * byThreatType, so those are used directly when present. In the seeded
 * fallback they are derived from the rows instead, so the panel looks
 * the same either way.
 *
 * One hue per chart: bar length already encodes the count, so colouring
 * each bar differently would spend the only free channel on information
 * the chart is already showing. Counts stay in text colours.
 * ------------------------------------------------------------------ */

const SERIES = "#ef4444";
const TRACK = "rgba(148, 163, 184, 0.14)";

interface Props {
  bySeverity?: Record<string, number>;
  byStatus?: Record<string, number>;
  byThreatType?: Record<string, number>;
  rows: LedgerRow[];
}

function tally(values: string[]): Record<string, number> {
  const out: Record<string, number> = {};
  for (const v of values) {
    const key = (v || "unknown").toUpperCase();
    out[key] = (out[key] || 0) + 1;
  }
  return out;
}

function pretty(label: string): string {
  return label.replace(/_/g, " ").toLowerCase();
}

const Breakdown: React.FC<{ title: string; data: Record<string, number> }> = ({
  title,
  data,
}) => {
  const entries = Object.entries(data).sort((a, b) => b[1] - a[1]);
  const max = Math.max(1, ...entries.map(([, n]) => n));
  const total = entries.reduce((s, [, n]) => s + n, 0);

  return (
    <div className="space-y-3">
      <h3 className="text-[11px] font-bold text-slate-300 uppercase tracking-wider">
        {title}
      </h3>

      {entries.length === 0 ? (
        <p className="text-[11px] text-slate-500">No data.</p>
      ) : (
        <ul className="space-y-2.5">
          {entries.map(([label, count]) => (
            <li key={label} className="space-y-1">
              <div className="flex justify-between items-baseline gap-3 text-xs">
                <span className="text-slate-300 capitalize truncate">
                  {pretty(label)}
                </span>
                <span className="font-mono text-slate-400 tabular-nums shrink-0">
                  {count}
                  <span className="text-slate-600">
                    {" "}
                    · {Math.round((count / total) * 100)}%
                  </span>
                </span>
              </div>
              <div
                className="w-full h-2 rounded-full overflow-hidden"
                style={{ background: TRACK }}
                role="img"
                aria-label={`${pretty(label)}: ${count} cases`}
              >
                <div
                  className="h-full rounded-full transition-[width] duration-500"
                  style={{ width: `${(count / max) * 100}%`, background: SERIES }}
                />
              </div>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
};

export const CaseBreakdowns: React.FC<Props> = ({
  bySeverity,
  byStatus,
  byThreatType,
  rows,
}) => {
  const severity = useMemo(
    () => bySeverity ?? tally(rows.map((r) => r.severity)),
    [bySeverity, rows]
  );
  const status = useMemo(
    () => byStatus ?? tally(rows.map((r) => r.status)),
    [byStatus, rows]
  );
  const threatType = useMemo(
    () => byThreatType ?? tally(rows.map((r) => r.threatType)),
    [byThreatType, rows]
  );

  return (
    <div className="p-6 rounded-2xl glass-panel border-emergency-900/30 space-y-5">
      <h2 className="text-sm font-bold text-white uppercase tracking-wider flex items-center gap-2">
        <BarChart3 className="w-4 h-4 text-emergency-400" />
        <span>Case Breakdown</span>
      </h2>

      <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
        <Breakdown title="By severity" data={severity} />
        <Breakdown title="By status" data={status} />
        <Breakdown title="By threat type" data={threatType} />
      </div>
    </div>
  );
};
