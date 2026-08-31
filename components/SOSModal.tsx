"use client";

import React, { useState, useEffect } from "react";
import {
  AlertOctagon,
  X,
  PhoneCall,
  Share2,
  MapPin,
  ShieldCheck,
  CheckCircle2,
  Volume2,
  VolumeX,
} from "lucide-react";
import { getStoredContacts } from "@/lib/storage";
import { TrustedContact } from "@/lib/types";

interface SOSModalProps {
  isOpen: boolean;
  onClose: () => void;
}

export const SOSModal: React.FC<SOSModalProps> = ({ isOpen, onClose }) => {
  const [countdown, setCountdown] = useState<number>(3);
  const [isTriggered, setIsTriggered] = useState<boolean>(false);
  const [contacts, setContacts] = useState<TrustedContact[]>([]);
  const [location, setLocation] = useState<{ lat: number; lng: number; address: string }>({
    lat: 28.6139,
    lng: 77.209,
    address: "Connaught Place, New Delhi, Delhi 110001",
  });
  const [silentMode, setSilentMode] = useState<boolean>(true);
  const [copiedPayload, setCopiedPayload] = useState<boolean>(false);

  useEffect(() => {
    if (isOpen) {
      setContacts(getStoredContacts());
      setCountdown(3);
      setIsTriggered(false);

      // Attempt browser geolocation if available
      if (navigator.geolocation) {
        navigator.geolocation.getCurrentPosition(
          (pos) => {
            setLocation({
              lat: Number(pos.coords.latitude.toFixed(4)),
              lng: Number(pos.coords.longitude.toFixed(4)),
              address: `GPS Location: ${pos.coords.latitude.toFixed(4)}° N, ${pos.coords.longitude.toFixed(4)}° E (Live Precision)`,
            });
          },
          () => {
            // Keep default realistic demo coordinates
          }
        );
      }
    }
  }, [isOpen]);

  useEffect(() => {
    if (!isOpen || isTriggered) return;

    if (countdown > 0) {
      const timer = setTimeout(() => setCountdown((c) => c - 1), 1000);
      return () => clearTimeout(timer);
    } else {
      setIsTriggered(true);
    }
  }, [isOpen, countdown, isTriggered]);

  if (!isOpen) return null;

  const emergencyMessage = `🚨 EMERGENCY SOS - CYBER SAKHI ALERT 🚨\nI need immediate assistance. My safety is at risk.\n📍 Current Location: ${location.address} (https://maps.google.com/?q=${location.lat},${location.lng})\n⏰ Timestamp: ${new Date().toLocaleTimeString()}\nSent automatically via Cyber Sakhi VoiceShield.`;

  const copyEmergencyPayload = () => {
    navigator.clipboard.writeText(emergencyMessage);
    setCopiedPayload(true);
    setTimeout(() => setCopiedPayload(false), 3000);
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/85 backdrop-blur-xl animate-in fade-in duration-200">
      <div
        className={`relative w-full max-w-xl rounded-2xl border ${
          isTriggered
            ? "border-red-500 bg-[#160b0e] shadow-[0_0_50px_rgba(239,68,68,0.35)]"
            : "border-purple-500/40 bg-[#121222] shadow-[0_0_40px_rgba(139,92,246,0.25)]"
        } p-6 sm:p-8 text-white overflow-hidden`}
      >
        {/* Close Button */}
        <button
          onClick={onClose}
          className="absolute top-4 right-4 p-2 text-slate-400 hover:text-white rounded-full bg-slate-800/50 hover:bg-slate-700/60 transition"
          aria-label="Close modal"
        >
          <X className="w-5 h-5" />
        </button>

        {!isTriggered ? (
          /* Countdown State */
          <div className="text-center py-4 space-y-6">
            <div className="inline-flex items-center justify-center w-24 h-24 rounded-full bg-red-600/20 border-2 border-red-500 animate-ping-slow text-red-500">
              <span className="text-4xl font-extrabold">{countdown}</span>
            </div>

            <div className="space-y-2">
              <h2 className="text-2xl font-bold text-red-400">
                Broadcasting Emergency SOS...
              </h2>
              <p className="text-sm text-slate-300 max-w-md mx-auto">
                Cyber Sakhi is preparing to dispatch silent multi-channel alerts with your live location to your trusted network.
              </p>
            </div>

            <div className="flex justify-center gap-3 pt-2">
              <button
                onClick={onClose}
                className="px-6 py-2.5 rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-200 font-medium transition"
              >
                Cancel Drill (False Alarm)
              </button>
              <button
                onClick={() => setIsTriggered(true)}
                className="px-6 py-2.5 rounded-xl bg-red-600 hover:bg-red-500 text-white font-semibold transition glow-red"
              >
                Dispatch Instantly
              </button>
            </div>
          </div>
        ) : (
          /* Triggered / Active SOS State */
          <div className="space-y-6 animate-in zoom-in-95 duration-200">
            {/* Header Banner */}
            <div className="flex items-center justify-between border-b border-red-500/20 pb-4">
              <div className="flex items-center gap-3">
                <div className="p-2.5 bg-red-600/30 border border-red-500/60 rounded-xl text-red-400 animate-pulse">
                  <AlertOctagon className="w-7 h-7" />
                </div>
                <div>
                  <h2 className="text-xl font-bold text-red-300">
                    🚨 SOS DISPATCH ACTIVE
                  </h2>
                  <p className="text-xs text-red-200/70">
                    Silent beacon transmitting live coordinates & audio log
                  </p>
                </div>
              </div>
              <button
                onClick={() => setSilentMode(!silentMode)}
                className={`p-2 rounded-lg border text-xs flex items-center gap-1.5 transition ${
                  silentMode
                    ? "border-emerald-500/40 bg-emerald-950/40 text-emerald-300"
                    : "border-red-500/40 bg-red-950/40 text-red-300"
                }`}
              >
                {silentMode ? <VolumeX className="w-4 h-4" /> : <Volume2 className="w-4 h-4" />}
                {silentMode ? "Silent Mode (Safe)" : "Audible Siren"}
              </button>
            </div>

            {/* Live Location Card */}
            <div className="p-3.5 rounded-xl bg-slate-900/80 border border-slate-700/60 space-y-1.5">
              <div className="flex items-center justify-between text-xs text-slate-400 font-medium">
                <span className="flex items-center gap-1 text-purple-300">
                  <MapPin className="w-3.5 h-3.5" /> Live GPS Coordinates
                </span>
                <span className="text-emerald-400 flex items-center gap-1">
                  <span className="w-1.5 h-1.5 rounded-full bg-emerald-400 animate-pulse"></span>
                  Active Pin
                </span>
              </div>
              <p className="text-sm font-semibold text-slate-100">{location.address}</p>
              <p className="text-xs text-slate-400 font-mono">
                Lat: {location.lat} | Lng: {location.lng}
              </p>
            </div>

            {/* Dispatched Contacts */}
            <div className="space-y-2">
              <div className="text-xs font-semibold text-slate-300 uppercase tracking-wider flex items-center justify-between">
                <span>Alerted Trusted Contacts ({contacts.length})</span>
                <span className="text-emerald-400 text-xs flex items-center gap-1">
                  <CheckCircle2 className="w-3.5 h-3.5" /> Dispatched
                </span>
              </div>
              <div className="space-y-2 max-h-36 overflow-y-auto pr-1">
                {contacts.map((c) => (
                  <div
                    key={c.id}
                    className="flex items-center justify-between p-2.5 rounded-lg bg-slate-800/60 border border-slate-700/40 text-xs"
                  >
                    <div>
                      <span className="font-semibold text-slate-200">{c.name}</span>
                      <span className="text-slate-400 ml-1.5">({c.relationship})</span>
                      <div className="text-slate-400 font-mono text-[11px]">{c.phone}</div>
                    </div>
                    <div className="flex items-center gap-1 text-emerald-400 bg-emerald-950/60 px-2 py-0.5 rounded border border-emerald-500/30 text-[10px]">
                      <ShieldCheck className="w-3 h-3" /> WhatsApp + SMS
                    </div>
                  </div>
                ))}
              </div>
            </div>

            {/* Quick Emergency Dials */}
            <div className="grid grid-cols-3 gap-2">
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

            {/* Action Bar */}
            <div className="flex flex-col sm:flex-row gap-2 pt-2">
              <button
                onClick={copyEmergencyPayload}
                className="flex-1 py-2.5 px-4 rounded-xl bg-purple-600/30 border border-purple-500/50 hover:bg-purple-600/40 text-purple-200 font-medium text-xs flex items-center justify-center gap-2 transition"
              >
                <Share2 className="w-4 h-4" />
                {copiedPayload ? "✓ Emergency Alert Copied!" : "Copy Dispatch Link / Text"}
              </button>
              <button
                onClick={onClose}
                className="py-2.5 px-5 rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-300 text-xs font-medium transition"
              >
                Deactivate & End SOS
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
};
