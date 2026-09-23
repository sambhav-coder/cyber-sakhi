"use client";

import React, { useState, useEffect } from "react";
import Link from "next/link";
import {
  X,
  PhoneCall,
  Share2,
  MapPin,
  Loader2,
  AlertTriangle,
} from "lucide-react";

interface SOSModalProps {
  isOpen: boolean;
  onClose: () => void;
}

type ModalState =
  | { kind: "idle" }
  | { kind: "requesting" }
  | {
      kind: "captured";
      latitude: number;
      longitude: number;
      accuracyM: number | null;
      capturedAt: string;
    }
  | { kind: "error"; message: string };

function geolocationErrorMessage(code: number): string {
  if (code === 1)
    return "Location permission was denied. Nothing was captured.";
  if (code === 2) return "Position unavailable right now. Nothing was captured.";
  if (code === 3) return "The request timed out. Nothing was captured.";
  return "Could not determine your location. Nothing was captured.";
}

/**
 * Global quick action (AppShell/Navbar): honest one-time GPS readout.
 * Makes NO dispatch claims, stores nothing, shows no fake coordinates —
 * saving to a case happens explicitly on the Live Location page.
 */
export const SOSModal: React.FC<SOSModalProps> = ({ isOpen, onClose }) => {
  const [state, setState] = useState<ModalState>({ kind: "idle" });
  const [copied, setCopied] = useState(false);

  useEffect(() => {
    if (isOpen) {
      setState({ kind: "idle" });
      setCopied(false);
    }
  }, [isOpen]);

  if (!isOpen) return null;

  const requestCapture = () => {
    if (!navigator.geolocation) {
      setState({ kind: "error", message: "Geolocation is not available in this browser." });
      return;
    }
    setState({ kind: "requesting" });
    navigator.geolocation.getCurrentPosition(
      (pos) => {
        const { latitude, longitude, accuracy } = pos.coords;
        if (
          !Number.isFinite(latitude) ||
          !Number.isFinite(longitude) ||
          latitude < -90 ||
          latitude > 90 ||
          longitude < -180 ||
          longitude > 180
        ) {
          setState({ kind: "error", message: "The browser returned invalid coordinates." });
          return;
        }
        setState({
          kind: "captured",
          latitude,
          longitude,
          accuracyM: typeof accuracy === "number" && Number.isFinite(accuracy) ? accuracy : null,
          capturedAt: new Date(pos.timestamp).toISOString(),
        });
      },
      (err) => setState({ kind: "error", message: geolocationErrorMessage(err.code) }),
      { enableHighAccuracy: true, timeout: 15000, maximumAge: 0 }
    );
  };

  const copyLink = () => {
    if (state.kind !== "captured") return;
    void navigator.clipboard
      .writeText(`https://maps.google.com/?q=${state.latitude},${state.longitude}`)
      .then(
        () => setCopied(true),
        () => undefined
      );
    window.setTimeout(() => setCopied(false), 3000);
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/85 backdrop-blur-xl animate-in fade-in duration-200">
      <div className="relative w-full max-w-xl rounded-2xl border border-emerald-500/40 bg-[#0b1512] shadow-[0_0_40px_rgba(16,185,129,0.25)] p-6 sm:p-8 text-white overflow-hidden">
        <button
          onClick={onClose}
          className="absolute top-4 right-4 p-2 text-slate-400 hover:text-white rounded-full bg-slate-800/50 hover:bg-slate-700/60 transition"
          aria-label="Close modal"
        >
          <X className="w-5 h-5" />
        </button>

        <div className="space-y-5">
          <div className="flex items-center gap-3">
            <div className="p-2.5 bg-emerald-600/30 border border-emerald-500/60 rounded-xl text-emerald-300">
              <MapPin className="w-7 h-7" />
            </div>
            <div>
              <h2 className="text-xl font-bold text-emerald-200">Live Location</h2>
              <p className="text-xs text-slate-400">
                One-time GPS readout — nothing is sent anywhere from here.
              </p>
            </div>
          </div>

          {state.kind === "idle" && (
            <div className="space-y-3">
              <p className="text-sm text-slate-300">
                Your browser will ask for location permission. The coordinates are shown
                only to you, once — they are not tracked, stored, or shared.
              </p>
              <button
                type="button"
                onClick={requestCapture}
                className="w-full py-3 px-4 rounded-xl bg-emerald-600 hover:bg-emerald-500 text-white font-semibold text-sm transition"
              >
                Use my live location
              </button>
            </div>
          )}

          {state.kind === "requesting" && (
            <p className="text-sm text-slate-300 flex items-center gap-2">
              <Loader2 className="w-4 h-4 animate-spin" /> Waiting for your browser…
            </p>
          )}

          {state.kind === "error" && (
            <div className="space-y-3">
              <p role="alert" className="text-sm text-red-300 bg-red-950/40 border border-red-500/30 rounded-xl p-3 flex items-start gap-2">
                <AlertTriangle className="w-4 h-4 shrink-0 mt-0.5" />
                <span>{state.message}</span>
              </p>
              <button
                type="button"
                onClick={requestCapture}
                className="w-full py-2.5 px-4 rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-200 text-sm transition"
              >
                Try again
              </button>
            </div>
          )}

          {state.kind === "captured" && (
            <div className="space-y-3">
              <div className="p-3.5 rounded-xl bg-slate-900/80 border border-slate-700/60 space-y-1.5">
                <p className="text-sm font-semibold font-mono text-slate-100">
                  {state.latitude.toFixed(6)}, {state.longitude.toFixed(6)}
                </p>
                <p className="text-xs text-slate-400">
                  Accuracy {state.accuracyM === null ? "unknown" : `±${Math.round(state.accuracyM)} m`} ·{" "}
                  {new Date(state.capturedAt).toLocaleString()} · one-time only
                </p>
              </div>
              <div className="flex flex-col sm:flex-row gap-2">
                <button
                  type="button"
                  onClick={copyLink}
                  className="flex-1 py-2.5 px-4 rounded-xl bg-emerald-600/30 border border-emerald-500/50 hover:bg-emerald-600/40 text-emerald-200 font-medium text-xs flex items-center justify-center gap-2 transition"
                >
                  <Share2 className="w-4 h-4" />
                  {copied ? "✓ Map link copied" : "Copy map link"}
                </button>
                <Link
                  href="/sos"
                  onClick={onClose}
                  className="flex-1 py-2.5 px-4 rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-200 text-xs font-medium transition text-center"
                >
                  Save to a case →
                </Link>
              </div>
            </div>
          )}

          <div className="grid grid-cols-3 gap-2 pt-1">
            <a
              href="tel:112"
              className="flex flex-col items-center justify-center p-3 rounded-xl bg-red-950/70 border border-red-500/40 hover:bg-red-900/60 text-red-200 transition text-center"
            >
              <PhoneCall className="w-5 h-5 text-red-400 mb-1" />
              <span className="text-sm font-bold">112</span>
              <span className="text-[10px] text-red-300/80">National SOS</span>
            </a>
            <a
              href="tel:1091"
              className="flex flex-col items-center justify-center p-3 rounded-xl bg-purple-950/70 border border-purple-500/40 hover:bg-purple-900/60 text-purple-200 transition text-center"
            >
              <PhoneCall className="w-5 h-5 text-purple-400 mb-1" />
              <span className="text-sm font-bold">1091</span>
              <span className="text-[10px] text-purple-300/80">Women Helpline</span>
            </a>
            <a
              href="tel:1930"
              className="flex flex-col items-center justify-center p-3 rounded-xl bg-cyan-950/70 border border-cyan-500/40 hover:bg-cyan-900/60 text-cyan-200 transition text-center"
            >
              <PhoneCall className="w-5 h-5 text-cyan-400 mb-1" />
              <span className="text-sm font-bold">1930</span>
              <span className="text-[10px] text-cyan-300/80">Cyber Fraud</span>
            </a>
          </div>
        </div>
      </div>
    </div>
  );
};
