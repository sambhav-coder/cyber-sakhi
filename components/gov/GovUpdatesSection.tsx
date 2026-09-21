import React from "react";
import { GovReveal } from "@/components/gov/GovReveal";
import { GovCurrentEvents, type CurrentEvent } from "@/components/gov/GovCurrentEvents";
import { GovCyberNews, type CyberNewsItem } from "@/components/gov/GovCyberNews";

interface GovUpdatesSectionProps {
  onEventClick: (event: CurrentEvent) => void;
  onNewsClick: (news: CyberNewsItem) => void;
}

/**
 * "Latest Updates" two-column band: official Current Events (I4C advisories /
 * press / awareness programmes) beside Facebook Cyber Safety News (CyberDost
 * I4C videos + verified cyber-safety RSS). Every entry opened from here keeps
 * its original official source link inside the modal.
 */
export const GovUpdatesSection: React.FC<GovUpdatesSectionProps> = ({
  onEventClick,
  onNewsClick,
}) => {
  return (
    <section className="relative border-b border-slate-800/60">
      <div className="mx-auto w-full max-w-6xl px-5 py-12 sm:px-8 sm:py-16">
        <GovReveal>
          <div className="mb-8 max-w-2xl">
            <span className="gov-eyebrow">Latest Updates</span>
            <h2 className="mt-4 text-2xl font-black tracking-tight text-slate-50 sm:text-3xl">
              Current Events & Cyber Safety News
            </h2>
            <p className="mt-3 text-sm leading-relaxed text-slate-400 sm:text-base">
              Live cyber-awareness activities, official advisories and cyber
              safety news aggregated from official and verified sources.
            </p>
            <span className="gov-updates-hint mt-4">
              Pause to read · hover, focus, scroll or click an item
            </span>
          </div>
        </GovReveal>

        <div className="grid gap-6 lg:grid-cols-2">
          <GovReveal delay={80}>
            <div className="h-[520px] rounded-2xl border border-slate-700/50 bg-slate-900/40 p-4">
              <GovCurrentEvents onEventClick={onEventClick} />
            </div>
          </GovReveal>

          <GovReveal delay={160}>
            <div className="h-[520px] rounded-2xl border border-slate-700/50 bg-slate-900/40 p-4">
              <GovCyberNews onNewsClick={onNewsClick} />
            </div>
          </GovReveal>
        </div>
      </div>
    </section>
  );
};