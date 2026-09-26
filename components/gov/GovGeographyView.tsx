"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
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
 * When no verified geographic linkage exists, regions stay neutral rather
 * than receiving decorative colours. Geographic absence is information, not
 * a visual gap to fill with simulated incident data.
 */

type Metric = { cases: number; new7d: number; highRisk: number; open: number };
type AggRow = {
  code: string;
  label: string;
  metric: Metric;
  categories?: Array<{ label: string; count: number }>;
};
interface DistrictGeoFeature {
  type: "Feature";
  properties: { ST_NM: string; DISTRICT: string };
  geometry: { type: "Polygon" | "MultiPolygon"; coordinates: number[][][] | number[][][][] };
}

interface DistrictGeoCollection {
  type: "FeatureCollection";
  features: DistrictGeoFeature[];
}

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
// Layer-off neutral: the legend's documented zero/no-data color, never invented.
const NEUTRAL_FILL: string = GOV_MAP_VOLUME_LEGEND.find((e) => e.level === "none")?.fill ?? "#475569";

export function GovGeographyView({ canViewCases = false, initialSelected = null }: { canViewCases?: boolean; initialSelected?: string | null }) {
  const router = useRouter();
  const [metric, setMetric] = useState<keyof Metric>("cases");
  const [data, setData] = useState<GeoResult | null>(null);
  const [shapes, setShapes] = useState<SceneGeoCollection | null>(null);
  const [shapesError, setShapesError] = useState<string | null>(null);
  const [shapeAttempt, setShapeAttempt] = useState(0);
  const [districtShapes, setDistrictShapes] = useState<DistrictGeoCollection | null>(null);
  const [districtShapesError, setDistrictShapesError] = useState<string | null>(null);
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
  const [flyingTo, setFlyingTo] = useState<string | null>(null);
  const [reducedMotion, setReducedMotion] = useState(false);
  const [showCases, setShowCases] = useState(true);
  const [showDistricts, setShowDistricts] = useState(true);
  const [placeQuery, setPlaceQuery] = useState("");
  const flyTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
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

  useEffect(() => {
    let cancelled = false;
    void fetch("/geo/india-districts-census2011.geojson", { cache: "force-cache" })
      .then((r) => {
        if (!r.ok) throw new Error(`district asset (${r.status})`);
        return r.json();
      })
      .then((json: unknown) => {
        if (cancelled) return;
        const raw = json as { features?: unknown };
        if (!raw || !Array.isArray(raw.features)) throw new Error("district asset shape");
        const features: DistrictGeoFeature[] = [];
        for (const f of raw.features as Array<Record<string, unknown>>) {
          const props = f.properties as Record<string, unknown> | undefined;
          const geom = f.geometry as DistrictGeoFeature["geometry"] | undefined;
          const st = props ? String(props.ST_NM ?? "") : "";
          const dt = props ? String(props.DISTRICT ?? "") : "";
          if (!st || !dt || !geom || (geom.type !== "Polygon" && geom.type !== "MultiPolygon")) continue;
          features.push({ type: "Feature", properties: { ST_NM: st, DISTRICT: dt }, geometry: geom });
        }
        if (features.length === 0) throw new Error("district asset empty");
        setDistrictShapes({ type: "FeatureCollection", features });
        setDistrictShapesError(null);
      })
      .catch(() => {
        if (!cancelled) setDistrictShapesError("District geometry unavailable; district list stays authoritative.");
      });
    return () => {
      cancelled = true;
    };
  }, []);

  // ---- display mode + fills (live data-driven; neutral when unavailable) ----
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
      if (!showCases) {
        map.set(name, NEUTRAL_FILL);
      } else if (mode === "live-data") {
        const joined = join.byGeoName.get(name);
        map.set(name, volumeFillForCount(joined?.metric[metric] ?? 0, Math.max(1, maxMetric)));
      } else {
        map.set(name, illustrativeAccentForName(name));
      }
    }
    return map;
  }, [shapes, mode, join, metric, maxMetric, showCases]);
  const fillsId = useMemo(
    () => [...fills.entries()].map(([k, v]) => `${k}=${v}`).join("|").length + fills.size * 7 + metric.length,
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [fills, mode, metric],
  );

  // ---- map replacement on drill-down (PART 13.4): selecting a state unmounts
  // the India scene and mounts a state scene built from the SAME verified
  // state geometry, plus the real Census-2011 district layer when the
  // district file covers the state. The React key below forces a full
  // unmount/remount (WebGL resources disposed by the scene cleanup), so the
  // old map never lingers behind the new one.
  const stateShapes = useMemo<SceneGeoCollection | null>(() => {
    if (!shapes || !selected) return null;
    const feats = shapes.features.filter((f) => f.properties.ST_NM === selected);
    return feats.length > 0 ? { type: "FeatureCollection", features: feats } : null;
  }, [shapes, selected]);

  const districtsForState = useMemo<SceneGeoCollection | null>(() => {
    if (!districtShapes || !selected) return null;
    const feats = districtShapes.features
      .filter((f) => f.properties.ST_NM === selected)
      .map((f) => ({ type: "Feature" as const, properties: { ST_NM: f.properties.DISTRICT }, geometry: f.geometry }));
    return feats.length > 0 ? { type: "FeatureCollection", features: feats } : null;
  }, [districtShapes, selected]);

  const mapKey = selected ? `state:${selected}` : "india";

  // Keyboard/search equivalent of map clicks (PART 15/17): every verified
  // state name, same fly-then-replace transition as a 3D click.
  const stateOptions = useMemo(
    () => (shapes ? [...new Set(shapes.features.map((f) => f.properties.ST_NM))].sort() : []),
    [shapes],
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

  useEffect(() => {
    if (typeof window !== "undefined" && window.matchMedia?.("(prefers-reduced-motion: reduce)").matches) {
      setReducedMotion(true);
    }
    return () => {
      if (flyTimer.current) clearTimeout(flyTimer.current);
    };
  }, []);

  // ---- selection + drill-down (existing scoped endpoints, new level meaning) ----
  const selectState = useCallback(
    async (name: string | null) => {
      if (flyTimer.current) {
        clearTimeout(flyTimer.current);
        flyTimer.current = null;
      }
      setFlyingTo(null);
      setSelected(name);
      setHover(null);
      setPlaceQuery("");
      setDrill(null);
      setDrillDistrict(null);
      setDrillDetail(null);
      // Drill state survives refresh/back via ?state= (replace: no history spam).
      router.replace(`/gov/geography${name ? `?state=${encodeURIComponent(name)}` : ""}`, { scroll: false });
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
    [primaryCodeByGeo, router],
  );

  // Seed from ?state= once geometry loads; unknown values fall back to India.
  // Also heals browser-back navigation, which re-renders with new params.
  useEffect(() => {
    if (!shapes) return;
    const urlState =
      initialSelected && shapes.features.some((f) => f.properties.ST_NM === initialSelected)
        ? initialSelected
        : null;
    if (urlState !== selected) void selectState(urlState);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [shapes, initialSelected]);

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

  // PART 17 transition: from the India level, a state click first flies the
  // camera toward the region (India stays mounted, shell preserved), then
  // commits the selection, which remounts the state scene. Reduced-motion
  // users and repeat clicks commit instantly. Keyboard users get the same
  // transition through the state selector below.
  const requestState = useCallback(
    (name: string | null) => {
      if (!name || selected || reducedMotion) {
        void selectState(name);
        return;
      }
      if (flyTimer.current) clearTimeout(flyTimer.current);
      setFlyingTo(name);
      flyTimer.current = setTimeout(() => {
        flyTimer.current = null;
        void selectState(name);
      }, 950);
    },
    [selected, reducedMotion, selectState],
  );

  const onHover3D = useCallback((name: string | null, x: number, y: number) => {
    setHover(name ? { name, x, y } : null);
  }, []);

  const hoveredAgg = hover ? join.byGeoName.get(hover.name) ?? null : null;
  // District tooltip aggregates come from the scoped district drill-down
  // (officer district codes); geometry names that match no aggregate row
  // honestly show "no scoped aggregate" instead of a zero.
  const hoveredDistrictAgg =
    selected && hover
      ? (drill?.rows ?? []).find((r) => r.label === hover.name || r.code === hover.name) ?? null
      : null;
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
          <select
            aria-label="Go to state or territory"
            value=""
            onChange={(e) => {
              if (e.target.value) requestState(e.target.value);
              e.target.value = "";
            }}
            disabled={!shapes || !!flyingTo}
            className="rounded-lg border border-slate-700 bg-slate-900/50 px-2 py-1 text-xs text-slate-200 disabled:opacity-40"
          >
            <option value="">Go to state…</option>
            {stateOptions.map((s) => (
              <option key={s} value={s}>{displayNameForGeoName(s)}</option>
            ))}
          </select>
          <button
            type="button"
            onClick={() => setShowCases((v) => !v)}
            aria-pressed={showCases}
            title="Layer: production case volume (scoped aggregates)"
            className={`rounded-lg border px-2.5 py-1 text-xs font-semibold ${showCases ? "border-teal-300 bg-teal-400/15 text-teal-200" : "border-slate-700 text-slate-400"}`}
          >
            Cases
          </button>
          <button
            type="button"
            onClick={() => setShowDistricts((v) => !v)}
            aria-pressed={showDistricts}
            title="Layer: Census-2011 district shapes (state view)"
            className={`rounded-lg border px-2.5 py-1 text-xs font-semibold ${showDistricts ? "border-teal-300 bg-teal-400/15 text-teal-200" : "border-slate-700 text-slate-400"}`}
          >
            Districts
          </button>
        </div>
      </section>

      {mode === "visual-preview" && sceneReady && (
        <section className="rounded-xl border border-slate-600/70 bg-slate-900/70 px-4 py-3 text-center text-xs text-slate-300" role="status">
          <span className="font-bold uppercase tracking-wide text-slate-100">Geographic coverage unavailable.</span>{" "}
          Cases without a verified state/UT linkage are intentionally excluded from this map; neutral boundaries do not imply zero incidents.
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
                key={mapKey}
                shapes={selected && stateShapes ? stateShapes : shapes}
                districtShapes={selected && showDistricts ? districtsForState : null}
                fills={fills}
                fillsId={fillsId}
                selected={flyingTo ?? selected}
                focusName={flyingTo ?? selected}
                preset={preset}
                onHover={onHover3D}
                onSelect={(name) => {
                  // India level: state click starts the fly-then-replace
                  // transition. State level: the 3D district layer is visual
                  // + hover aggregates; drill-down stays on the district list
                  // (officer district codes have no reliable mapping to
                  // Census names).
                  if (!selected && !flyingTo) requestState(name);
                }}
              />
            )
          )}

          {/* transition state: camera is flying, shell and India view preserved */}
          {flyingTo && (
            <div className="absolute left-1/2 top-3 z-10 -translate-x-1/2 rounded-xl border border-teal-400/40 bg-slate-900/95 px-4 py-2 text-xs font-semibold text-teal-200 backdrop-blur" role="status" aria-live="polite">
              Entering {displayNameForGeoName(flyingTo)}… loading verified state layer
            </div>
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
                <span className="font-mono text-[10px] uppercase tracking-widest text-slate-500">
                  state map · replaces India view
                </span>
              </>
            )}
            {selected && (
              <span className="font-mono text-[10px] text-slate-500">
                {districtsForState
                  ? `${districtsForState.features.length} Census-2011 district shapes`
                  : (districtShapesError ?? "district shapes unavailable for this region")}
              </span>
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
                <p className="text-[11px] font-semibold uppercase tracking-wide text-slate-300">
                  Geographic coverage unavailable
                </p>
                <p className="mt-1 max-w-[220px] text-[10px] leading-snug text-slate-400">
                  Neutral boundaries mean no verified geographic case aggregate is available. They do not mean zero incidents.
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
              <p className="text-sm font-bold text-slate-100">
                {selected ? hover.name : displayNameForGeoName(hover.name)}
              </p>
              {mode === "live-data" ? (
                selected ? (
                  hoveredDistrictAgg ? (
                    <>
                      <p className="mt-0.5 font-mono text-lg text-teal-200">
                        {hoveredDistrictAgg.metric.cases} <span className="font-sans text-xs font-normal text-slate-400">cases</span>
                      </p>
                      <p className="mt-1 text-xs text-slate-300">
                        New 7d {hoveredDistrictAgg.metric.new7d} · High risk {hoveredDistrictAgg.metric.highRisk} · Open{" "}
                        {hoveredDistrictAgg.metric.open}
                      </p>
                    </>
                  ) : (
                    <p className="mt-1 text-xs text-slate-400">
                      No scoped aggregate for this district shape — see the district list for officer-code aggregates.
                    </p>
                  )
                ) : (
                  <>
                    {hoveredAgg ? (
                      <>
                        <p className="mt-0.5 font-mono text-lg text-teal-200">
                          {hoveredAgg.totalCases} <span className="font-sans text-xs font-normal text-slate-400">cases</span>
                        </p>
                        <p className="mt-1 text-xs text-slate-300">
                          New 7d {hoveredAgg.metric.new7d} · High risk {hoveredAgg.metric.highRisk} · Open {hoveredAgg.metric.open}
                        </p>
                      </>
                    ) : (
                      <p className="mt-1 text-xs text-slate-400">
                        Verified geographic case data unavailable for this region.
                      </p>
                    )}
                  </>
                )
              ) : (
                <p className="mt-1 text-xs text-slate-400">Verified geographic case data unavailable for this region.</p>
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
                    <p className="mt-0.5 font-mono text-sm text-teal-200">
                      {selectedAgg ? `${selectedAgg.totalCases} cases` : "Geographic data unavailable"}
                    </p>
                  )}
                  <p className="text-[11px] text-slate-400">
                    {mode === "live-data"
                      ? selectedAgg
                        ? `New 7d ${selectedAgg.metric.new7d} · High risk ${selectedAgg.metric.highRisk} · Open ${selectedAgg.metric.open}`
                        : "Verified geographic case data unavailable for this region."
                      : "Verified geographic case data unavailable for this region."}
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
                          {(drillDetail.rows ?? []).filter((r) => {
                            const needle = placeQuery.trim().toLowerCase();
                            return !needle || r.label.toLowerCase().includes(needle) || r.code.toLowerCase().includes(needle);
                          }).map((r) => (
                            <li key={r.code} className="flex items-center justify-between gap-2 text-xs text-slate-300">
                              <span className="truncate">{r.label}</span>
                              <span className="font-mono">{r.metric.cases}</span>
                            </li>
                          ))}
                          {(drillDetail.rows ?? []).length === 0 && (
                            <li className="text-xs text-slate-500">No located rows.</li>
                          )}
                        </ul>
                        <p className="mt-2 text-[10px] leading-relaxed text-slate-500">
                          City view: no verified city polygons exist for this district, so no
                          points are rendered and none are invented. Localities above come
                          from scoped aggregates only.
                        </p>
                        {canViewCases ? (
                          (drillDetail.cases ?? []).length > 0 && (
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
                                    <td>{c.threatCategory ?? "Unclassified"}</td>
                                    <td>{c.govStatus}</td>
                                  </tr>
                                ))}
                              </tbody>
                            </table>
                          )
                        ) : (
                          <p className="mt-3 rounded-lg border border-slate-700/60 bg-slate-800/40 px-2.5 py-2 text-[11px] leading-relaxed text-slate-400">
                            Case-level rows are hidden for your role. Aggregate counts above are unaffected;
                            officers with case access open rows in the Case Explorer instead.
                          </p>
                        )}
                      </>
                    )}
                  </>
                ) : (
                  <>
                    <div className="flex items-center justify-between gap-2">
                      <h4 className="text-xs font-semibold uppercase tracking-wide text-slate-400">Districts</h4>
                      <input
                        value={placeQuery}
                        onChange={(e) => setPlaceQuery(e.target.value)}
                        maxLength={80}
                        placeholder="Filter places..."
                        aria-label="Filter districts and localities"
                        className="w-32 rounded border border-slate-700 bg-slate-950 px-2 py-1 text-xs text-slate-200"
                      />
                    </div>
                    <ul className="mt-2 space-y-1.5">
                      {(drill.rows ?? []).filter((r) => {
                        const needle = placeQuery.trim().toLowerCase();
                        return !needle || r.label.toLowerCase().includes(needle) || r.code.toLowerCase().includes(needle);
                      }).map((r) => {
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
                      {districtsForState
                        ? "District shapes above are Census-2011 geometry (CC BY 4.0, DataMeet); counts come from scoped aggregates, and district drill-down stays on this list because officer district codes have no reliable mapping to Census names."
                        : "District geometry is unavailable for this region — districts are listed from authorized aggregates only."}
                    </p>
                  </>
                )}
              </div>
            </div>
          )}
        </div>
      </section>

      {process.env.NODE_ENV === "development" && (
        <details className="rounded-xl border border-dashed border-slate-700 bg-slate-950/60 p-3 font-mono text-[11px] text-slate-400">
          <summary className="cursor-pointer font-bold text-slate-300">Map click-path diagnostics (dev only)</summary>
          <dl className="mt-2 grid grid-cols-1 gap-1 sm:grid-cols-2">
            {[
              ["selected", selected ?? "—"],
              ["flyingTo", flyingTo ?? "—"],
              ["scene key", mapKey],
              ["state shapes loaded", String(shapes?.features.length ?? 0)],
              ["state match", stateShapes ? String(stateShapes.features.length) : "0"],
              ["district shapes loaded", String(districtShapes?.features.length ?? districtShapesError ?? 0)],
              ["districts in state", districtsForState ? String(districtsForState.features.length) : "0"],
              ["aggregate regions joined", String(join.byGeoName.size)],
              ["unmatched codes", join.unmatched.join(", ") || "—"],
              ["mode", mode],
              ["drill rows", drill ? String(drill.rows.length) : "not requested"],
              ["drill district", drillDistrict ?? "—"],
              ["locality rows", drillDetail ? String(drillDetail.rows.length) : "—"],
              ["data error", error ?? "—"],
              ["shapes error", shapesError ?? "—"],
              ["canViewCases", String(canViewCases)],
            ].map(([k, v]) => (
              <div key={k} className="flex gap-2">
                <dt className="w-40 shrink-0 uppercase text-slate-600">{k}</dt>
                <dd className="break-all text-slate-300">{v}</dd>
              </div>
            ))}
          </dl>
        </details>
      )}

      <p className="text-[11px] text-slate-500">
        Boundaries: India boundaries by DataMeet India community (CC BY 4.0), simplified for
        display; district layer: DataMeet Census-2011 districts (CC BY 4.0, ~440 m display
        simplification, Telangana absent — pre-2014 vintage); surrounding landmasses:
        Natural Earth via world-atlas (public domain) — all
        approximate, not for legal or official use. Counts: officer-entered,
        unverified Cyber Sakhi case data. Excluded from located regions:{" "}
        {data?.excludedCounts?.unlocated ?? 0} unlocated · {data?.excludedCounts?.invalidOrIncomplete ?? 0}{" "}
        invalid/incomplete. Layers: production cases + administrative boundaries only —
        external IOCs carry no reliable geography and are never mapped (see External Intelligence).
      </p>
    </div>
  );
}
