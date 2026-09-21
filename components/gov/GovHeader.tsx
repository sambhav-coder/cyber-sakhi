"use client";

import React, { useEffect, useState } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { ArrowLeft, Menu, X } from "lucide-react";
import { GovBrandLockup } from "@/components/gov/GovBrandLockup";
import { clsx } from "clsx";

interface GovHeaderProps {
  /** Render a transparent header (over the hero). Used on /gov. */
  overHero?: boolean;
  lockupTextClassName?: string;
}

export const GovHeader: React.FC<GovHeaderProps> = ({
  overHero = false,
  lockupTextClassName,
}) => {
  const [scrolled, setScrolled] = useState(false);
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);
  const pathname = usePathname();

  useEffect(() => {
    const onScroll = () => setScrolled(window.scrollY > 12);
    onScroll();
    window.addEventListener("scroll", onScroll, { passive: true });
    return () => window.removeEventListener("scroll", onScroll);
  }, []);

  const headerState = overHero
    ? scrolled
      ? "bg-[#070d1a]/90 border-slate-700/50 shadow-lg"
      : "bg-[#070d1a]/0 border-transparent"
    : "bg-[#070d1a]/90 border-slate-700/50 shadow-lg";

  // On the login page, the single header CTA returns to the portal overview
  const onLoginPage = pathname === "/gov/login";

  const navLinks = [
    { href: "/", label: "User Profile" },
    { href: "/gov#resources", label: "Resources" },
  ];

  return (
    <header
      className={clsx(
        "sticky top-0 z-40 w-full border-b backdrop-blur-xl transition-colors duration-300",
        "h-16",
        headerState
      )}
    >
      <div className="mx-auto flex h-full w-full max-w-6xl items-center justify-between gap-4 px-5 sm:px-8">
        <Link
          href="/gov"
          className="rounded-lg transition hover:opacity-85 focus-visible:outline-2 focus-visible:outline-sky-400"
          aria-label="Cyber-Sakhi Government Portal — Overview"
        >
          <GovBrandLockup size={36} textClassName={lockupTextClassName} />
        </Link>

        {/* Desktop Navigation */}
        <nav className="hidden sm:flex items-center gap-6">
          {navLinks.map((link) => (
            <Link
              key={link.href}
              href={link.href}
              className="text-sm font-medium text-slate-300 transition hover:text-teal-300 focus-visible:outline-2 focus-visible:outline-sky-400"
            >
              {link.label}
            </Link>
          ))}
          {onLoginPage && (
            <Link href="/gov" className="gov-btn-ghost !px-4 !py-2 !text-sm">
              <ArrowLeft className="h-4 w-4" />
              Back to Portal
            </Link>
          )}
        </nav>

        {/* Mobile Menu Button */}
        <button
          type="button"
          className="sm:hidden p-2 rounded-lg text-slate-300 hover:text-teal-300 focus-visible:outline-2 focus-visible:outline-sky-400"
          onClick={() => setMobileMenuOpen(!mobileMenuOpen)}
          aria-label={mobileMenuOpen ? "Close menu" : "Open menu"}
        >
          {mobileMenuOpen ? <X className="h-5 w-5" /> : <Menu className="h-5 w-5" />}
        </button>
      </div>

      {/* Mobile Menu */}
      {mobileMenuOpen && (
        <div className="sm:hidden border-t border-slate-700/50 bg-[#070d1a]/95 backdrop-blur-xl">
          <nav className="px-5 py-4 space-y-3">
            {navLinks.map((link) => (
              <Link
                key={link.href}
                href={link.href}
                className="block text-sm font-medium text-slate-300 transition hover:text-teal-300 focus-visible:outline-2 focus-visible:outline-sky-400"
                onClick={() => setMobileMenuOpen(false)}
              >
                {link.label}
              </Link>
            ))}
            {onLoginPage && (
              <Link
                href="/gov"
                className="flex items-center gap-2 text-sm font-medium text-slate-300 transition hover:text-teal-300 focus-visible:outline-2 focus-visible:outline-sky-400"
                onClick={() => setMobileMenuOpen(false)}
              >
                <ArrowLeft className="h-4 w-4" />
                Back to Portal
              </Link>
            )}
          </nav>
        </div>
      )}
    </header>
  );
};