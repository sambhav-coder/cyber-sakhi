"use client";

import React, { useState, useEffect } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import {
  LayoutDashboard,
  FolderSearch,
  ListChecks,
  Radar,
  MapPin,
  Fingerprint,
  FileBarChart2,
  ScrollText,
  Settings2,
  Activity,
  KeyRound,
  Menu,
  X,
  Shield,
  LogOut,
  UserRound,
  MapPinned,
} from "lucide-react";
import { CyberSakhiLogo } from "@/components/CyberSakhiLogo";
import { clsx } from "clsx";
import { roleHasDefaultPermission } from "@/lib/gov/govPermissions";
import type { GovPermission, GovRole } from "@/lib/gov/govTypes";

export interface GovDashboardShellProps {
  context: {
    officer: {
      id: string;
      officer_code: string;
      full_name: string;
      official_email: string;
      role: string;
      scope: string;
      state_code: string | null;
      district_code: string | null;
      department: string | null;
      status: string;
    };
    mfaFresh: boolean;
  };
  /** Page-specific content rendered in place of the default overview cards. */
  children?: React.ReactNode;
  /** Active nav label for pages that render custom content. */
  activeLabel?: string;
}

interface NavItem {
  href: string;
  icon: React.ComponentType<{ className?: string }>;
  label: string;
  permission: GovPermission | null;
}

interface NavSection {
  label: string;
  items: NavItem[];
}

const NAV_SECTIONS: NavSection[] = [
  {
    label: "Operations",
    items: [
      { href: "/gov/dashboard", icon: LayoutDashboard, label: "Overview", permission: null },
      { href: "/gov/cases", icon: FolderSearch, label: "Case Explorer", permission: "case.view_meta" },
      { href: "/gov/queue", icon: ListChecks, label: "Investigation Queue", permission: "case.view_meta" },
    ],
  },
  {
    label: "Intelligence",
    items: [
      { href: "/gov/indicators", icon: Radar, label: "Indicator Intelligence", permission: "indicator.view" },
      { href: "/gov/geography", icon: MapPin, label: "Map", permission: "geo.view" },
    ],
  },
  {
    label: "Accountability",
    items: [
      { href: "/gov/evidence", icon: Fingerprint, label: "Evidence & Chain of Custody", permission: "evidence.view" },
      { href: "/gov/trends", icon: Activity, label: "Trends", permission: "analytics.view" },
      { href: "/gov/reports", icon: FileBarChart2, label: "Reports", permission: "report.generate" },
      { href: "/gov/audit", icon: ScrollText, label: "Audit Logs", permission: "audit.view" },
      { href: "/gov/mfa", icon: KeyRound, label: "Authenticator (MFA)", permission: null },
      { href: "#", icon: Settings2, label: "Administration", permission: "officer.view" },
    ],
  },
];

const SCOPE_LABELS: Record<string, string> = {
  ALL_INDIA: "National",
  STATE: "State",
  DISTRICT: "District",
  ASSIGNED_CASES: "Assigned cases",
};

export const GovDashboardShell: React.FC<GovDashboardShellProps> = ({ context, children, activeLabel }) => {
  const router = useRouter();
  const [sidebarOpen, setSidebarOpen] = useState(true); // Start open on desktop
  const [activeItem, setActiveItem] = useState(activeLabel ?? "Overview");
  const { officer, mfaFresh } = context;

  // Update active item based on current path
  useEffect(() => {
    const path = window.location.pathname;
    const navItem = NAV_SECTIONS.flatMap(section => section.items).find(item => item.href === path);
    if (navItem) {
      setActiveItem(navItem.label);
    }
  }, []);

  const toggleSidebar = () => {
    setSidebarOpen(!sidebarOpen);
  };

  const scopeLabel = SCOPE_LABELS[officer.scope] ?? officer.scope;
  const scopeDetail =
    officer.scope !== "ALL_INDIA" && officer.scope !== "ASSIGNED_CASES"
      ? `${officer.state_code ?? "?"}${officer.district_code ? ` / ${officer.district_code}` : ""}`
      : null;

  const visibleSections = NAV_SECTIONS.map((section) => ({
    ...section,
    items: section.items.filter(
      (item) =>
        item.permission === null ||
        roleHasDefaultPermission(officer.role as GovRole, item.permission),
    ),
  })).filter((section) => section.items.length > 0);

  const handleLogout = async () => {
    try {
      await fetch("/gov/api/logout", { method: "POST" });
    } catch {
      // Cookie is cleared server-side on success; client navigates regardless.
    }
    router.replace("/gov/login");
  };

  const renderNavItem = (item: NavItem, onNavigate: () => void) => {
    const IconComponent = item.icon;
    const isActive = activeItem === item.label;
    return (
      <Link
        key={item.label}
        href={item.href}
        onClick={() => {
          setActiveItem(item.label);
          onNavigate();
        }}
        aria-current={isActive ? "page" : undefined}
        className={clsx(
          "flex w-full items-center justify-between gap-2 rounded-lg px-3 py-2 text-left text-sm font-semibold transition",
          isActive
            ? "bg-teal-400/10 text-teal-200"
            : "text-slate-400 hover:bg-slate-800/50 hover:text-slate-200"
        )}
      >
        <span className="flex items-center gap-2.5">
          <IconComponent className="h-4 w-4 shrink-0" />
          {item.label}
        </span>
      </Link>
    );
  };

  return (
    <div className="flex min-h-screen">
      {/* Mobile backdrop */}
      {sidebarOpen && (
        <div
          className="fixed inset-0 z-30 bg-black/60 backdrop-blur-sm lg:hidden"
          onClick={() => setSidebarOpen(false)}
          aria-hidden
        />
      )}

      {/* Sidebar */}
      <aside
        className={clsx(
          "fixed inset-y-0 left-0 z-40 w-72 transform border-r border-slate-800/70 bg-[#060b16]/95 backdrop-blur transition-all duration-200 lg:static",
          sidebarOpen ? "translate-x-0" : "-translate-x-full lg:translate-x-0 lg:w-0 lg:overflow-hidden lg:border-0"
        )}
      >
        <div className="flex h-full flex-col">
          <div className="flex items-center justify-between border-b border-slate-800/70 px-5 py-4">
            <div className="flex items-center gap-2.5">
              <CyberSakhiLogo size={30} />
              <div className="flex flex-col leading-tight">
                <span className="text-sm font-extrabold text-slate-100">Cyber-Sakhi</span>
                <span className="font-mono text-[9px] font-bold uppercase tracking-[0.2em] text-teal-300">
                  Govt. Console
                </span>
              </div>
            </div>
            <div className="flex items-center gap-2">
              <button
                type="button"
                onClick={toggleSidebar}
                className="hidden rounded-lg p-1.5 text-slate-400 hover:bg-slate-800 hover:text-white lg:block"
                aria-label={sidebarOpen ? "Collapse sidebar" : "Expand sidebar"}
              >
                {sidebarOpen ? <X className="h-5 w-5" /> : <Menu className="h-5 w-5" />}
              </button>
              <button
                type="button"
                onClick={() => setSidebarOpen(false)}
                className="rounded-lg p-1.5 text-slate-400 hover:bg-slate-800 hover:text-white lg:hidden"
                aria-label="Close sidebar"
              >
                <X className="h-5 w-5" />
              </button>
            </div>
          </div>

          <nav className="flex-1 space-y-6 overflow-y-auto px-3 py-5" aria-label="Government console sections">
            {visibleSections.map((section) => (
              <div key={section.label}>
                <div className="px-3 pb-2 font-mono text-[10px] font-bold uppercase tracking-[0.18em] text-slate-600">
                  {section.label}
                </div>
                <div className="space-y-1">
                  {section.items.map((item) => renderNavItem(item, () => setSidebarOpen(false)))}
                </div>
              </div>
            ))}
          </nav>

          <div className="border-t border-slate-800/70 p-4">
            <div className="flex items-center gap-3 rounded-xl border border-slate-700/50 bg-slate-900/40 px-3 py-3">
              <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full border border-teal-400/30 bg-teal-400/10 text-teal-300">
                <UserRound className="h-4 w-4" />
              </div>
              <div className="min-w-0 leading-tight">
                <p className="truncate text-xs font-semibold text-slate-200">{officer.full_name}</p>
                <p className="truncate font-mono text-[10px] text-slate-500">
                  {officer.officer_code} · {officer.role}
                </p>
              </div>
            </div>
            <button
              type="button"
              onClick={handleLogout}
              className="mt-3 flex w-full items-center justify-center gap-2 rounded-lg border border-slate-700/60 py-2 text-xs font-bold text-slate-300 transition hover:border-red-400/40 hover:text-red-300"
            >
              <LogOut className="h-3.5 w-3.5" />
              Sign Out
            </button>
          </div>
        </div>
      </aside>

      {/* Main */}
      <div className="flex min-w-0 flex-1 flex-col">
        <header className="sticky top-0 z-20 flex h-16 items-center justify-between gap-4 border-b border-slate-800/70 bg-[#070d1a]/85 px-5 backdrop-blur-xl">
          <div className="flex items-center gap-3">
            <button
              type="button"
              onClick={() => setSidebarOpen(true)}
              className="rounded-lg border border-slate-700/60 p-2 text-slate-200 lg:hidden"
              aria-label="Open sidebar"
            >
              <Menu className="h-5 w-5" />
            </button>
            <div className="leading-tight">
              <h1 className="text-base font-extrabold tracking-tight text-slate-100">Government Console</h1>
              <p className="font-mono text-[10px] uppercase tracking-[0.16em] text-slate-500">
                {officer.role.replace(/_/g, " ").toLowerCase()}
              </p>
            </div>
          </div>

          <div className="flex items-center gap-3">
            <span className="inline-flex items-center gap-1.5 rounded-full border border-teal-400/25 bg-teal-400/10 px-3 py-1 font-mono text-[10px] font-bold uppercase tracking-[0.14em] text-teal-300">
              <Shield className="h-3.5 w-3.5" />
              Protected session
            </span>
            <Link
              href="/gov"
              className="rounded-lg border border-slate-700/60 px-3 py-1.5 text-xs font-semibold text-slate-300 transition hover:border-teal-400/40 hover:text-teal-300"
            >
              Portal Home
            </Link>
          </div>
        </header>

        <main className="flex-1 px-5 py-6 sm:px-8 relative">
          {/* Bottom Open Sidebar Button */}
          {!sidebarOpen && (
            <button
              type="button"
              onClick={toggleSidebar}
              className="fixed bottom-6 left-6 z-50 flex items-center gap-2 rounded-lg border border-slate-700/60 bg-slate-900/90 px-4 py-3 text-sm font-semibold text-slate-200 shadow-lg backdrop-blur transition hover:border-teal-400/40 hover:text-teal-300 focus:outline-none focus:ring-2 focus:ring-teal-500 focus:ring-offset-2 focus:ring-offset-slate-900 lg:bottom-8 lg:left-8"
              aria-label="Open sidebar"
            >
              <Menu className="h-5 w-5" />
              Open Sidebar
            </button>
          )}

          <div className="mx-auto w-full max-w-5xl space-y-6">
            {/* Session summary - always visible */}
            <section aria-label="Session and jurisdiction" className="gov-panel flex flex-col gap-4 p-5 sm:flex-row sm:items-center sm:justify-between">
              <div className="flex items-center gap-4">
                <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-xl border border-teal-400/30 bg-teal-400/10 text-teal-300">
                  <MapPinned className="h-6 w-6" />
                </div>
                <div>
                  <h2 className="text-sm font-bold text-slate-100">{officer.full_name} · {scopeLabel}</h2>
                  <p className="mt-0.5 text-xs leading-relaxed text-slate-400">
                    {officer.department ?? "Government Officer"} — {officer.official_email}
                    {scopeDetail ? ` · jurisdiction ${scopeDetail}` : ""}
                  </p>
                </div>
              </div>
              <span className="gov-tag w-fit">{mfaFresh ? "MFA fresh" : "MFA not verified"}</span>
            </section>

            {children ?? (
              <>
                {/* What is live now */}
                <section aria-label="Console status" className="grid gap-4 md:grid-cols-2">
                  {[
                    {
                      title: "Authentication & Auditing",
                      body: "Session validation, role-based authorization, and a write-audit trail are enforced server-side on this console. Every protected request is session-gated and denials are recorded.",
                    },
                    {
                      title: "Data modules",
                      body: "Case explorer, evidence, indicators, geography, reports, and audit review arrive in the data phases. Navigation above shows only sections your role may open.",
                    },
                  ].map((card) => (
                    <article
                      key={card.title}
                      className="flex flex-col gap-3 rounded-2xl border border-dashed border-slate-700/60 bg-slate-900/30 p-5"
                    >
                      <div className="flex items-center justify-between">
                        <h3 className="text-sm font-bold text-slate-100">{card.title}</h3>
                        <Shield className="h-4 w-4 text-teal-400/70" />
                      </div>
                      <p className="text-sm leading-relaxed text-slate-500">{card.body}</p>
                    </article>
                  ))}
                </section>

                <p className="pt-2 pb-4 text-center font-mono text-[11px] text-slate-600">
                  Cyber-Sakhi Government Console — access is role-scoped and audited.
                </p>
              </>
            )}
          </div>
        </main>
      </div>
    </div>
  );
};
