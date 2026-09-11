"use client";

import React, { useEffect } from "react";
import { X, Newspaper, ExternalLink, CalendarDays, ShieldCheck } from "lucide-react";
import { cyberSafetyBriefings } from "@/lib/briefings";

interface CyberSafetyBriefingModalProps {
  isOpen: boolean;
  onClose: () => void;
}

const tagStyles: Record<string, string> = {
  Phishing: "bg-emergency-500/15 text-emergency-300 border-emergency-500/30",
  Blackmail: "bg-amber-500/15 text-amber-300 border-amber-500/30",
  "Account Takeover": "bg-violet-500/15 text-violet-300 border-violet-500/30",
  "UPI Fraud": "bg-emerald-500/15 text-emerald-300 border-emerald-500/30",
  Helpline: "bg-sky-500/15 text-sky-300 border-sky-500/30",
};

export function CyberSafetyBriefingModal({ isOpen, onClose }: CyberSafetyBriefingModalProps) {
  useEffect(() => {
    if (!isOpen) return;
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    window.addEventListener("keydown", handleKeyDown);
    document.body.style.overflow = "hidden";
    return () => {
      window.removeEventListener("keydown", handleKeyDown);
      document.body.style.overflow = "";
    };
  }, [isOpen, onClose]);

  if (!isOpen) return null;

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/75 backdrop-blur-sm p-4"
      role="dialog"
      aria-modal="true"
      aria-label="Cyber Safety Briefing"
      onClick={onClose}
    >
      <div
        className="relative w-full max-w-2xl max-h-[85vh] flex flex-col rounded-2xl border border-emergency-700/40 bg-[#0c0c18] shadow-[0_0_80px_rgba(220,38,38,0.15)] overflow-hidden"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div className="flex items-center justify-between px-6 pt-6 pb-4 border-b border-white/5">
          <div>
            <h3 className="text-base sm:text-lg font-bold text-white flex items-center gap-2.5">
              <div className="p-1.5 rounded-lg bg-emergency-600/20 border border-emergency-500/30">
                <Newspaper className="w-4 h-4 text-emergency-400" />
              </div>
              <span>
                Cyber{" "}
                <span className="text-crimson-gradient">Safety</span> Briefing
              </span>
            </h3>
            <p className="text-[11px] text-slate-400 mt-1 tracking-wide">
              In-house safety-desk advisories based on official cybercrime reports.
            </p>
          </div>
          <button
            type="button"
            onClick={onClose}
            aria-label="Close briefing"
            className="p-1.5 rounded-lg text-slate-400 hover:text-white hover:bg-white/5 transition"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* Briefing cards */}
        <div className="flex-1 overflow-y-auto px-6 py-5 space-y-4">
          {cyberSafetyBriefings.map((b, idx) => (
            <article
              key={b.id}
              className="rounded-2xl border border-white/8 bg-white/[0.03] p-4 sm:p-5 transition-colors hover:border-emergency-500/25"
              style={{ animation: `fadeInUp 0.6s ease-out both`, animationDelay: `${idx * 70}ms` }}
            >
              <div className="flex items-center gap-2 mb-2.5">
                <span
                  className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-[10px] font-extrabold tracking-[0.14em] uppercase border ${
                    tagStyles[b.tag] ?? "bg-slate-500/15 text-slate-300 border-slate-500/30"
                  }`}
                >
                  {b.tag}
                </span>
                <span className="inline-flex items-center gap-1 text-[11px] text-slate-500">
                  <CalendarDays className="w-3 h-3" />
                  {b.publishedAt}
                </span>
              </div>
              <h4 className="text-sm sm:text-base font-bold text-white leading-snug">
                {b.headline}
              </h4>
              <p className="mt-2 text-[13px] sm:text-sm text-slate-300/85 leading-relaxed">
                {b.summary}
              </p>
              <div className="mt-3.5 flex items-center justify-between gap-3">
                <span className="text-[11px] text-slate-500 tracking-wide truncate">
                  Source: {b.source}
                </span>
                <a
                  href={b.sourceUrl}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="inline-flex items-center gap-1.5 text-[12px] font-bold text-emergency-300 hover:text-emergency-200 transition-colors shrink-0"
                >
                  Read Full Story
                  <ExternalLink className="w-3.5 h-3.5" />
                </a>
              </div>
            </article>
          ))}
        </div>

        {/* Footer note */}
        <div className="flex items-start gap-2.5 px-6 py-4 border-t border-white/5 bg-black/30">
          <ShieldCheck className="w-4 h-4 text-emerald-400 shrink-0 mt-0.5" />
          <p className="text-[11px] text-slate-400 leading-relaxed">
            In an active fraud, call <strong className="text-emergency-300">1930</strong> within
            the first hour and file the official report at{" "}
            <span className="text-slate-200 font-semibold">cybercrime.gov.in</span>. Save
            screenshots to the Evidence Locker (SHA-256 hashed) before you call.
          </p>
        </div>
      </div>
    </div>
  );
}