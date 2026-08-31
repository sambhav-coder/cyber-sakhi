import React from "react";
import { Phone, ExternalLink, Heart, AlertTriangle } from "lucide-react";
import { CyberSakhiLogo } from "./CyberSakhiLogo";

export const Footer: React.FC = () => {
  return (
    <footer className="border-t border-purple-950/40 bg-[#07070f] text-slate-400 mt-20">
      {/* Emergency Helplines Bar */}
      <div className="bg-purple-950/40 border-b border-purple-900/30 py-3.5 px-4 sm:px-6 lg:px-8">
        <div className="max-w-7xl mx-auto flex flex-wrap items-center justify-between gap-4 text-xs">
          <div className="flex items-center gap-2 text-purple-200 font-semibold">
            <span className="flex h-2 w-2 rounded-full bg-emerald-400 animate-pulse" />
            <span>24/7 National Emergency & Safety Helplines (India):</span>
          </div>
          <div className="flex flex-wrap items-center gap-4 text-slate-300">
            <a
              href="tel:112"
              className="flex items-center gap-1 hover:text-red-400 transition font-mono font-medium"
            >
              <Phone className="w-3.5 h-3.5 text-red-400" />
              <span>112 (National SOS)</span>
            </a>
            <span className="text-slate-600">|</span>
            <a
              href="tel:1091"
              className="flex items-center gap-1 hover:text-purple-400 transition font-mono font-medium"
            >
              <Phone className="w-3.5 h-3.5 text-purple-400" />
              <span>1091 (Women Helpline)</span>
            </a>
            <span className="text-slate-600">|</span>
            <a
              href="tel:1930"
              className="flex items-center gap-1 hover:text-cyan-400 transition font-mono font-medium"
            >
              <Phone className="w-3.5 h-3.5 text-cyan-400" />
              <span>1930 (Cyber Fraud)</span>
            </a>
            <span className="text-slate-600">|</span>
            <a
              href="tel:181"
              className="flex items-center gap-1 hover:text-amber-400 transition font-mono font-medium"
            >
              <Phone className="w-3.5 h-3.5 text-amber-400" />
              <span>181 (Women in Distress)</span>
            </a>
          </div>
        </div>
      </div>

      {/* Main Footer Info */}
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-10">
        <div className="grid grid-cols-1 md:grid-cols-4 gap-8">
          {/* Col 1: About */}
          <div className="md:col-span-2 space-y-3">
            <div className="flex items-center gap-2 text-slate-100 font-bold text-base">
              <CyberSakhiLogo className="w-5 h-5" />
              <span>Cyber Sakhi</span>
            </div>
            <p className="text-xs text-slate-400 leading-relaxed max-w-md">
              Unified AI safety companion offering holistic protection from both online harassment and offline threats. Equipped with on-device NLP threat heuristics, SHA-256 evidence integrity locker, VoiceShield emergency dispatch, and HerGuardian AI guidance.
            </p>
            <div className="flex items-center gap-2 text-xs text-purple-300 font-medium pt-1">
              <span>Presented for Hackathon by</span>
              <span className="px-2 py-0.5 rounded bg-purple-900/50 border border-purple-700/40 text-white font-semibold">
                Team NullPointers
              </span>
            </div>
          </div>

          {/* Col 2: Core Modules */}
          <div className="space-y-2 text-xs">
            <h4 className="font-semibold text-slate-200 uppercase tracking-wider text-[11px]">
              Platform Modules
            </h4>
            <ul className="space-y-1.5 text-slate-400">
              <li>Harassment Threat Detector</li>
              <li>VoiceShield SOS & Detection</li>
              <li>Tamper-Proof Evidence Locker</li>
              <li>Sakhi Companion (HerGuardian)</li>
              <li>Trusted Contact Escalation</li>
              <li>Institutional Admin Portal</li>
              <li>SheShield REST API & SDK</li>
            </ul>
          </div>

          {/* Col 3: Team Credits */}
          <div className="space-y-2 text-xs">
            <h4 className="font-semibold text-slate-200 uppercase tracking-wider text-[11px]">
              Team NullPointers
            </h4>
            <ul className="space-y-1 text-slate-400">
              <li><span className="text-purple-300 font-medium">Prashant Kumar</span> — Team Leader / Research</li>
              <li><span className="text-purple-300 font-medium">Dhairya Sharma</span> — Presentation Lead</li>
              <li><span className="text-purple-300 font-medium">Manav Gupta</span> — Frontend Developer</li>
              <li><span className="text-purple-300 font-medium">Sambhav Yadav</span> — Backend Developer</li>
            </ul>
          </div>
        </div>

        {/* Safety Disclaimer */}
        <div className="mt-8 pt-6 border-t border-slate-800/80 flex flex-col md:flex-row items-center justify-between gap-4 text-[11px] text-slate-500">
          <div className="flex items-center gap-2 max-w-2xl">
            <AlertTriangle className="w-4 h-4 text-amber-500 shrink-0" />
            <span>
              <strong>Disclaimer:</strong> Cyber Sakhi is an AI safety prototype. In situations of imminent danger or legal crisis, please contact local emergency authorities (112) or the National Cyber Crime Reporting Portal (cybercrime.gov.in) immediately.
            </span>
          </div>
          <div className="shrink-0 text-slate-400 flex items-center gap-1">
            <span>Built with care for Round 2</span>
            <Heart className="w-3.5 h-3.5 text-rose-500 fill-rose-500 inline" />
          </div>
        </div>
      </div>
    </footer>
  );
};
