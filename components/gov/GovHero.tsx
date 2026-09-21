"use client";

import React from "react";
import Link from "next/link";
import { LogIn, ArrowRight } from "lucide-react";

/**
 * Hero section for the Government Portal landing page.
 *
 * Features:
 * - Cinematic animated entrance with staggered text reveal
 * - "WELCOME TO" kicker
 * - "CYBER-SAKHI GOVERNMENT PORTAL" main heading
 * - Two-line description
 * - Officer Login CTA with micro-interactions
 */
export const GovHero: React.FC = () => {
  return (
    <section className="relative w-full min-h-[85vh] flex items-center">
      <div className="mx-auto w-full max-w-6xl px-5 py-24 sm:px-8 sm:py-32">
        <div className="relative max-w-3xl">
          {/* WELCOME TO kicker */}
          <p className="gov-welcome-kicker">WELCOME TO</p>

          {/* Main heading - CYBER-SAKHI GOVERNMENT PORTAL */}
          <h1
            className="gov-hero-heading mt-4 text-4xl font-black tracking-tight text-slate-50 sm:text-5xl lg:text-6xl lg:leading-[1.1]"
          >
            <span className="block gov-hero-line-1">CYBER-SAKHI</span>
            <span className="block mt-2 sm:mt-3 bg-gradient-to-r from-teal-300 via-sky-300 to-indigo-300 bg-clip-text text-transparent gov-hero-line-2">
              GOVERNMENT PORTAL
            </span>
          </h1>

          {/* Two-line description */}
          <p
            className="gov-hero-description mt-6 max-w-xl text-base leading-relaxed text-slate-300 sm:text-lg"
          >
            Secure cybercrime investigation workflows with controlled access,
            digital evidence custody, and accountable investigation intelligence.
          </p>

          {/* Officer Login CTA */}
          <div className="gov-hero-cta mt-9">
            <Link href="/gov/login" className="gov-cta-primary">
              <LogIn className="h-4 w-4" />
              Officer Login
              <ArrowRight className="gov-cta-arrow h-4 w-4" />
            </Link>
          </div>
        </div>
      </div>
    </section>
  );
};
