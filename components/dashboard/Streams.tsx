"use client";

import React from "react";
import Link from "next/link";
import {
  Search,
  Lock,
  Radio,
  CheckCircle2,
  Circle,
  ArrowUpRight,
} from "lucide-react";
import { ThreatBadge } from "@/components/ThreatBadge";
import { ActivityEntry, ActivityKind, ReadinessItem, relativeTime } from "@/lib/safetyScore";

const KIND_META: Record<
  ActivityKind,
  { icon: React.ReactNode; label: string }
> = {
  SCAN: {
    icon: <Search className="w-3.5 h-3.5 text-emergency-400" />,
    label: "Message Screened",
  },
  EVIDENCE: {
    icon: <Lock className="w-3.5 h-3.5 text-emergency-400" />,
    label: "Evidence Vaulted",
  },
  SOS: {
    icon: <Radio className="w-3.5 h-3.5 text-red-400" />,
    label: "Location Shared",
  },
};

/* ---------------------------- activity feed -------------------------- */

export const ActivityFeed: React.FC<{ entries: ActivityEntry[] }> = ({
  entries,
}) => {
  if (entries.length === 0) {
    return (
      <p className="text-xs text-slate-500 py-6 text-center">
        No activity recorded yet. Screening a message, vaulting evidence or
        sharing a live location will appear here.
      </p>
    );
  }

  return (
    <ol className="space-y-3">
      {entries.map((entry) => {
        const meta = KIND_META[entry.kind];
        return (
          <li key={entry.id}>
            {entry.href ? (
              <Link
                href={entry.href}
                className="block p-3.5 rounded-xl bg-slate-900/70 border border-slate-800 hover:border-emergency-700/40 transition space-y-2 text-xs group"
              >
                <div className="flex items-center justify-between gap-3">
                  <span className="flex items-center gap-1.5 text-slate-400 text-[11px]">
                    {meta.icon}
                    <span>{meta.label}</span>
                  </span>
                  <span className="flex items-center gap-2 shrink-0">
                    {entry.severity && (
                      <ThreatBadge severity={entry.severity} size="sm" />
                    )}
                    <span className="text-[10px] text-slate-500 font-mono">
                      {relativeTime(entry.timestamp)}
                    </span>
                  </span>
                </div>

                <p className="text-slate-200 font-medium leading-snug break-words">
                  {entry.kind === "SCAN" ? `"${entry.title}"` : entry.title}
                </p>

                <p className="text-[11px] text-slate-500 break-words">
                  {entry.subtitle}
                </p>
              </Link>
            ) : (
              <div className="block p-3.5 rounded-xl bg-slate-900/70 border border-slate-800 transition space-y-2 text-xs group">
                <div className="flex items-center justify-between gap-3">
                  <span className="flex items-center gap-1.5 text-slate-400 text-[11px]">
                    {meta.icon}
                    <span>{meta.label}</span>
                  </span>
                  <span className="flex items-center gap-2 shrink-0">
                    {entry.severity && (
                      <ThreatBadge severity={entry.severity} size="sm" />
                    )}
                    <span className="text-[10px] text-slate-500 font-mono">
                      {relativeTime(entry.timestamp)}
                    </span>
                  </span>
                </div>

                <p className="text-slate-200 font-medium leading-snug break-words">
                  {entry.kind === "SCAN" ? `"${entry.title}"` : entry.title}
                </p>

                <p className="text-[11px] text-slate-500 break-words">
                  {entry.subtitle}
                </p>
              </div>
            )}
          </li>
        );
      })}
    </ol>
  );
};

/* -------------------------- readiness checklist ---------------------- */

export const ReadinessList: React.FC<{ items: ReadinessItem[] }> = ({
  items,
}) => {
  const done = items.filter((i) => i.done).length;

  return (
    <div className="space-y-3">
      <div className="flex items-baseline justify-between">
        <h3 className="text-xs font-bold text-slate-200 uppercase tracking-wider">
          Readiness Checklist
        </h3>
        <span className="text-[11px] font-mono text-slate-400 tabular-nums">
          {done}/{items.length}
        </span>
      </div>

      <ul className="space-y-2.5">
        {items.map((item) => (
          <li key={item.id} className="flex items-start gap-2.5 text-xs">
            {item.done ? (
              <CheckCircle2
                className="w-4 h-4 text-emerald-400 shrink-0 mt-0.5"
                aria-label="Complete"
              />
            ) : (
              <Circle
                className="w-4 h-4 text-slate-600 shrink-0 mt-0.5"
                aria-label="Incomplete"
              />
            )}
            <span className="min-w-0">
              <span
                className={item.done ? "text-slate-300" : "text-slate-200 font-medium"}
              >
                {item.label}
              </span>
              <span className="block text-[11px] text-slate-500">
                {item.detail}
                {!item.done && item.href && (
                  <Link
                    href={item.href}
                    className="ml-1.5 text-emergency-300 hover:underline inline-flex items-center gap-0.5"
                  >
                    Fix
                    <ArrowUpRight className="w-3 h-3" />
                  </Link>
                )}
              </span>
            </span>
          </li>
        ))}
      </ul>
    </div>
  );
};
