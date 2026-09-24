"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import {
  GOV_MAP_VOLUME_LEGEND,
  STATE_CODE_TO_GEO_NAME,
  joinAggregateToGeo,
  volumeFillForCount,
} from "@/lib/gov/govMapDisplay";
import {
  displayNameForGeoName,
  illustrativeAccentForName,
  resolveMapDisplayMode,
  type GovCameraPresetName,
} from "@/lib/gov/govGeo3D";
import {
  India3DScene,
  type CameraPresetRequest,
  type SceneGeoCollection,
} from "./India3DScene";

/**
 * Map-first Geographic Intelligence view over a real WebGL 3D scene.
 *
 * Data shell (this file): authorized `/gov/api/geo` aggregates, metric
 * toggle, preview/live color semantics, tooltip content, state drill-down
 * (district lists from the existing scoped endpoints), breadcrumb, legend,
 * and status. Geometry shell (`India3DScene`): extruded state meshes,
 * ocean, orbit camera, presets, raycast hover/select.
 *
 * Preview vs live: `visual-preview` paints deterministic illustrative
 * accents under an explicit banner until joined aggregates carry positive
 * case counts, when `live-data` takes over automatically using the same
 * volume scale as the data contract. Preview colors never imply severity.
 */

type Metric = { cases: number; new7d: number; highRisk: number; open: number };
type AggRow = {
  code: string;
  label: string;
  metric: Metric;
  categories?: Array<{ label: string; count: number }>;
};
type GeoResult = {
  level: "india" | "state" | "district" | "locality";
  state: string | null;
  district: string | null;
  rows: AggRow[];
  total: Metric;
  threatBreakdown?: Array<{ label: string; count: number }>;
  riskBreakdown?: Array<{ label: string; count: number }>;
  cases?: Array<{
    id: string;
    caseNumber: string;
    stateCode: string | null;
    districtCode: string | null;
    threatCategory: string | null;
    riskLevel: string | null;
    govStatus: string;
  }>;
  generatedAt?: string;
  source?: string;
  verification?: string;
  excludedCounts?: { unlocated: number; invalidOrIncomplete: number };
};

const METRICS: Array<{ key: keyof Metric; label: string }> = [
  { key: "cases", label: "Volume" },
  { key: "new7d", label: "New 7d" },
  { key: "highRisk", label: "High risk" },
  { key: "open", label: "Open" },
];

const PRESETS: GovCameraPresetName[] = ["TOP", "FRONT", "RIGHT", "BACK", "LEFT", "BOTTOM", "RESET"];
const AUTO_REFRESH_MS = 60000;

export function GovGeographyView() {
  const [metric, setMetric] = useState<keyof Metric>("cases");
  const [data, setData] = useState<GeoResult | null>(null);
  const [shapes, setShapes] = useState<SceneGeoCollection | null>(null);
  const [shapesError, setShapesError] = useState<string | null>(null);
  const [shapeAttempt, setShapeAttempt] = useState(0);
  const [error, setError] = useState<string | null>(null);
  const [stale, setStale] = useState(false);
  const [loading, setLoading] = useState(true);
  const [lastUpdated, setLastUpdated] = useState<string | null>(null);
  const [autoRefresh, setAutoRefresh] = useState(false);
  const [hover, setHover] = useState<{ name: string; x: number; y: number } | null>(null);
  const [selected, setSelected] = useState<string | null>(null);
  const [preset, setPreset] = useState<CameraPresetRequest | null>(null);
  const [drill, setDrill] = useState<GeoResult | null>(null);
  const [drillDistrict, setDrillDistrict] = useState<string | null>(null);
  const [drillDetail, setDrillDetail] = useState<GeoResult | null>(null);
  const wrapRef = useRef<HTMLDivElement | null>(null);
  const refreshTimer = useRef<ReturnType<typeof setInterval> | null>(null);

  const load = useCallback(
    async (background = false) => {
      if (!background) {
        setLoading(true);
        setError(null);
      }
      try {
        const response = await fetch("/gov/api/geo", { cache: "no-store" });
        if (!response.ok)
          throw new Error(`Unable to load geographic intelligence (${response.status}).`);
        const json = (await response.json()) as GeoResult;
        setData(json);
        setLastUpdated(json.generatedAt ?? new Date().toISOString());
        setStale(false);
        setError(null);
      } catch (e) {
        if (data) setStale(true);
        else setError(e instanceof Error ? e.message : "Unable to load.");
      } finally {
        if (!background) setLoading(false);
      }
    },
    [data],
  );

  useEffect(() => {
    void load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    if (refreshTimer.current) {
      clearInterval(refreshTimer.current);
      refreshTimer.current = null;
    }
    if (!autoRefresh) return;
    refreshTimer.current = setInterval(() => {
      if (typeof document !== "undefined" && document.hidden) return;
      void load(true).catch(() => undefined);
    }, AUTO_REFRESH_MS);
    return () => {
      if (refreshTimer.current) clearInterval(refreshTimer.current);
      refreshTimer.current = null;
    };
  }, [autoRefresh, load]);

  useEffect(() => {
    let cancelled = false;
    void fetch("/geo/india-states.geojson", { cache: "force-cache" })
      .then((r) => {
        if (!r.ok) throw new Error(`boundary asset (${r.status})`);
        return r.json();
      })
      .then((json) => {
        if (!cancelled) {
          setShapes(json as SceneGeoCollection);
          setShapesError(null);
        }
      })
      .catch(() => {
        if (!cancelled) setShapesError("State boundaries unavailable.");
      });
    return () => {
      cancelled = true;
    };
  }, [shapeAttempt]);

  // ---- display mode + fills (preview illustrative, live data-driven) ----
  const join = useMemo(
    () => joinAggregateToGeo((data?.rows ?? []).map((r) => ({ code: r.code, metric: r.metric }))),
    [data],
  );
  const mode = useMemo(
    () =>
      resolveMapDisplayMode({
        regionCases: new Map([...join.byGeoName.entries()].map(([k, v]) => [k, v.totalCases] as [string, number])),
      }),
    [join],
  );
  const maxMetric = useMemo(() => {
    let m = 0;
    for (const r of join.byGeoName.values()) m = Math.max(m, r.metric[metric]);
    return m;
  }, [join, metric]);

  const fills = useMemo(() => {
    const map = new Map<string, string>();
    if (!shapes) return map;
    for (const f of shapes.features) {
      const name = f.properties.ST_NM;
      if (mode === "live-data") {
        const joined = join.byGeoName.get(name);
        map.set(name, volumeFillForCount(joined?.metric[metric] ?? 0, Math.max(1, maxMetric)));
      } else {
        map.set(name, illustrativeAccentForName(name));
      }
    }
    return map;
  }, [shapes, mode, join, metric, maxMetric]);
  const fillsId = useMemo(
    () => [...fills.entries()].map(([k, v]) => `${k}=${v}`).join("|").length + fills.size * 7 + metric.length,
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [fills, mode, metric],
  );

  const primaryCodeByGeo = useMemo(() => {
    const best = new Map<string, { code: string; cases: number }>();
    for (const r of data?.rows ?? []) {
      const geo = STATE_CODE_TO_GEO_NAME[r.code];
      if (!geo) continue;
      const prev = best.get(geo);
      if (!prev || r.metric.cases > prev.cases) best.set(geo, { code: r.code, cases: r.metric.cases });
    }
    return best;
  }, [data]);

  // ---- selection + drill-down (existing scoped endpoints, new level meaning) ----
  const selectState = useCallback(
    async (name: string | null) => {
      setSelected(name);
      setHover(null);
      setDrill(null);
      setDrillDistrict(null);
      setDrillDetail(null);
      if (!name) return;
      const code = primaryCodeByGeo.get(name)?.code;
      if (!code) return;
      try {
        const r = await fetch(`/gov/api/geo?state=${encodeURIComponent(code)}`, { cache: "no-store" });
        if (r.ok) setDrill(await r.json());
      } catch {
        /* panel stays in aggregate-summary mode */
      }
    },
    [primaryCodeByGeo],
  );

  const openDistrict = useCallback(
    async (districtCode: string) => {
      const stateCode = selected ? primaryCodeByGeo.get(selected)?.code : null;
      if (!stateCode) return;
      setDrillDistrict(districtCode);
      setDrillDetail(null);
      try {
        const r = await fetch(
          `/gov/api/geo?state=${encodeURIComponent(stateCode)}&district=${encodeURIComponent(districtCode)}`,
          { cache: "no-store" },
        );
        if (r.ok) setDrillDetail(await r.json());
      } catch {
        /* locality list stays unavailable */
      }
    },
    [selected, primaryCodeByGeo],
  );

  const onHover3D = useCallback((name: string | null, x: number, y: number) => {
    setHover(name ? { name, x, y } : null);
  }, []);

  const hoveredAgg = hover ? join.byGeoName.get(hover.name) ?? null : null;
  const selectedAgg = selected ? join.byGeoName.get(selected) ?? null : null;
  const unmatchedNote =
    join.unmatched.length > 0
      ? `${join.unmatched.length} group${join.unmatched.length === 1 ? "" : "s"} not matched to map shapes`
      : null;
  const sceneReady = Boolean(shapes) && !loading;

  return (
    <div className="space-y-4">
      <section className="gov-panel flex flex-wrap items-center gap-3 px-4 py-3">
        <div>
          <h2 className="text-lg font-bold text-slate-100">Geographic Intelligence</h2>
          <p className="text-xs text-slate-400">
            Cyber Sakhi case data · Officer-entered, unverified ·{" "}
            {lastUpdated ? `Updated ${new Date(lastUpdated).toLocaleString()}${stale ? " · stale" : ""}` : "Loading…"}
          </p>
        </div>
        <div className="ml-auto flex flex-wrap items-center gap-2">
          {METRICS.map((m) => (
            <button
              key={m.key}
              type="button"
              onClick={() => setMetric(m.key)}
              className={`rounded-lg border px-2.5 py-1 text-xs font-semibold ${metric === m.key ? "border-teal-300 bg-teal-400/15 text-teal-200" : "border-slate-700 text-slate-400"}`}
            >
              {m.label}
            </button>
          ))}
          <button
            type="button"
            onClick={() => void load()}
            className="rounded-lg border border-slate-700 px-2.5 py-1 text-xs font-semibold text-slate-300"
          >
            Refresh
          </button>
          <label className="flex items-center gap-1.5 text-xs text-slate-400">
            <input type="checkbox" checked={autoRefresh} onChange={(e) => setAutoRefresh(e.target.checked)} />
            60s
          </label>
        </div>
      </section>

      {mode === "visual-preview" && sceneReady && (
        <section className="rounded-xl border border-amber-400/50 bg-amber-400/10 px-4 py-2 text-center text-xs font-semibold tracking-wide text-amber-200" role="status">
          VISUAL PREVIEW — COLORS ARE ILLUSTRATIVE, NOT CASE DATA
        </section>
      )}

      <section className="gov-panel relative overflow-hidden p-0">
        <div ref={wrapRef} className="relative h-[72vh] min-h-[520px] w-full bg-[#040b16]">
          {shapesError && !shapes ? (
            <div className="absolute inset-0 flex flex-col items-center justify-center gap-3" role="alert">
              <p className="text-sm text-amber-200">{shapesError}</p>
              <p className="max-w-md text-center text-xs text-slate-400">
                Aggregate data is unaffected. Boundary geometry failed to load from the local static asset.
              </p>
              <button
                type="button"
                onClick={() => setShapeAttempt((n) => n + 1)}
                className="rounded-lg border border-slate-600 px-4 py-1.5 text-xs font-semibold text-slate-200"
              >
                Retry boundaries
              </button>
            </div>
          ) : !shapes || (loading && !data) ? (
            <div className="absolute inset-0 animate-pulse bg-gradient-to-br from-slate-800/60 via-slate-900 to-slate-800/60" role="status" aria-label="Loading 3D map">
              <p className="absolute inset-0 flex items-center justify-center text-sm text-slate-400">
                {error ? error : "Loading 3D geographic intelligence…"}
              </p>
              {error && (
                <button
                  type="button"
                  onClick={() => void load()}
                  className="absolute left-1/2 top-2/3 -translate-x-1/2 rounded-lg border border-slate-600 px-4 py-1.5 text-xs font-semibold text-slate-200"
                >
                  Retry
                </button>
              )}
            </div>
          ) : (
            shapes && (
              <India3DScene
                shapes={shapes}
                districtShapes={null}
                fills={fills}
                fillsId={fillsId}
                selected={selected}
                focusName={selected}
                preset={preset}
                onHover={onHover3D}
                onSelect={(name) => void selectState(name)}
              />
            )
          )}

          {/* breadcrumb */}
          <div className="absolute left-3 top-3 flex items-center gap-2 rounded-xl border border-slate-700/80 bg-slate-900/90 px-3 py-1.5 text-xs backdrop-blur">
            <span className="font-semibold text-slate-300">INDIA</span>
            {selected && (
              <>
                <span className="text-slate-500">&gt;</span>
                <span className="font-bold text-teal-200">{displayNameForGeoName(selected).toUpperCase()}</span>
                <button
                  type="button"
                  onClick={() => void selectState(null)}
                  className="ml-1 rounded border border-slate-700 px-2 py-0.5 text-slate-300 hover:border-teal-300"
                >
                  Back to India
                </button>
              </>
            )}
          </div>

          {/* camera presets */}
          <div className="absolute right-3 top-3 flex flex-col gap-1.5">
            {PRESETS.map((p) => (
              <button
                key={p}
                type="button"
                title={`${p} view`}
                aria-label={`${p} view`}
                onClick={() => setPreset({ id: Date.now(), name: p })}
                className="rounded-lg border border-slate-700 bg-slate-900/90 px-2 py-1 text-[11px] font-bold text-slate-200 backdrop-blur hover:border-teal-300 hover:text-teal-200 focus:border-teal-300"
              >
                {p}
              </button>
            ))}
          </div>

          {/* floating legend (mode-aware) */}
          <div className="absolute bottom-3 left-3 rounded-xl border border-slate-700/80 bg-slate-900/90 px-3 py-2 backdrop-blur">
            {mode === "live-data" ? (
              <>
                <p className="text-[11px] font-semibold uppercase tracking-wide text-slate-400">
                  {METRICS.find((m) => m.key === metric)?.label} · relative
                </p>
                <ul className="mt-1.5 space-y-1">
                  {GOV_MAP_VOLUME_LEGEND.map((e) => (
                    <li key={e.level} className="flex items-center gap-2 text-xs text-slate-300">
                      <span className="inline-block h-2.5 w-5 rounded-sm" style={{ background: e.fill }} />
                      {e.label}
                    </li>
                  ))}
                </ul>
                <p className="mt-1.5 max-w-[220px] text-[10px] leading-snug text-slate-500">
                  Relative to this view&apos;s maximum — not an official risk classification.
                </p>
              </>
            ) : (
              <>
                <p className="text-[11px] font-semibold uppercase tracking-wide text-amber-200">
                  Visual preview — illustrative
                </p>
                <p className="mt-1 max-w-[220px] text-[10px] leading-snug text-slate-400">
                  Colors are decorative placeholders until scoped case data arrives. They imply no
                  volume, risk, or threat meaning.
                </p>
              </>
            )}
          </div>

          {/* floating status */}
          <div className="absolute bottom-3 right-3 max-w-[260px] rounded-xl border border-slate-700/80 bg-slate-900/90 px-3 py-2 text-right backdrop-blur">
            <p className="text-[11px] text-slate-400">
              {data ? `${data.total.cases} scoped cases` : "No data"}
              {stale ? " · stale" : ""}
            </p>
            <p className="text-[10px] text-slate-500">
              {data?.source ?? "Cyber Sakhi case data"} · {data?.verification ?? "Officer-entered, unverified"}
            </p>
            {unmatchedNote && (
              <p className="text-[10px] text-slate-500" title={join.unmatched.join(", ")}>
                {unmatchedNote}
              </p>
            )}
          </div>

          {/* hover tooltip (aggregate only, container-relative) */}
          {hover && (
            <div
              className="pointer-events-none absolute z-10 w-60 rounded-xl border border-slate-600/80 bg-slate-900/95 p-3 shadow-xl backdrop-blur"
              style={{
                left: Math.max(8, hover.x + 18 > 300 ? hover.x - 264 : hover.x + 18),
                top: Math.max(8, hover.y - 10),
              }}
              role="status"
            >
              <p className="text-sm font-bold text-slate-100">{displayNameForGeoName(hover.name)}</p>
              {mode === "live-data" ? (
                <>
                  <p className="mt-0.5 font-mono text-lg text-teal-200">
                    {hoveredAgg?.totalCases ?? 0} <span className="font-sans text-xs font-normal text-slate-400">cases</span>
                  </p>
                  <p className="mt-1 text-xs text-slate-300">
                    New 7d {hoveredAgg?.metric.new7d ?? 0} · High risk {hoveredAgg?.metric.highRisk ?? 0} · Open{" "}
                    {hoveredAgg?.metric.open ?? 0}
                  </p>
                </>
              ) : (
                <p className="mt-1 text-xs text-slate-400">Illustrative preview — no case meaning.</p>
              )}
              <p className="mt-1 text-[10px] text-slate-500">
                {data?.source ?? "Cyber Sakhi case data"} · {data?.verification ?? "Officer-entered, unverified"}
                {data?.generatedAt ? ` · ${new Date(data.generatedAt).toLocaleString()}` : ""}
              </p>
            </div>
          )}

          {/* click drill-down panel (floating; district data, not geometry) */}
          {selected && (
            <div className="absolute bottom-3 right-3 top-3 flex w-80 max-w-[85%] flex-col overflow-hidden rounded-xl border border-slate-600/80 bg-slate-900/95 backdrop-blur">
              <div className="flex items-start justify-between gap-2 border-b border-slate-700/80 p-3">
                <div>
                  <h3 className="font-bold text-slate-100">{displayNameForGeoName(selected)}</h3>
                  {mode === "live-data" && (
                    <p className="mt-0.5 font-mono text-sm text-teal-200">{selectedAgg?.totalCases ?? 0} cases</p>
                  )}
                  <p className="text-[11px] text-slate-400">
                    {mode === "live-data"
                      ? `New 7d ${selectedAgg?.metric.new7d ?? 0} · High risk ${selectedAgg?.metric.highRisk ?? 0} · Open ${selectedAgg?.metric.open ?? 0}`
                      : "Illustrative preview region."}
                  </p>
                </div>
                <button
                  type="button"
                  aria-label="Close state detail"
                  onClick={() => void selectState(null)}
                  className="rounded border border-slate-700 px-2 py-0.5 text-xs text-slate-300 hover:border-teal-300"
                >
                  ✕
                </button>
              </div>
              <div className="flex-1 overflow-y-auto p-3">
                {!drill ? (
                  <p className="text-xs text-slate-500">
                    {primaryCodeByGeo.get(selected) ? "Loading district breakdown…" : "No scoped aggregate for this region."}
                  </p>
                ) : drillDistrict ? (
                  <>
                    <button
                      type="button"
                      onClick={() => {
                        setDrillDistrict(null);
                        setDrillDetail(null);
                      }}
                      className="mb-2 rounded border border-slate-700 px-2 py-0.5 text-xs text-slate-300"
                    >
                      ← Districts
                    </button>
                    <h4 className="text-xs font-semibold uppercase tracking-wide text-slate-400">{drillDistrict} — localities</h4>
                    {!drillDetail ? (
                      <p className="mt-2 text-xs text-slate-500">Loading…</p>
                    ) : (
                      <>
                        <ul className="mt-2 space-y-1.5">
                          {(drillDetail.rows ?? []).map((r) => (
                            <li key={r.code} className="flex items-center justify-between gap-2 text-xs text-slate-300">
                              <span className="truncate">{r.label}</span>
                              <span className="font-mono">{r.metric.cases}</span>
                            </li>
                          ))}
                          {(drillDetail.rows ?? []).length === 0 && (
                            <li className="text-xs text-slate-500">No located rows.</li>
                          )}
                        </ul>
                        {(drillDetail.cases ?? []).length > 0 && (
                          <table className="mt-3 w-full text-left text-xs">
                            <thead className="border-b border-slate-700 uppercase text-slate-500">
                              <tr>
                                <th className="py-1">Case</th>
                                <th>Threat</th>
                                <th>Status</th>
                              </tr>
                            </thead>
                            <tbody>
                              {(drillDetail.cases ?? []).map((c) => (
                                <tr key={c.id} className="border-b border-slate-800 text-slate-300">
                                  <td className="py-1">
                                    <Link className="font-mono text-teal-300" href={`/gov/cases/${c.id}`}>
                                      {c.caseNumber || c.id.slice(0, 8)}
                                    </Link>
                                  </td>
                                  <td>{c.threatCategory ?? "—"}</td>
                                  <td>{c.govStatus}</td>
                                </tr>
                              ))}
                            </tbody>
                          </table>
                        )}
                      </>
                    )}
                  </>
                ) : (
                  <>
                    <h4 className="text-xs font-semibold uppercase tracking-wide text-slate-400">Districts</h4>
                    <ul className="mt-2 space-y-1.5">
                      {(drill.rows ?? []).map((r) => {
                        const dmax = Math.max(1, ...(drill.rows ?? []).map((x) => x.metric.cases));
                        return (
                          <li key={r.code}>
                            <button
                              type="button"
                              disabled={r.code === "UNKNOWN"}
                              onClick={() => void openDistrict(r.code)}
                              className="flex w-full items-center gap-2 rounded px-1 py-1 text-left text-xs text-slate-200 hover:bg-slate-800/70 disabled:cursor-default"
                            >
                              <span className="w-28 truncate">{r.label}</span>
                              <span className="h-1.5 flex-1 overflow-hidden rounded-full bg-slate-800">
                                <span className="block h-full rounded-full bg-teal-400/70" style={{ width: `${(r.metric.cases / dmax) * 100}%` }} />
                              </span>
                              <span className="font-mono">{r.metric.cases}</span>
                            </button>
                          </li>
                        );
                      })}
                      {(drill.rows ?? []).length === 0 && (
                        <li className="text-xs text-slate-500">No located, scoped data.</li>
                      )}
                    </ul>
                    <p className="mt-3 text-[10px] text-slate-500">
                      District boundaries are not available as geometry yet — districts are listed
                      from authorized aggregates and will render as 3D geometry once a licensed
                      district dataset is added.
                    </p>
                  </>
                )}
              </div>
            </div>
          )}
        </div>
      </section>

      <p className="text-[11px] text-slate-500">
        Boundaries: India boundaries by DataMeet India community (CC BY 4.0), simplified for
        display; surrounding landmasses: Natural Earth via world-atlas (public domain) — all
        approximate, not for legal or official use. Counts: officer-entered,
        unverified Cyber Sakhi case data. Excluded from located regions:{" "}
        {data?.excludedCounts?.unlocated ?? 0} unlocated · {data?.excludedCounts?.invalidOrIncomplete ?? 0}{" "}
        invalid/incomplete.
      </p>
    </div>
  );
}
