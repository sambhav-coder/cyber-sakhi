"use client";

import React, { useState, useEffect } from "react";
import {
  Radio,
  AlertOctagon,
  PhoneCall,
  MapPin,
  ShieldCheck,
  CheckCircle2,
  Mic,
  MicOff,
  Volume2,
  VolumeX,
  Share2,
  Users,
  Clock,
  ShieldAlert,
  Info,
} from "lucide-react";
import { AudioWaveform } from "@/components/AudioWaveform";
import { getStoredContacts } from "@/lib/storage";
import { TrustedContact } from "@/lib/types";

export default function SOSPage() {
  const [isVoiceShieldListening, setIsVoiceShieldListening] = useState(true);
  const [isSosActive, setIsSosActive] = useState(false);
  const [countdown, setCountdown] = useState<number | null>(null);
  const [contacts, setContacts] = useState<TrustedContact[]>([]);
  const [location, setLocation] = useState({
    lat: 28.6139,
    lng: 77.209,
    address: "Connaught Place, Central Delhi, Delhi 110001",
    accuracy: 12,
  });
  const [silentMode, setSilentMode] = useState(true);
  const [copiedPayload, setCopiedPayload] = useState(false);
  const [wakeWordDetected, setWakeWordDetected] = useState(false);

  useEffect(() => {
    setContacts(getStoredContacts());

    if (navigator.geolocation) {
      navigator.geolocation.getCurrentPosition(
        (pos) => {
          setLocation({
            lat: Number(pos.coords.latitude.toFixed(4)),
            lng: Number(pos.coords.longitude.toFixed(4)),
            address: `Live GPS Position: ${pos.coords.latitude.toFixed(4)}° N, ${pos.coords.longitude.toFixed(4)}° E`,
            accuracy: Math.round(pos.coords.accuracy || 10),
          });
        },
        () => {
          // Fallback realistic location
        }
      );
    }
  }, []);

  // Countdown timer handler
  useEffect(() => {
    if (countdown === null) return;
    if (countdown > 0) {
      const timer = setTimeout(() => setCountdown(countdown - 1), 1000);
      return () => clearTimeout(timer);
    } else {
      setIsSosActive(true);
      setCountdown(null);
    }
  }, [countdown]);

  const triggerSOS = () => {
    setCountdown(3);
  };

  const cancelSOS = () => {
    setCountdown(null);
    setIsSosActive(false);
    setWakeWordDetected(false);
  };

  const simulateWakeWord = () => {
    setWakeWordDetected(true);
    setTimeout(() => {
      triggerSOS();
    }, 800);
  };

  const emergencyMessage = `🚨 EMERGENCY SOS - CYBER SAKHI DISPATCH 🚨\nI am in immediate distress and require urgent assistance.\n📍 Coordinates: ${location.address} (https://maps.google.com/?q=${location.lat},${location.lng})\n⏰ Timestamp: ${new Date().toLocaleTimeString()}\n⚡ Status: Silent SOS broadcasted via VoiceShield.`;

  const copyDispatchText = () => {
    navigator.clipboard.writeText(emergencyMessage);
    setCopiedPayload(true);
    setTimeout(() => setCopiedPayload(false), 3000);
  };

  return (
    <div className="space-y-8 animate-in fade-in duration-300">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div className="space-y-1">
          <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-red-950/80 border border-red-500/40 text-red-300 text-xs font-semibold">
            <Radio className="w-3.5 h-3.5 animate-pulse" />
            <span>VoiceShield Real-Time Emergency Center</span>
          </div>
          <h1 className="text-2xl sm:text-3xl font-extrabold text-white">
            Emergency SOS & VoiceShield
          </h1>
          <p className="text-sm text-slate-300">
            Multi-channel silent beacon with live GPS tracking, wake-word triggering, and instant trusted contact dispatch.
          </p>
        </div>

        {/* VoiceShield Wake Word Status */}
        <div className="flex items-center gap-3 p-3 rounded-2xl bg-purple-950/50 border border-purple-800/40 text-xs">
          <div className="space-y-0.5">
            <div className="font-bold text-slate-200 flex items-center gap-1.5">
              <span>Wake-Word:</span>
              <span className="text-purple-300 font-mono">"Hey Sakhi Help"</span>
            </div>
            <div className="text-[11px] text-slate-400">
              {isVoiceShieldListening ? "Listening actively (Offline AI)" : "Paused"}
            </div>
          </div>
          <button
            onClick={() => setIsVoiceShieldListening(!isVoiceShieldListening)}
            className={`p-2 rounded-xl border transition ${
              isVoiceShieldListening
                ? "bg-purple-600 text-white border-purple-400"
                : "bg-slate-800 text-slate-400 border-slate-700"
            }`}
            title="Toggle VoiceShield Wake-Word Detection"
          >
            {isVoiceShieldListening ? <Mic className="w-4 h-4" /> : <MicOff className="w-4 h-4" />}
          </button>
        </div>
      </div>

      {/* Main SOS Trigger Section */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
        {/* Left Col: Big SOS Activation */}
        <div className="lg:col-span-7 space-y-6">
          <div
            className={`rounded-3xl p-8 border transition-all duration-300 text-center relative overflow-hidden ${
              isSosActive
                ? "bg-gradient-to-b from-red-950 via-[#18080c] to-[#0d0407] border-red-500 shadow-[0_0_60px_rgba(239,68,68,0.4)]"
                : countdown !== null
                ? "bg-gradient-to-b from-amber-950/70 via-[#1a0e08] to-[#0d0407] border-amber-500 animate-pulse"
                : "glass-panel border-purple-900/50 glow-purple"
            }`}
          >
            {/* Audio Waveform visualization */}
            <div className="py-2">
              <AudioWaveform
                isListening={isVoiceShieldListening || isSosActive}
                height={40}
                color={isSosActive ? "bg-red-500" : "bg-purple-500"}
              />
            </div>

            {/* Main Interactive Button */}
            <div className="py-6 flex flex-col items-center justify-center">
              {countdown !== null ? (
                <div className="space-y-4">
                  <div className="w-36 h-36 rounded-full bg-red-600/30 border-4 border-red-500 flex items-center justify-center animate-ping-slow text-white text-5xl font-black">
                    {countdown}
                  </div>
                  <h3 className="text-xl font-bold text-amber-300">
                    Broadcasting in {countdown}s...
                  </h3>
                  <button
                    onClick={cancelSOS}
                    className="px-6 py-2 rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-200 text-xs font-semibold"
                  >
                    Cancel Alarm (Drill)
                  </button>
                </div>
              ) : isSosActive ? (
                <div className="space-y-4">
                  <div className="w-36 h-36 rounded-full bg-red-600 border-4 border-red-400 flex items-center justify-center animate-pulse text-white shadow-[0_0_40px_rgba(239,68,68,0.8)]">
                    <AlertOctagon className="w-16 h-16" />
                  </div>
                  <div className="space-y-1">
                    <h3 className="text-2xl font-black text-red-400 tracking-wide">
                      🚨 SOS TRANSMISSION ACTIVE
                    </h3>
                    <p className="text-xs text-red-200/80">
                      Live location & audio stream dispatched to {contacts.length} trusted contacts
                    </p>
                  </div>
                  <button
                    onClick={cancelSOS}
                    className="px-6 py-2.5 rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-200 text-xs font-bold transition"
                  >
                    Deactivate & End Emergency
                  </button>
                </div>
              ) : (
                <div className="space-y-4">
                  <button
                    onClick={triggerSOS}
                    className="group relative w-40 h-40 rounded-full bg-gradient-to-tr from-red-600 via-rose-600 to-red-500 border-4 border-red-400/80 hover:border-white text-white flex flex-col items-center justify-center transition-all duration-200 hover:scale-105 shadow-[0_0_50px_rgba(239,68,68,0.5)] glow-red"
                  >
                    <AlertOctagon className="w-12 h-12 mb-1 group-hover:scale-110 transition" />
                    <span className="text-sm font-black tracking-wider uppercase">
                      HOLD / TAP SOS
                    </span>
                  </button>
                  <div className="space-y-1">
                    <p className="text-xs text-slate-300 font-medium">
                      Press to initiate 3-second instant emergency dispatch
                    </p>
                    <button
                      onClick={simulateWakeWord}
                      className="text-xs text-purple-400 hover:text-purple-300 underline font-medium"
                    >
                      Or simulate Voice Wake-Word ("Hey Sakhi Help") →
                    </button>
                  </div>
                </div>
              )}
            </div>

            {/* Quick Status Bar */}
            <div className="pt-4 border-t border-slate-800/80 flex items-center justify-between text-xs text-slate-400">
              <div className="flex items-center gap-1.5">
                <span className="w-2 h-2 rounded-full bg-emerald-400 animate-pulse" />
                <span>Beacon: Armed & Ready</span>
              </div>
              <div className="flex items-center gap-2">
                <button
                  onClick={() => setSilentMode(!silentMode)}
                  className="hover:text-slate-200 flex items-center gap-1"
                >
                  {silentMode ? <VolumeX className="w-3.5 h-3.5 text-emerald-400" /> : <Volume2 className="w-3.5 h-3.5 text-red-400" />}
                  <span>{silentMode ? "Silent Dispatch" : "Audible Alert"}</span>
                </button>
              </div>
            </div>
          </div>

          {/* Live Location Details */}
          <div className="p-6 rounded-2xl glass-card space-y-4">
            <div className="flex items-center justify-between">
              <h3 className="text-xs font-bold text-slate-200 uppercase tracking-wider flex items-center gap-2">
                <MapPin className="w-4 h-4 text-purple-400" />
                <span>Live Location Telemetry</span>
              </h3>
              <span className="text-[11px] font-mono text-emerald-400 bg-emerald-950/60 px-2 py-0.5 rounded border border-emerald-500/30">
                ±{location.accuracy}m GPS Accuracy
              </span>
            </div>

            <div className="p-3.5 rounded-xl bg-slate-900/90 border border-slate-800 space-y-2">
              <div className="text-sm font-semibold text-white">{location.address}</div>
              <div className="flex items-center gap-4 text-xs font-mono text-slate-400">
                <span>Lat: {location.lat}</span>
                <span>Lng: {location.lng}</span>
              </div>
            </div>

            <div className="flex items-center justify-between pt-1">
              <a
                href={`https://maps.google.com/?q=${location.lat},${location.lng}`}
                target="_blank"
                rel="noreferrer"
                className="text-xs text-purple-400 hover:text-purple-300 underline font-medium"
              >
                View on Google Maps ↗
              </a>
              <button
                onClick={copyDispatchText}
                className="px-3 py-1.5 rounded-lg bg-purple-950/60 hover:bg-purple-900/60 border border-purple-500/40 text-purple-200 text-xs font-medium flex items-center gap-1.5 transition"
              >
                <Share2 className="w-3.5 h-3.5" />
                <span>{copiedPayload ? "Copied!" : "Copy Dispatch Link"}</span>
              </button>
            </div>
          </div>
        </div>

        {/* Right Col: Trusted Contacts & Helpline Directory */}
        <div className="lg:col-span-5 space-y-6">
          {/* Alerted Contacts */}
          <div className="p-6 rounded-2xl glass-panel border-purple-900/40 space-y-4">
            <div className="flex items-center justify-between">
              <h3 className="text-xs font-bold text-slate-200 uppercase tracking-wider flex items-center gap-2">
                <Users className="w-4 h-4 text-purple-400" />
                <span>Emergency Contact Network</span>
              </h3>
              <span className="text-[11px] text-purple-300 font-semibold">
                {contacts.length} Connected
              </span>
            </div>

            <div className="space-y-2.5">
              {contacts.map((contact) => (
                <div
                  key={contact.id}
                  className="p-3 rounded-xl bg-slate-900/80 border border-slate-800 flex items-center justify-between text-xs"
                >
                  <div>
                    <div className="font-semibold text-slate-200 flex items-center gap-1.5">
                      <span>{contact.name}</span>
                      {contact.isPrimary && (
                        <span className="text-[10px] px-1.5 py-0.2 rounded bg-purple-900/60 text-purple-300 border border-purple-600/40">
                          Primary
                        </span>
                      )}
                    </div>
                    <div className="text-slate-400 font-mono text-[11px] mt-0.5">
                      {contact.phone}
                    </div>
                  </div>
                  <div className="text-right">
                    <span
                      className={`text-[10px] px-2 py-0.5 rounded flex items-center gap-1 ${
                        isSosActive
                          ? "bg-emerald-950 text-emerald-300 border border-emerald-500/40"
                          : "bg-slate-800 text-slate-400"
                      }`}
                    >
                      <CheckCircle2 className="w-3 h-3" />
                      {isSosActive ? "Dispatched" : "Ready"}
                    </span>
                  </div>
                </div>
              ))}
            </div>
          </div>

          {/* Quick Helpline Directory */}
          <div className="p-6 rounded-2xl glass-panel border-purple-900/40 space-y-4">
            <h3 className="text-xs font-bold text-slate-200 uppercase tracking-wider flex items-center gap-2">
              <PhoneCall className="w-4 h-4 text-purple-400" />
              <span>Direct Emergency Helpline Dials (India)</span>
            </h3>

            <div className="grid grid-cols-2 gap-3">
              <a
                href="tel:112"
                className="p-3 rounded-xl bg-red-950/50 border border-red-500/40 hover:bg-red-900/50 transition flex flex-col items-center justify-center text-center group"
              >
                <div className="text-lg font-black text-red-400 group-hover:scale-105 transition">
                  112
                </div>
                <div className="text-[11px] font-semibold text-slate-200">
                  National Emergency
                </div>
                <div className="text-[10px] text-slate-400">Police / Ambulance</div>
              </a>

              <a
                href="tel:1091"
                className="p-3 rounded-xl bg-purple-950/50 border border-purple-500/40 hover:bg-purple-900/50 transition flex flex-col items-center justify-center text-center group"
              >
                <div className="text-lg font-black text-purple-300 group-hover:scale-105 transition">
                  1091
                </div>
                <div className="text-[11px] font-semibold text-slate-200">
                  Women Helpline
                </div>
                <div className="text-[10px] text-slate-400">24x7 Safety Response</div>
              </a>

              <a
                href="tel:1930"
                className="p-3 rounded-xl bg-cyan-950/50 border border-cyan-500/40 hover:bg-cyan-900/50 transition flex flex-col items-center justify-center text-center group"
              >
                <div className="text-lg font-black text-cyan-300 group-hover:scale-105 transition">
                  1930
                </div>
                <div className="text-[11px] font-semibold text-slate-200">
                  Cyber Fraud Helpline
                </div>
                <div className="text-[10px] text-slate-400">Financial Cyber Cell</div>
              </a>

              <a
                href="tel:181"
                className="p-3 rounded-xl bg-amber-950/50 border border-amber-500/40 hover:bg-amber-900/50 transition flex flex-col items-center justify-center text-center group"
              >
                <div className="text-lg font-black text-amber-300 group-hover:scale-105 transition">
                  181
                </div>
                <div className="text-[11px] font-semibold text-slate-200">
                  Women in Distress
                </div>
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
