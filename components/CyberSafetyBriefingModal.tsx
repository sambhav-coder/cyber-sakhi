"use client";

import React, { useEffect } from "react";
import { X, ExternalLink } from "lucide-react";
import {
  cyberSafetyBriefings,
  type BriefSourceType,
  type CyberSafetyBrief,
} from "@/lib/briefings";

interface CyberSafetyBriefingModalProps {
  isOpen: boolean;
  onClose: () => void;
}

const sourceTypeLabel: Record<BriefSourceType, string> = {
  news: "News",
  government: "Government",
  advisory: "Advisory",
  report: "Report",
};

const editionDate = new Intl.DateTimeFormat("en-GB", {
  day: "2-digit",
  month: "long",
  year: "numeric",
})
  .format(new Date())
  .toUpperCase();

function SourceTypeLabel({ type }: { type: BriefSourceType }) {
  return (
    <span className="inline-flex items-center border border-neutral-700 px-1.5 py-px text-[9px] font-semibold uppercase tracking-[0.18em] text-neutral-500">
      {sourceTypeLabel[type]}
    </span>
  );
}

function MetaRow({ brief }: { brief: CyberSafetyBrief }) {
  return (
    <div className="flex flex-wrap items-center gap-x-2 gap-y-1 text-[11px] text-neutral-500">
      <span className="font-semibold text-neutral-400">{brief.source}</span>
      <span aria-hidden>·</span>
      <span>{brief.date}</span>
      <SourceTypeLabel type={brief.sourceType} />
    </div>
  );
}

function ReadArticle({ brief }: { brief: CyberSafetyBrief }) {
  if (!brief.url) return null;
  return (
    <a
      href={brief.url}
      target="_blank"
      rel="noopener noreferrer"
      className="group inline-flex items-center gap-1.5 text-[11px] font-semibold uppercase tracking-[0.18em] text-neutral-300 underline underline-offset-4 decoration-neutral-600 hover:text-white hover:decoration-red-400 transition-colors"
    >
      Read article
      <ExternalLink className="w-3.5 h-3.5 transition-transform group-hover:translate-x-0.5 group-hover:-translate-y-0.5" />
    </a>
  );
}

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

  const lead = cyberSafetyBriefings.find((b) => b.lead) ?? cyberSafetyBriefings[0];
  const secondaries = cyberSafetyBriefings.filter((b) => b !== lead);

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 backdrop-blur-sm p-4 sm:p-6"
      role="dialog"
      aria-modal="true"
      aria-label="Cyber Safety Briefing"
      onClick={onClose}
    >
      <div
        className="relative w-full max-w-4xl max-h-[92vh] sm:max-h-[86vh] flex flex-col overflow-hidden rounded-lg border border-white/12 bg-[#101014] text-[#e7e6e1] shadow-[0_30px_90px_-25px_rgba(0,0,0,0.95)]"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Top control bar */}
        <div className="flex items-center justify-between border-b border-neutral-800 px-5 sm:px-8 py-3">
          <span className="text-[10px] font-bold uppercase tracking-[0.28em] text-neutral-500">
            Cybercrime Intelligence · Safety Desk
          </span>
          <button
            type="button"
            onClick={onClose}
            aria-label="Close briefing"
            className="group inline-flex items-center gap-1.5 rounded-md px-2.5 py-1.5 text-neutral-400 hover:bg-white/5 hover:text-white transition"
          >
            <span className="hidden text-[10px] font-bold uppercase tracking-[0.25em] sm:inline">
              Close
            </span>
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* Masthead */}
        <div className="border-b border-neutral-800 px-5 sm:px-8 pb-5 pt-4">
          <div className="flex flex-col items-center border-t-2 border-neutral-600 pt-4 pb-3 text-center">
            <h2 className="font-serif text-3xl font-black uppercase tracking-tight text-[#efeee8] sm:text-4xl">
              Cyber Safety Briefing
            </h2>
            <p className="mt-1 text-[10px] uppercase tracking-[0.3em] text-neutral-500 sm:text-[11px]">
              Sakhi News Desk · India
            </p>
          </div>
          <div className="mt-1 flex flex-wrap items-center justify-between gap-x-3 gap-y-1 border-t border-neutral-700 pt-2.5 text-[9px] font-semibold uppercase tracking-[0.2em] text-neutral-500 sm:text-[10px]">
            <span>Selected reports from the public record</span>
            <span>{editionDate}</span>
          </div>
        </div>

        {/* Scrollable article area */}
        <div className="flex-1 overflow-y-auto overflow-x-hidden">
          <div className="px-5 py-6 sm:px-8 sm:py-7">
            {/* LEAD STORY */}
            {lead && (
              <article className="border-l-[3px] border-red-900/70 pl-4 sm:pl-6">
                <div className="text-[10px] font-bold uppercase tracking-[0.22em] text-red-400/90">
                  {lead.category} — Lead story
                </div>
                <h3 className="mt-2 font-serif text-2xl font-bold leading-tight text-[#f0efe9] sm:text-3xl">
                  {lead.headline}
                </h3>
                <div className="mt-3">
                  <MetaRow brief={lead} />
                </div>
                <p className="mt-3 max-w-2xl text-sm leading-relaxed text-neutral-300 sm:text-[15px]">
                  {lead.summary}
                </p>
                <div className="mt-4">
                  <ReadArticle brief={lead} />
                </div>
              </article>
            )}

            {/* Section divider */}
            <div className="mt-8 mb-7 flex items-center gap-4 text-[10px] font-semibold uppercase tracking-[0.3em] text-neutral-500">
              <div className="h-px flex-1 bg-neutral-800" aria-hidden />
              <span>More from the desk</span>
              <div className="h-px flex-1 bg-neutral-800" aria-hidden />
            </div>

            {/* SECONDARY STORIES */}
            <div className="grid gap-x-8 gap-y-8 sm:grid-cols-2 md:gap-x-10">
              {secondaries.map((b) => (
                <article key={b.id} className="min-w-0">
                  <div className="border-t border-neutral-700/80 pt-4">
                    <div className="text-[9px] font-bold uppercase tracking-[0.2em] text-neutral-400">
                      {b.category}
                    </div>
                    <h4 className="mt-2 font-serif text-lg font-bold leading-snug text-[#ebe9e3] sm:text-xl">
                      {b.headline}
                    </h4>
                    <div className="mt-2.5">
                      <MetaRow brief={b} />
                    </div>
                    <p className="mt-2.5 text-[13px] leading-relaxed text-neutral-400 sm:text-sm">
                      {b.summary}
                    </p>
                    <div className="mt-3.5">
                      <ReadArticle brief={b} />
                    </div>
                  </div>
                </article>
              ))}
            </div>
          </div>
        </div>

        {/* Safety desk note */}
        <div className="border-t-2 border-neutral-800 bg-[#0c0c10]">
          <div className="flex flex-col gap-2 px-5 py-4 sm:flex-row sm:items-start sm:gap-4 sm:px-8">
            <span className="text-[10px] font-bold uppercase tracking-[0.25em] text-neutral-500 sm:pt-0.5 sm:shrink-0">
              Safety desk
            </span>
            <p className="min-w-0 text-[11px] leading-relaxed text-neutral-400 sm:text-xs">
              In an active fraud, call <strong className="font-semibold text-red-400">1930</strong>{" "}
              within the first hour and file a report at{" "}
              <span className="font-semibold text-slate-200">cybercrime.gov.in</span>. Save
              screenshots to the Evidence Locker (SHA-256 hashed) before you call.
            </p>
          </div>
        </div>
      </div>
    </div>
  );
}