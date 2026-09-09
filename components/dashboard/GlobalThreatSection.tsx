"use client";

import React, { useCallback, useEffect, useMemo, useState } from "react";
import {
  Globe2,
  RefreshCw,
  Info,
  AlertTriangle,
  Users,
  MapPin,
  X,
} from "lucide-react";
import {
  ALL_CATEGORIES,
  CATEGORY_LABELS,
  CHOROPLETH_STEPS,
  GlobalSnapshot,
} from "@/lib/globalThreatData";
import { relativeTime } from "@/lib/safetyScore";
import { WorldThreatMap } from "./WorldThreatMap";

const SERIES = "#38bdf8";
const TRACK = "rgba(148, 163, 184, 0.14)";

export const GlobalThreatSection: React.FC = () => {
  const [snapshot, setSnapshot] = useState<GlobalSnapshot | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [selectedIso, setSelectedIso] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch("/api/global-threats", { cache: "no-store" });
      if (!res.ok) throw new Error(`Request failed with ${res.status}`);
      setSnapshot((await res.json()) as GlobalSnapshot);
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  const selected = useMemo(
    () => snapshot?.countries.find((c) => c.iso === selectedIso) ?? null,
    [snapshot, selectedIso]
  );

  const top10 = useMemo(
    () =>
      snapshot
        ? [...snapshot.countries]
            .sort((a, b) => b.perMillionOnline - a.perMillionOnline)
            .slice(0, 10)
        : [],
    [snapshot]
  );

  const header = (
    <div className="flex flex-col sm:flex-row sm:items-start justify-between gap-3">
      <div className="space-y-1.5">
        <h3 className="text-xs font-bold text-slate-200 uppercase tracking-wider flex items-center gap-2">
          <Globe2 className="w-4 h-4 text-emergency-400" />
          <span>Global Threat Landscape</span>
        </h3>
        {snapshot && (
          <div className="flex flex-wrap items-center gap-2">
            <span className="text-[10px] px-2 py-0.5 rounded-full bg-amber-950/70 border border-amber-600/40 text-amber-300 font-bold uppercase tracking-wide">
              {snapshot.provenance.headline}
            </span>
            <span className="text-[11px] text-slate-500">
              {snapshot.windowDays}-day window · fetched{" "}
              {relativeTime(snapshot.generatedAt)}
            </span>
          </div>
        )}
      </div>

      <button
        onClick={load}
        disabled={loading}
        className="px-3.5 py-2 rounded-lg bg-slate-900 hover:bg-slate-800 border border-slate-700 text-slate-300 text-[11px] font-semibold transition flex items-center gap-1.5 shrink-0 disabled:opacity-50"
      >
        <RefreshCw className={`w-3.5 h-3.5 ${loading ? "animate-spin" : ""}`} />
        <span>{loading ? "Fetching…" : "Refresh"}</span>
      </button>
    </div>
  );

  if (error) {
    return (
      <div className="p-6 rounded-2xl glass-panel border-red-900/40 space-y-4">
        {header}
        <div className="py-6 text-center space-y-2">
          <AlertTriangle className="w-6 h-6 text-red-400 mx-auto" />
          <p className="text-xs text-slate-400">
            Could not load the global snapshot: {error}
          </p>
          <button
            onClick={load}
            className="px-4 py-2 rounded-lg bg-emergency-600 hover:bg-emergency-500 text-white text-xs font-bold"
          >
            Try again
          </button>
        </div>
      </div>
    );
  }

  if (!snapshot) {
    return (
      <div className="p-6 rounded-2xl glass-panel border-emergency-900/30 space-y-4">
        {header}
        <div className="h-[320px] rounded-2xl bg-slate-900/50 animate-pulse" />
      </div>
    );
  }

  const maxPerMillion = top10[0]?.perMillionOnline ?? 1;

  return (
    <div className="p-6 rounded-2xl glass-panel border-emergency-900/30 space-y-5">
      {header}

      {/* Provenance — stated on the surface, not buried in a tooltip */}
      <div className="flex items-start gap-2 p-3 rounded-xl bg-amber-950/20 border border-amber-900/40">
        <Info className="w-3.5 h-3.5 text-amber-400 mt-0.5 shrink-0" />
        <p className="text-[11px] text-slate-400 leading-relaxed">
          {snapshot.provenance.detail}
        </p>
      </div>

      {/* Totals */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
        {[
          {
            label: "Reports in Window",
            value: snapshot.totals.reports.toLocaleString("en-IN"),
            icon: <AlertTriangle className="w-4 h-4 text-orange-400" />,
          },
          {
            label: "Countries Covered",
            value: snapshot.totals.countries,
            icon: <MapPin className="w-4 h-4 text-emergency-400" />,
          },
          {
            label: "Online Population",
            value: `${(snapshot.totals.onlineUsersMillions / 1000).toFixed(2)}B`,
            icon: <Users className="w-4 h-4 text-sky-400" />,
          },
          {
            label: "Rated Severe",
            value: `${snapshot.totals.criticalShare}%`,
            icon: <Globe2 className="w-4 h-4 text-emerald-400" />,
          },
        ].map((tile) => (
          <div
            key={tile.label}
            className="p-4 rounded-xl bg-slate-900/60 border border-slate-800 space-y-1"
          >
            <div className="flex items-center justify-between text-[11px] text-slate-400">
              <span>{tile.label}</span>
              {tile.icon}
            </div>
            <div className="text-xl font-black text-sky-300 font-mono">
              {tile.value}
            </div>
          </div>
        ))}
      </div>

      {/* The map */}
      <WorldThreatMap
        countries={snapshot.countries}
        selectedIso={selectedIso}
        onSelect={setSelectedIso}
      />

      {/* Selected country detail */}
      {selected && (
        <div className="p-4 rounded-xl bg-slate-900/70 border border-emergency-700/40 space-y-3">
          <div className="flex items-start justify-between gap-3">
            <div>
              <h4 className="text-sm font-bold text-white">{selected.name}</h4>
              <p className="text-[11px] text-slate-500">{selected.region}</p>
            </div>
            <button
              onClick={() => setSelectedIso(null)}
              className="p-1.5 rounded-lg text-slate-500 hover:text-white hover:bg-slate-800"
              aria-label="Clear country selection"
            >
              <X className="w-4 h-4" />
            </button>
          </div>

          <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 text-xs">
            {[
              ["Reports", selected.reports.toLocaleString("en-IN")],
              ["Per million online", selected.perMillionOnline],
              ["Severe share", `${selected.criticalShare}%`],
              ["Online users", `${selected.onlineUsersMillions}M`],
            ].map(([label, value]) => (
              <div key={String(label)}>
                <div className="text-[10px] text-slate-500 uppercase tracking-wider">
                  {label}
                </div>
                <div className="font-mono text-slate-100 font-semibold">{value}</div>
              </div>
            ))}
          </div>

          <div className="space-y-2 pt-1">
            <div className="text-[10px] text-slate-500 uppercase tracking-wider">
              Category Split
            </div>
            {ALL_CATEGORIES.map((key) => {
              const pct = selected.categoryShares[key];
              const isTop = key === selected.topCategory;
              return (
                <div key={key} className="space-y-1">
                  <div className="flex justify-between items-baseline gap-3 text-[11px]">
                    <span className={isTop ? "text-slate-200 font-medium" : "text-slate-400"}>
                      {CATEGORY_LABELS[key]}
                    </span>
                    <span className="font-mono text-slate-400 tabular-nums shrink-0">
                      {pct}%
                    </span>
                  </div>
                  <div
                    className="w-full h-1.5 rounded-full overflow-hidden"
                    style={{ background: TRACK }}
                  >
                    <div
                      className="h-full rounded-full"
                      style={{ width: `${pct}%`, background: SERIES }}
                    />
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      )}

      {/* Rankings + regions */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-5 pt-1">
        <div className="lg:col-span-7 space-y-3">
          <h4 className="text-[11px] font-bold text-slate-300 uppercase tracking-wider">
            Highest Reporting Rate
          </h4>
          <ul className="space-y-2">
            {top10.map((country) => {
              const isSelected = selectedIso === country.iso;
              return (
                <li key={country.iso}>
                  <button
                    onClick={() =>
                      setSelectedIso(isSelected ? null : country.iso)
                    }
                    aria-pressed={isSelected}
                    className={`w-full text-left space-y-1 px-2 py-1.5 rounded-lg transition ${
                      isSelected ? "bg-emergency-950/50" : "hover:bg-slate-800/50"
                    }`}
                  >
                    <div className="flex justify-between items-baseline gap-3 text-xs">
                      <span className="text-slate-300 truncate">{country.name}</span>
                      <span className="font-mono text-slate-400 tabular-nums shrink-0">
                        {country.perMillionOnline}
                      </span>
                    </div>
                    <div
                      className="w-full h-2 rounded-full overflow-hidden"
                      style={{ background: TRACK }}
                    >
                      <div
                        className="h-full rounded-full"
                        style={{
                          width: `${(country.perMillionOnline / maxPerMillion) * 100}%`,
                          background: SERIES,
                        }}
                      />
                    </div>
                  </button>
                </li>
              );
            })}
          </ul>
          <p className="text-[10px] text-slate-600">
            Reports per million online users. Click a row to highlight it on the map.
          </p>
        </div>

        <div className="lg:col-span-5 space-y-3">
          <h4 className="text-[11px] font-bold text-slate-300 uppercase tracking-wider">
            By Region
          </h4>
          <ul className="space-y-2.5">
            {snapshot.regions.map((region) => (
              <li key={region.region} className="space-y-1">
                <div className="flex justify-between items-baseline gap-3 text-xs">
                  <span className="text-slate-300">{region.region}</span>
                  <span className="font-mono text-slate-400 tabular-nums shrink-0">
                    {region.avgPerMillion}
                  </span>
                </div>
                <div
                  className="w-full h-2 rounded-full overflow-hidden"
                  style={{ background: TRACK }}
                >
                  <div
                    className="h-full rounded-full"
                    style={{
                      width: `${
                        (region.avgPerMillion /
                          Math.max(...snapshot.regions.map((r) => r.avgPerMillion))) *
                        100
                      }%`,
                      background: SERIES,
                    }}
                  />
                </div>
                <div className="text-[10px] text-slate-600">
                  {region.countries} countries ·{" "}
                  {region.reports.toLocaleString("en-IN")} reports
                </div>
              </li>
            ))}
          </ul>

          <div className="pt-2 space-y-2">
            <h4 className="text-[11px] font-bold text-slate-300 uppercase tracking-wider">
              Dominant Categories
            </h4>
            <ul className="space-y-1.5">
              {snapshot.categoryMix.map((cat, i) => (
                <li
                  key={cat.key}
                  className="flex items-center justify-between gap-2 text-[11px]"
                >
                  <span className="flex items-center gap-2 min-w-0">
                    <span
                      className="w-2.5 h-2.5 rounded-sm shrink-0"
                      style={{
                        background:
                          CHOROPLETH_STEPS[
                            Math.min(i + 1, CHOROPLETH_STEPS.length - 1)
                          ],
                      }}
                      aria-hidden
                    />
                    <span className="text-slate-400 truncate">{cat.label}</span>
                  </span>
                  <span className="font-mono text-slate-400 tabular-nums shrink-0">
                    {cat.pct}%
                  </span>
                </li>
              ))}
            </ul>
          </div>
        </div>
      </div>
    </div>
  );
};
