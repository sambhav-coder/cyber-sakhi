"use client";

import React, { useState } from "react";
import { AlertOctagon } from "lucide-react";
import { DistributionSlice, TrendDay } from "@/lib/safetyScore";

/* ------------------------------------------------------------------ *
 * Chart primitives for the safety dashboard.
 *
 * Colour rules followed here:
 *  - Volume is one series, so it gets ONE hue (sakhi-500). No rainbow,
 *    and no darker-where-bigger ramp on top of bar length.
 *  - Red is reserved for status ("this day contained a severe threat")
 *    and never ships as colour alone: it carries a legend entry with an
 *    icon, plus the count in the tooltip.
 *  - Values and labels wear text colours, never the series colour.
 * ------------------------------------------------------------------ */

const SERIES = "#38bdf8"; // sakhi-500 — the single volume hue
const SEVERE = "#f87171"; // red-400 — status only
const TRACK = "rgba(148, 163, 184, 0.14)";
const RULE = "rgba(148, 163, 184, 0.18)";

/* ------------------------------ stat tile ---------------------------- */

interface StatTileProps {
  label: string;
  value: React.ReactNode;
  sub?: string;
  icon: React.ReactNode;
  tone?: "neutral" | "alert" | "good";
}

export const StatTile: React.FC<StatTileProps> = ({
  label,
  value,
  sub,
  icon,
  tone = "neutral",
}) => {
  const valueTone =
    tone === "alert"
      ? "text-red-400"
      : tone === "good"
      ? "text-emerald-400"
      : "text-sky-300";

  const subTone =
    tone === "alert"
      ? "text-red-300/80"
      : tone === "good"
      ? "text-emerald-400/80"
      : "text-slate-400";

  return (
    <div className="p-5 rounded-2xl glass-card space-y-1 border-emergency-900/25">
      <div className="flex items-center justify-between text-xs text-slate-400">
        <span>{label}</span>
        {icon}
      </div>
      <div className={`text-2xl font-black font-mono ${valueTone}`}>
        {value}
      </div>
      {sub && <div className={`text-[11px] ${subTone}`}>{sub}</div>}
    </div>
  );
};

/* ---------------------------- trend chart ---------------------------- */

/** Path for a bar with rounded top corners, square where it meets the axis. */
function roundedTopBar(x: number, y: number, w: number, h: number, r: number) {
  const radius = Math.min(r, w / 2, h);
  return [
    `M ${x} ${y + h}`,
    `L ${x} ${y + radius}`,
    `Q ${x} ${y} ${x + radius} ${y}`,
    `L ${x + w - radius} ${y}`,
    `Q ${x + w} ${y} ${x + w} ${y + radius}`,
    `L ${x + w} ${y + h}`,
    "Z",
  ].join(" ");
}

interface TrendChartProps {
  days: TrendDay[];
}

export const TrendChart: React.FC<TrendChartProps> = ({ days }) => {
  const [hovered, setHovered] = useState<number | null>(null);

  const W = 560;
  const H = 150;
  const padX = 6;
  const plotTop = 18;
  const plotBottom = 116;
  const plotH = plotBottom - plotTop;
  const plotW = W - padX * 2;
  const slot = plotW / days.length;
  const barW = Math.max(8, slot - 8);

  const max = Math.max(1, ...days.map((d) => d.total));
  const totalScans = days.reduce((sum, d) => sum + d.total, 0);
  const severeDays = days.filter((d) => d.severe > 0).length;
  const peakIndex = days.reduce(
    (best, d, i) => (d.total > days[best].total ? i : best),
    0
  );

  const active = hovered === null ? null : days[hovered];

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div className="flex items-center gap-4 text-[11px] text-slate-400">
          <span className="flex items-center gap-1.5">
            <span
              className="w-2.5 h-2.5 rounded-sm"
              style={{ background: SERIES }}
              aria-hidden
            />
            <span>Messages screened</span>
          </span>
          <span className="flex items-center gap-1.5">
            <AlertOctagon className="w-3 h-3" style={{ color: SEVERE }} aria-hidden />
            <span>Day contained a high or critical threat</span>
          </span>
        </div>
        <span className="text-[11px] text-slate-400 font-mono">
          {totalScans} scans · {severeDays} severe day{severeDays === 1 ? "" : "s"}
        </span>
      </div>

      <div className="relative">
        <svg
          viewBox={`0 0 ${W} ${H}`}
          className="w-full h-auto"
          role="img"
          aria-label={`Daily message screening volume over the last ${days.length} days. ${totalScans} scans in total, ${severeDays} days containing a high or critical threat.`}
        >
          {/* recessive chrome: one hairline baseline, one at the maximum */}
          <line
            x1={padX}
            y1={plotTop}
            x2={W - padX}
            y2={plotTop}
            stroke={RULE}
            strokeWidth="1"
            strokeDasharray=""
            opacity="0.5"
          />
          <line
            x1={padX}
            y1={plotBottom}
            x2={W - padX}
            y2={plotBottom}
            stroke={RULE}
            strokeWidth="1"
          />

          {days.map((day, i) => {
            const x = padX + i * slot + (slot - barW) / 2;
            const h = day.total === 0 ? 2 : (day.total / max) * plotH;
            const y = plotBottom - h;
            const isHovered = hovered === i;

            return (
              <g key={day.date}>
                {day.total === 0 ? (
                  <rect x={x} y={plotBottom - 2} width={barW} height={2} fill={TRACK} />
                ) : (
                  <path
                    d={roundedTopBar(x, y, barW, h, 4)}
                    fill={SERIES}
                    opacity={hovered === null || isHovered ? 1 : 0.45}
                  />
                )}

                {day.severe > 0 && (
                  <circle cx={x + barW / 2} cy={y - 7} r="3" fill={SEVERE} />
                )}

                {/* full-height hit target, larger than the mark itself */}
                <rect
                  x={padX + i * slot}
                  y={plotTop - 12}
                  width={slot}
                  height={plotBottom - plotTop + 12}
                  fill="transparent"
                  onMouseEnter={() => setHovered(i)}
                  onMouseLeave={() => setHovered(null)}
                />
              </g>
            );
          })}

          {/* direct-label the peak only, never every bar */}
          {max > 0 && days[peakIndex].total > 0 && (
            <text
              x={padX + peakIndex * slot + slot / 2}
              y={plotBottom - (days[peakIndex].total / max) * plotH - 16}
              textAnchor="middle"
              className="fill-slate-400"
              style={{ fontSize: 11, fontVariantNumeric: "tabular-nums" }}
            >
              {days[peakIndex].total}
            </text>
          )}

          {/* first, middle and last date only — no crowded axis */}
          {[0, Math.floor(days.length / 2), days.length - 1].map((i) => (
            <text
              key={`ax_${i}`}
              x={padX + i * slot + slot / 2}
              y={plotBottom + 20}
              textAnchor="middle"
              className="fill-slate-500"
              style={{ fontSize: 10 }}
            >
              {days[i].fullLabel}
            </text>
          ))}
        </svg>

        {active && (
          <div
            className="pointer-events-none absolute -top-1 z-10 px-3 py-2 rounded-lg bg-slate-950 border border-slate-700 shadow-xl text-[11px] whitespace-nowrap"
            style={{
              left: `${((hovered! + 0.5) / days.length) * 100}%`,
              transform: "translate(-50%, -100%)",
            }}
          >
            <div className="font-semibold text-slate-100">{active.fullLabel}</div>
            <div className="text-slate-400">
              {active.total} message{active.total === 1 ? "" : "s"} screened
            </div>
            {active.severe > 0 && (
              <div className="flex items-center gap-1" style={{ color: SEVERE }}>
                <AlertOctagon className="w-3 h-3" aria-hidden />
                <span>
                  {active.severe} high/critical · peak {active.peak}
                </span>
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
};

/* ------------------------- distribution bars ------------------------- */

interface DistributionBarsProps {
  slices: DistributionSlice[];
}

export const DistributionBars: React.FC<DistributionBarsProps> = ({ slices }) => {
  const top = slices[0]?.pct ?? 0;

  return (
    <div className="space-y-3">
      {slices.map((slice) => (
        <div key={slice.key} className="space-y-1.5">
          <div className="flex justify-between items-baseline gap-3 text-xs">
            <span className="text-slate-300">{slice.label}</span>
            <span className="font-mono text-slate-400 tabular-nums">
              {slice.pct}%
            </span>
          </div>
          <div
            className="w-full h-2 rounded-full overflow-hidden"
            style={{ background: TRACK }}
            role="img"
            aria-label={`${slice.label}: ${slice.pct} percent of detected risk`}
          >
            <div
              className="h-full rounded-full transition-[width] duration-500"
              style={{
                width: `${top === 0 ? 0 : (slice.pct / top) * 100}%`,
                background: SERIES,
              }}
            />
          </div>
        </div>
      ))}
      <p className="text-[11px] text-slate-500 pt-1">
        Share of total risk weight across all screened messages. Bars are scaled
        against the largest category.
      </p>
    </div>
  );
};
