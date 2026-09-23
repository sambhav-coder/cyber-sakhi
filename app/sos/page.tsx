"use client";

import React, { useState, useEffect, useCallback } from "react";
import {
  MapPin,
  PhoneCall,
  Share2,
  Info,
  Loader2,
  AlertTriangle,
  CheckCircle2,
  RefreshCw,
  Clock,
} from "lucide-react";

interface CaseOption {
  id: string;
  case_number: string | null;
  title: string | null;
}

interface CapturedPosition {
  latitude: number;
  longitude: number;
  accuracyM: number | null;
  capturedAt: string;
}

interface SavedLocation {
  id: string;
  latitude: number;
  longitude: number;
  accuracy_m: number | null;
  source: string;
  captured_at: string;
  created_at: string;
}

type CaptureState =
  | { kind: "idle" }
  | { kind: "requesting" }
  | { kind: "captured"; position: CapturedPosition }
  | { kind: "saving"; position: CapturedPosition }
  | { kind: "saved"; position: CapturedPosition; savedId: string }
  | { kind: "error"; message: string };

function isValidCapture(lat: number, lng: number): boolean {
  return (
    Number.isFinite(lat) &&
    Number.isFinite(lng) &&
    lat >= -90 &&
    lat <= 90 &&
    lng >= -180 &&
    lng <= 180
  );
}

function geolocationErrorMessage(code: number): string {
  if (code === 1)
    return "Location permission was denied. Allow location access for this site in your browser settings, then try again. Nothing was captured or stored.";
  if (code === 2)
    return "Your position is currently unavailable (no GPS fix). Move near a window or outdoors and try again. Nothing was captured or stored.";
  if (code === 3)
    return "The location request timed out. Try again. Nothing was captured or stored.";
  return "Could not determine your location. Nothing was captured or stored.";
}

export default function SOSPage() {
  const [cases, setCases] = useState<CaseOption[] | null>(null);
  const [casesError, setCasesError] = useState<string | null>(null);
  const [selectedCaseId, setSelectedCaseId] = useState<string>("");
  const [capture, setCapture] = useState<CaptureState>({ kind: "idle" });
  const [history, setHistory] = useState<SavedLocation[]>([]);
  const [historyError, setHistoryError] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);

  const geoSupported =
    typeof navigator !== "undefined" && !!navigator.geolocation;

  useEffect(() => {
    let cancelled = false;
    void (async () => {
      try {
        const res = await fetch("/api/cases", { cache: "no-store" });
        if (!res.ok) throw new Error(`HTTP ${res.status}`);
        const body = (await res.json()) as { cases?: CaseOption[] };
        if (cancelled) return;
        const list = Array.isArray(body.cases) ? body.cases : [];
        setCases(list);
        if (list.length > 0) setSelectedCaseId(list[0].id);
      } catch {
        if (!cancelled) {
          setCases([]);
          setCasesError("Could not load your cases. You can still capture a location, but saving needs a case.");
        }
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  const loadHistory = useCallback(async (caseId: string) => {
    if (!caseId) {
      setHistory([]);
      return;
    }
    try {
      const res = await fetch(`/api/cases/${caseId}/location`, { cache: "no-store" });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const body = (await res.json()) as { locations?: SavedLocation[] };
      setHistory(Array.isArray(body.locations) ? body.locations : []);
      setHistoryError(null);
    } catch {
      setHistory([]);
      setHistoryError("Could not load saved locations for this case.");
    }
  }, []);

  useEffect(() => {
    void loadHistory(selectedCaseId);
  }, [selectedCaseId, loadHistory]);

  const requestCapture = useCallback(() => {
    if (!geoSupported) {
      setCapture({
        kind: "error",
        message: "This browser does not support geolocation. No location was captured.",
      });
      return;
    }
    setCapture({ kind: "requesting" });
    navigator.geolocation.getCurrentPosition(
      (pos) => {
        const latitude = pos.coords.latitude;
        const longitude = pos.coords.longitude;
        if (!isValidCapture(latitude, longitude)) {
          setCapture({
            kind: "error",
            message: "The browser returned invalid coordinates. Nothing was captured or stored.",
          });
          return;
        }
        setCapture({
          kind: "captured",
          position: {
            latitude,
            longitude,
            accuracyM:
              typeof pos.coords.accuracy === "number" && Number.isFinite(pos.coords.accuracy)
                ? Math.round(pos.coords.accuracy * 100) / 100
                : null,
            capturedAt: new Date(pos.timestamp).toISOString(),
          },
        });
      },
      (err) => {
        setCapture({ kind: "error", message: geolocationErrorMessage(err.code) });
      },
      { enableHighAccuracy: true, timeout: 15000, maximumAge: 0 }
    );
  }, [geoSupported]);

  const saveCapture = useCallback(async () => {
    if (capture.kind !== "captured") return;
    if (!selectedCaseId) {
      setCapture({
        kind: "error",
        message: "Select one of your cases first — a location is always saved to a specific case.",
      });
      return;
    }
    const position = capture.position;
    setCapture({ kind: "saving", position });
    try {
      const res = await fetch(`/api/cases/${selectedCaseId}/location`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          latitude: position.latitude,
          longitude: position.longitude,
          accuracyM: position.accuracyM,
          source: "gps",
          capturedAt: position.capturedAt,
        }),
      });
      if (res.status === 404) {
        setCapture({
          kind: "error",
          message: "That case is not available under your account. Nothing was saved.",
        });
        return;
      }
      if (!res.ok) {
        const body = (await res.json().catch(() => null)) as { error?: string } | null;
        setCapture({
          kind: "error",
          message: body?.error ?? "Could not save the location. Nothing was saved.",
        });
        return;
      }
      const body = (await res.json()) as { location?: { id?: string } };
      setCapture({
        kind: "saved",
        position,
        savedId: typeof body.location?.id === "string" ? body.location.id : "",
      });
      void loadHistory(selectedCaseId);
    } catch {
      setCapture({
        kind: "error",
        message: "Network error while saving. The capture was not saved — try again.",
      });
    }
  }, [capture, selectedCaseId, loadHistory]);

  const captured =
    capture.kind === "captured" || capture.kind === "saving" || capture.kind === "saved"
      ? capture.position
      : null;

  const copyMapsLink = () => {
    if (!captured) return;
    const url = `https://maps.google.com/?q=${captured.latitude},${captured.longitude}`;
    void navigator.clipboard.writeText(url).then(
      () => {
        setCopied(true);
        window.setTimeout(() => setCopied(false), 3000);
      },
      () => undefined
    );
  };

  return (
    <div className="space-y-8 animate-in fade-in duration-300">
      {/* Header */}
      <div className="space-y-1">
        <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-emerald-950/80 border border-emerald-500/40 text-emerald-300 text-xs font-semibold">
          <MapPin className="w-3.5 h-3.5" />
          <span>Live Location · one-time capture</span>
        </div>
        <h1 className="text-2xl sm:text-3xl font-extrabold text-white">Live Location</h1>
        <p className="text-sm text-slate-300 max-w-2xl">
          Capture your current location once, with your permission, and attach it to one of
          your cases. This is <strong>not</strong> an emergency dispatch service and does
          not notify anyone — for immediate danger, call the helplines below.
        </p>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
        {/* Left: capture flow */}
        <div className="lg:col-span-7 space-y-6">
          <div className="p-6 rounded-2xl glass-card space-y-5">
            <h2 className="text-xs font-bold text-slate-200 uppercase tracking-wider flex items-center gap-2">
              <MapPin className="w-4 h-4 text-emerald-400" />
              <span>1 · Choose a case</span>
            </h2>
            {cases === null ? (
              <p className="text-xs text-slate-400 flex items-center gap-2">
                <Loader2 className="w-3.5 h-3.5 animate-spin" /> Loading your cases…
              </p>
            ) : cases.length === 0 ? (
              <p className="text-xs text-amber-300 bg-amber-950/40 border border-amber-500/30 rounded-xl p-3">
                {casesError ?? "You have no cases yet. A location can only be saved to a case — create one from the Detector or Email Forensics flow first."}
              </p>
            ) : (
              <select
                value={selectedCaseId}
                onChange={(e) => {
                  setSelectedCaseId(e.target.value);
                  setCapture({ kind: "idle" });
                }}
                aria-label="Select a case for this location"
                className="w-full rounded-xl bg-slate-900 border border-slate-700 px-3 py-2.5 text-sm text-slate-100"
              >
                {cases.map((c) => (
                  <option key={c.id} value={c.id}>
                    {(c.case_number ?? "Case") + (c.title ? ` — ${c.title}` : "")}
                  </option>
                ))}
              </select>
            )}

            <h2 className="text-xs font-bold text-slate-200 uppercase tracking-wider">
              2 · Capture (asks your browser for permission)
            </h2>
            {!geoSupported && (
              <p className="text-xs text-amber-300 bg-amber-950/40 border border-amber-500/30 rounded-xl p-3">
                Geolocation is not available in this browser, so no location can be captured here.
              </p>
            )}
            <button
              type="button"
              onClick={requestCapture}
              disabled={!geoSupported || capture.kind === "requesting" || capture.kind === "saving"}
              className="w-full sm:w-auto px-6 py-3 rounded-xl bg-emerald-600 hover:bg-emerald-500 disabled:opacity-50 text-white text-sm font-bold transition flex items-center justify-center gap-2"
            >
              {(capture.kind === "requesting" || capture.kind === "saving") && (
                <Loader2 className="w-4 h-4 animate-spin" />
              )}
              {capture.kind === "requesting"
                ? "Waiting for your browser…"
                : capture.kind === "saving"
                  ? "Saving…"
                  : "Use my live location"}
            </button>

            {capture.kind === "error" && (
              <p role="alert" className="text-xs text-red-300 bg-red-950/40 border border-red-500/30 rounded-xl p-3 flex items-start gap-2">
                <AlertTriangle className="w-4 h-4 shrink-0 mt-0.5" />
                <span>{capture.message}</span>
              </p>
            )}

            {captured && (
              <div className="p-4 rounded-xl bg-slate-900/90 border border-slate-800 space-y-2">
                <div className="flex items-center gap-4 text-xs font-mono text-slate-300">
                  <span>Lat: {captured.latitude.toFixed(6)}</span>
                  <span>Lng: {captured.longitude.toFixed(6)}</span>
                </div>
                <div className="flex flex-wrap items-center gap-x-4 gap-y-1 text-xs text-slate-400">
                  <span>
                    Accuracy: {captured.accuracyM === null ? "unknown" : `±${captured.accuracyM} m`}
                    {captured.accuracyM !== null && captured.accuracyM > 500
                      ? " — poor fix, consider retrying outdoors"
                      : ""}
                  </span>
                  <span className="flex items-center gap-1">
                    <Clock className="w-3 h-3" />
                    {new Date(captured.capturedAt).toLocaleString()}
                  </span>
                  <span>One-time capture · no background tracking</span>
                </div>
                <div className="flex flex-wrap items-center gap-2 pt-1">
                  <a
                    href={`https://maps.google.com/?q=${captured.latitude},${captured.longitude}`}
                    target="_blank"
                    rel="noreferrer"
                    className="text-xs text-emerald-400 hover:text-emerald-300 underline font-medium"
                  >
                    View on Google Maps ↗
                  </a>
                  <button
                    type="button"
                    onClick={copyMapsLink}
                    className="px-3 py-1.5 rounded-lg bg-slate-800 hover:bg-slate-700 border border-slate-700 text-slate-200 text-xs font-medium flex items-center gap-1.5 transition"
                  >
                    <Share2 className="w-3.5 h-3.5" />
                    <span>{copied ? "Copied!" : "Copy map link"}</span>
                  </button>
                </div>
                {capture.kind === "captured" && (
                  <button
                    type="button"
                    onClick={saveCapture}
                    disabled={!selectedCaseId}
                    className="mt-1 w-full sm:w-auto px-6 py-2.5 rounded-xl bg-emerald-600 hover:bg-emerald-500 disabled:opacity-50 text-white text-sm font-bold transition"
                  >
                    Save to selected case
                  </button>
                )}
                {capture.kind === "saved" && (
                  <p role="status" className="text-xs text-emerald-300 flex items-center gap-1.5">
                    <CheckCircle2 className="w-4 h-4" />
                    Saved to your case with a server timestamp. Capturing again replaces this preview only — saved records stay in history below.
                  </p>
                )}
              </div>
            )}

            <h2 className="text-xs font-bold text-slate-200 uppercase tracking-wider">
              3 · Saved captures for this case
            </h2>
            {historyError ? (
              <p className="text-xs text-slate-400">{historyError}</p>
            ) : history.length === 0 ? (
              <p className="text-xs text-slate-500">No saved locations for this case yet.</p>
            ) : (
              <ul className="space-y-2">
                {history.map((h) => (
                  <li
                    key={h.id}
                    className="p-3 rounded-xl bg-slate-900/80 border border-slate-800 text-xs flex flex-wrap items-center gap-x-4 gap-y-1"
                  >
                    <span className="font-mono text-slate-300">
                      {Number(h.latitude).toFixed(5)}, {Number(h.longitude).toFixed(5)}
                    </span>
                    <span className="text-slate-500">
                      ±{h.accuracy_m === null ? "?" : h.accuracy_m} m
                    </span>
                    <span className="text-slate-500">
                      {new Date(h.captured_at).toLocaleString()}
                    </span>
                    <a
                      href={`https://maps.google.com/?q=${h.latitude},${h.longitude}`}
                      target="_blank"
                      rel="noreferrer"
                      className="text-emerald-400 hover:text-emerald-300 underline"
                    >
                      Map ↗
                    </a>
                  </li>
                ))}
              </ul>
            )}
            <button
              type="button"
              onClick={() => void loadHistory(selectedCaseId)}
              className="text-xs text-slate-400 hover:text-slate-200 flex items-center gap-1.5"
            >
              <RefreshCw className="w-3.5 h-3.5" /> Refresh history
            </button>
          </div>
        </div>

        {/* Right: real helplines only */}
        <div className="lg:col-span-5 space-y-6">
          <div className="p-6 rounded-2xl glass-panel border-purple-900/40 space-y-4">
            <h2 className="text-xs font-bold text-slate-200 uppercase tracking-wider flex items-center gap-2">
              <PhoneCall className="w-4 h-4 text-purple-400" />
              <span>Direct Emergency Helpline Dials (India)</span>
            </h2>
            <div className="grid grid-cols-2 gap-3">
              <a
                href="tel:112"
                className="p-3 rounded-xl bg-red-950/50 border border-red-500/40 hover:bg-red-900/50 transition flex flex-col items-center justify-center text-center group"
              >
                <div className="text-lg font-black text-red-400 group-hover:scale-105 transition">112</div>
                <div className="text-[11px] font-semibold text-slate-200">National Emergency</div>
                <div className="text-[10px] text-slate-400">Police / Ambulance</div>
              </a>
              <a
                href="tel:1091"
                className="p-3 rounded-xl bg-purple-950/50 border border-purple-500/40 hover:bg-purple-900/50 transition flex flex-col items-center justify-center text-center group"
              >
                <div className="text-lg font-black text-purple-300 group-hover:scale-105 transition">1091</div>
                <div className="text-[11px] font-semibold text-slate-200">Women Helpline</div>
                <div className="text-[10px] text-slate-400">24x7 Safety Response</div>
              </a>
              <a
                href="tel:1930"
                className="p-3 rounded-xl bg-cyan-950/50 border border-cyan-500/40 hover:bg-cyan-900/50 transition flex flex-col items-center justify-center text-center group"
              >
                <div className="text-lg font-black text-cyan-300 group-hover:scale-105 transition">1930</div>
                <div className="text-[11px] font-semibold text-slate-200">Cyber Fraud Helpline</div>
                <div className="text-[10px] text-slate-400">Financial Cyber Cell</div>
              </a>
              <a
                href="tel:181"
                className="p-3 rounded-xl bg-amber-950/50 border border-amber-500/40 hover:bg-amber-900/50 transition flex flex-col items-center justify-center text-center group"
              >
                <div className="text-lg font-black text-amber-300 group-hover:scale-105 transition">181</div>
                <div className="text-[11px] font-semibold text-slate-200">Women in Distress</div>
                <div className="text-[10px] text-slate-400">Domestic & Legal Help</div>
              </a>
            </div>
            <div className="p-3 rounded-xl bg-slate-900/80 border border-slate-800 text-[11px] text-slate-400 flex items-start gap-2">
              <Info className="w-4 h-4 text-purple-400 shrink-0 mt-0.5" />
              <span>
                NCW WhatsApp Helpline: <strong>+91 7827170170</strong>. Use in situations where voice calls are unsafe.
              </span>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
