import React from "react";
import { Globe, Phone, ExternalLink, ShieldAlert } from "lucide-react";
import { GovReveal } from "@/components/gov/GovReveal";

const OFFICIAL_RESOURCES = [
  {
    name: "National Cyber Crime Reporting Portal",
    url: "https://cybercrime.gov.in/",
    note: "Official · Ministry of Home Affairs, Government of India",
  },
  {
    name: "CERT-In — Indian Computer Emergency Response Team",
    url: "https://www.cert-in.org.in/",
    note: "Official · Ministry of Electronics & IT, Government of India",
  },
  {
    name: "I4C — Indian Cybercrime Coordination Centre",
    url: "https://i4c.mha.gov.in/",
    note: "Official · Ministry of Home Affairs · advisories, alerts & awareness",
  },
];

/**
 * "Basic verified information" band: the 1930 national cyber-fraud helpline
 * and the two/core official resources, each labeled with its owning authority.
 * Only sources verified against the live official domains are listed.
 */
export const GovVerifiedInfo: React.FC = () => {
  return (
    <section id="resources" className="relative border-b border-slate-800/60">
      <div className="mx-auto w-full max-w-6xl px-5 py-12 sm:px-8 sm:py-16">
        <GovReveal>
          <div className="mb-8 max-w-2xl">
            <span className="gov-eyebrow">Verified Resources</span>
            <h2 className="mt-4 text-2xl font-black tracking-tight text-slate-50 sm:text-3xl">
              Official Cyber Security Resources
            </h2>
            <p className="mt-3 text-sm leading-relaxed text-slate-400 sm:text-base">
              Only sources verified as official are listed. Every entry is
              labeled with its owning authority. Links open in a new tab and do
              not imply endorsement or affiliation with Cyber-Sakhi.
            </p>
          </div>
        </GovReveal>

        <div className="grid gap-4 lg:grid-cols-5">
          {/* 1930 helpline callout */}
          <GovReveal delay={60} className="lg:col-span-2">
            <div className="flex h-full flex-col justify-between gap-5 rounded-2xl border border-teal-500/25 bg-gradient-to-br from-teal-500/10 via-slate-900/60 to-transparent p-6">
              <div>
                <div className="flex items-center gap-2">
                  <Phone className="h-4 w-4 text-teal-300" />
                  <span className="font-mono text-[10px] font-bold uppercase tracking-[0.18em] text-teal-200">
                    Cyber Fraud Helpline
                  </span>
                </div>
                <p className="mt-4 text-5xl font-black tracking-tight text-slate-50">
                  1930
                </p>
                <p className="mt-2 text-sm leading-relaxed text-slate-300">
                  National helpline of the Ministry of Home Affairs for reporting
                  cyber fraud. Call immediately if you have lost money to a scam.
                </p>
              </div>
              <div className="flex flex-col gap-2 sm:flex-row">
                <a
                  href="tel:1930"
                  className="gov-cta-primary flex-1"
                  aria-label="Call the 1930 cyber fraud helpline"
                >
                  <Phone className="h-4 w-4" />
                  Call 1930
                </a>
                <a
                  href="https://cybercrime.gov.in/"
                  target="_blank"
                  rel="noopener noreferrer"
                  className="gov-cta-secondary flex-1"
                >
                  Report Online
                  <ExternalLink className="h-4 w-4" />
                </a>
              </div>
            </div>
          </GovReveal>

          {/* Official resource links */}
          <div className="flex flex-col gap-3 lg:col-span-3">
            {OFFICIAL_RESOURCES.map((resource, i) => (
              <GovReveal key={resource.url} delay={100 + i * 70} className="flex-1">
                <a
                  href={resource.url}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="gov-resource h-full"
                >
                  <span className="flex items-start gap-3">
                    <Globe className="mt-0.5 h-4 w-4 shrink-0 text-teal-300" />
                    <span className="flex flex-col">
                      <span className="text-sm font-semibold text-slate-100">
                        {resource.name}
                      </span>
                      <span className="mt-0.5 font-mono text-[10px] uppercase tracking-[0.14em] text-slate-500">
                        {resource.note}
                      </span>
                    </span>
                  </span>
                  <ExternalLink className="gov-resource-arrow h-4 w-4 shrink-0 text-slate-500" />
                </a>
              </GovReveal>
            ))}

            {/* Concise disclaimer — full notice lives in the footer */}
            <GovReveal delay={320}>
              <div className="flex items-start gap-2.5 rounded-xl border border-amber-500/15 bg-amber-500/5 px-4 py-3">
                <ShieldAlert className="mt-0.5 h-4 w-4 shrink-0 text-amber-400/80" />
                <p className="text-xs leading-relaxed text-slate-300">
                  This is a <strong className="text-slate-200">non-official
                  Cyber-Sakhi project interface</strong>. It is not operated by,
                  affiliated with, or endorsed by any government department.
                </p>
              </div>
            </GovReveal>
          </div>
        </div>
      </div>
    </section>
  );
};