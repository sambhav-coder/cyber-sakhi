"use client";

import React, { useEffect, useMemo, useRef, useState } from "react";
import {
  CATEGORY_LABELS,
  CHOROPLETH_STEPS,
  CountryThreatRecord,
  NO_DATA_FILL,
  choroplethBins,
  fillForValue,
} from "@/lib/globalThreatData";

/* ------------------------------------------------------------------ *
 * Interactive choropleth.
 *
 * Geometry is real Natural Earth 1:110m data (the world-atlas package),
 * projected with d3-geo. Both are imported lazily so the ~110KB topology
 * never lands in the initial page bundle.
 *
 * Colour: ONE hue, low -> high, so lightness carries magnitude against
 * the dark surface. Countries absent from the dataset are painted with a
 * neutral "no data" fill rather than being guessed at.
 * ------------------------------------------------------------------ */

const W = 980;
const H = 450;
const ANTARCTICA = "010";

interface CountryShape {
  /** Stable render key. A few Natural Earth features (Kosovo, N. Cyprus,
   *  Somaliland) carry no ISO id, so the id cannot serve as the key. */
  key: string;
  /** ISO 3166-1 numeric, or null for the unassigned territories above. */
  id: string | null;
  name: string;
  d: string;
}

interface WorldThreatMapProps {
  countries: CountryThreatRecord[];
  selectedIso: string | null;
  onSelect: (iso: string | null) => void;
}

export const WorldThreatMap: React.FC<WorldThreatMapProps> = ({
  countries,
  selectedIso,
  onSelect,
}) => {
  const [shapes, setShapes] = useState<CountryShape[] | null>(null);
  const [geoError, setGeoError] = useState<string | null>(null);
  // Keyed by shape, not ISO, so the unassigned territories can be hovered too.
  const [hoveredKey, setHoveredKey] = useState<string | null>(null);
  const [pointer, setPointer] = useState({ x: 0, y: 0 });
  const containerRef = useRef<HTMLDivElement>(null);

  const byIso = useMemo(() => {
    const map = new Map<string, CountryThreatRecord>();
    for (const c of countries) map.set(c.iso, c);
    return map;
  }, [countries]);

  const bins = useMemo(() => choroplethBins(countries), [countries]);

  useEffect(() => {
    let cancelled = false;

    (async () => {
      try {
        const [{ geoNaturalEarth1, geoPath }, { feature }, topoModule] =
          await Promise.all([
            import("d3-geo"),
            import("topojson-client"),
            import("world-atlas/countries-110m.json"),
          ]);

        const topology = (topoModule as { default: unknown }).default ?? topoModule;
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const collection: any = feature(topology as any, (topology as any).objects.countries);

        // Antarctica is excluded so the projection fits the populated world.
        const drawn = collection.features.filter(
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
          (f: any) => String(f.id) !== ANTARCTICA
        );

        const projection = geoNaturalEarth1().fitExtent(
          [
            [4, 4],
            [W - 4, H - 4],
          ],
          { type: "FeatureCollection", features: drawn } as never
        );
        const path = geoPath(projection);

        const next: CountryShape[] = drawn
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
          .map((f: any, i: number) => ({
            key: `shape_${i}`,
            id: f.id == null ? null : String(f.id),
            name: String(f.properties?.name ?? "Unknown"),
            d: path(f) ?? "",
          }))
          .filter((s: CountryShape) => s.d.length > 0);

        if (!cancelled) setShapes(next);
      } catch (err) {
        if (!cancelled) setGeoError(String(err));
      }
    })();

    return () => {
      cancelled = true;
    };
  }, []);

  const hoveredShape = hoveredKey
    ? shapes?.find((s) => s.key === hoveredKey) ?? null
    : null;
  const activeShape =
    hoveredShape ??
    (selectedIso ? shapes?.find((s) => s.id === selectedIso) ?? null : null);
  const activeRecord = activeShape?.id ? byIso.get(activeShape.id) ?? null : null;

  if (geoError) {
    return (
      <div className="py-12 text-center text-xs text-slate-500">
        Map geometry failed to load.
      </div>
    );
  }

  if (!shapes) {
    return (
      <div className="h-[300px] rounded-2xl bg-slate-900/50 animate-pulse flex items-center justify-center">
        <span className="text-xs text-slate-500">Projecting world geometry…</span>
      </div>
    );
  }

  return (
    <div className="space-y-3">
      <div
        ref={containerRef}
        className="relative"
        onMouseMove={(e) => {
          const rect = containerRef.current?.getBoundingClientRect();
          if (rect) setPointer({ x: e.clientX - rect.left, y: e.clientY - rect.top });
        }}
        onMouseLeave={() => setHoveredKey(null)}
      >
        <svg
          viewBox={`0 0 ${W} ${H}`}
          className="w-full h-auto"
          role="img"
          aria-label={`World map shading ${countries.length} countries by reports per million online users.`}
        >
          <g>
            {shapes.map((shape) => {
              const record = shape.id ? byIso.get(shape.id) : undefined;
              const isSelected = shape.id !== null && selectedIso === shape.id;
              const isHovered = hoveredKey === shape.key;
              const dimmed =
                selectedIso !== null && !isSelected && !isHovered;

              return (
                <path
                  key={shape.key}
                  d={shape.d}
                  fill={
                    record ? fillForValue(record.perMillionOnline, bins) : NO_DATA_FILL
                  }
                  stroke={
                    isSelected
                      ? "#fecaca"
                      : isHovered
                      ? "#fca5a5"
                      : "rgba(255,255,255,0.10)"
                  }
                  strokeWidth={isSelected ? 1.6 : isHovered ? 1.2 : 0.4}
                  opacity={dimmed ? 0.55 : 1}
                  className={record ? "cursor-pointer" : "cursor-default"}
                  onMouseEnter={() => setHoveredKey(shape.key)}
                  onClick={() => {
                    if (!record || !shape.id) return;
                    onSelect(isSelected ? null : shape.id);
                  }}
                />
              );
            })}
          </g>
        </svg>

        {activeShape && (
          <div
            className="pointer-events-none absolute z-20 px-3 py-2 rounded-lg bg-slate-950 border border-slate-700 shadow-2xl text-[11px] whitespace-nowrap"
            style={{
              left: Math.min(pointer.x + 14, (containerRef.current?.clientWidth ?? 0) - 210),
              top: Math.max(pointer.y - 12, 0),
            }}
          >
            <div className="font-bold text-slate-100">
              {activeRecord?.name ?? activeShape.name}
            </div>
            {activeRecord ? (
              <div className="space-y-0.5 mt-1 text-slate-400">
                <div>
                  <span className="font-mono text-slate-200">
                    {activeRecord.perMillionOnline}
                  </span>{" "}
                  reports per million online
                </div>
                <div>
                  <span className="font-mono text-slate-200">
                    {activeRecord.reports.toLocaleString("en-IN")}
                  </span>{" "}
                  reports · {activeRecord.criticalShare}% severe
                </div>
                <div className="text-emergency-300">
                  Top: {CATEGORY_LABELS[activeRecord.topCategory]}
                </div>
              </div>
            ) : (
              <div className="mt-0.5 text-slate-500">Not in dataset</div>
            )}
          </div>
        )}
      </div>

      {/* Scale legend — a sequential ramp always ships with one */}
      <div className="flex flex-wrap items-center gap-x-4 gap-y-2">
        <div className="flex items-center gap-2">
          <span className="text-[10px] text-slate-500 uppercase tracking-wider">
            Low
          </span>
          <div className="flex">
            {CHOROPLETH_STEPS.map((step, i) => (
              <span
                key={step}
                className="w-8 h-2.5"
                style={{
                  background: step,
                  borderTopLeftRadius: i === 0 ? 3 : 0,
                  borderBottomLeftRadius: i === 0 ? 3 : 0,
                  borderTopRightRadius: i === CHOROPLETH_STEPS.length - 1 ? 3 : 0,
                  borderBottomRightRadius: i === CHOROPLETH_STEPS.length - 1 ? 3 : 0,
                }}
                aria-hidden
              />
            ))}
          </div>
          <span className="text-[10px] text-slate-500 uppercase tracking-wider">
            High
          </span>
          <span className="text-[10px] text-slate-500">
            reports / million online users
          </span>
        </div>

        <div className="flex items-center gap-1.5">
          <span
            className="w-3 h-2.5 rounded-sm"
            style={{ background: NO_DATA_FILL, outline: "1px solid rgba(255,255,255,0.12)" }}
            aria-hidden
          />
          <span className="text-[10px] text-slate-500">No data</span>
        </div>
      </div>
    </div>
  );
};
