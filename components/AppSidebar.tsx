"use client";

import React from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { useSession } from "next-auth/react";
import {
  LayoutDashboard,
  MessageSquare,
  Mail,
  Lock,
  ChevronLeft,
  ChevronRight,
  X,
  ShieldCheck,
  FileText,
} from "lucide-react";
import { BrandLogo } from "./BrandLogo";
import { clsx } from "clsx";
import { twMerge } from "tailwind-merge";

function cn(...inputs: Parameters<typeof clsx>) {
  return twMerge(clsx(inputs));
}
type NavLink = {
  href: string;
  label: string;
  icon: React.ComponentType<React.SVGProps<SVGSVGElement>>;
  description: string;
  primary?: boolean;
  badge?: string;
  accent?: boolean;
};

interface AppSidebarProps {
  isMobileOpen: boolean;
  onCloseMobile: () => void;
  collapsed: boolean;
  onToggleCollapse: () => void;
}

const mainNavLinks: NavLink[] = [
  {
    href: "/dashboard",
    label: "Dashboard",
    icon: LayoutDashboard,
    description: "Your safety overview",
    primary: true,
  },
  {
    href: "/companion",
    label: "Sakhi AI",
    icon: MessageSquare,
    description: "AI safety companion",
    badge: "AI",
  },
  {
    href: "/email-forensics",
    label: "Email Forensics",
    icon: Mail,
    description: "Deep email investigation",
  },
  {
    href: "/cases",
    label: "My Cases",
    icon: FileText,
    description: "Case dashboard & reports",
  },
  {
    href: "/locker",
    label: "Evidence Locker",
    icon: Lock,
    description: "Encrypted evidence + chain of custody",
  },
];

export const AppSidebar: React.FC<AppSidebarProps> = ({
  isMobileOpen,
  onCloseMobile,
  collapsed,
  onToggleCollapse,
}) => {
  const pathname = usePathname();
  const { data: session } = useSession();
  const sakhiNumber = session?.user?.sakhiNumber;

  // Mask Sakhi Number: SAKHI-2026-ABXXX
  const maskedSakhiNumber = sakhiNumber
    ? sakhiNumber.replace(/([A-Z0-9]{2})[A-Z0-9]{3}$/, "$1XXX")
    : null;

  const visibleLinks: NavLink[] = mainNavLinks;

  const sidebarInner = (
    <div className="h-full flex flex-col w-full">
      {/* Brand Header */}
      <div className="h-16 shrink-0 flex items-center justify-between px-4 border-b border-white/5">
        {!collapsed ? (
          <Link href="/dashboard" onClick={onCloseMobile}>
            <BrandLogo size={34} showText animated />
          </Link>
        ) : (
          <Link
            href="/dashboard"
            onClick={onCloseMobile}
            className="mx-auto inline-flex"
          >
            <BrandLogo size={34} showText={false} variant="svg" animated />
          </Link>
        )}
        {/* Mobile close */}
        <button
          type="button"
          onClick={onCloseMobile}
          className="lg:hidden p-2 rounded-lg text-slate-400 hover:text-white hover:bg-white/10 transition"
          aria-label="Close sidebar"
        >
          <X className="w-5 h-5" />
        </button>
        {/* Desktop collapse */}
        <button
          type="button"
          onClick={onToggleCollapse}
          className="hidden lg:flex items-center justify-center w-8 h-8 rounded-lg text-slate-500 hover:text-white hover:bg-white/10 transition"
          aria-label={collapsed ? "Expand sidebar" : "Collapse sidebar"}
          title={collapsed ? "Expand" : "Collapse"}
        >
          {collapsed ? (
            <ChevronRight className="w-4 h-4" />
          ) : (
            <ChevronLeft className="w-4 h-4" />
          )}
        </button>
      </div>

      {/* Sakhi Number strip (authenticated) */}
      {!collapsed && maskedSakhiNumber && (
        <div className="shrink-0 px-4 py-3 border-b border-white/5">
          <div className="p-2.5 rounded-xl border border-emergency-500/20 bg-emergency-950/40">
            <div className="flex items-center justify-between gap-2">
              <div className="flex items-center gap-1.5">
                <ShieldCheck className="w-3.5 h-3.5 text-emerald-400 shrink-0" />
                <span className="text-[9px] tracking-[0.18em] uppercase text-slate-400 font-bold">
                  Your Sakhi ID
                </span>
              </div>
            </div>
            <div className="mt-1 font-mono font-black tracking-[0.08em] text-emergency-300 text-[12px] truncate">
              {maskedSakhiNumber}
            </div>
          </div>
        </div>
      )}

      {/* Nav links scrollable */}
      <nav className="flex-1 overflow-y-auto px-3 py-4 space-y-1.5 custom-scrollbar-thin">
        {/* Section header */}
        {!collapsed && (
          <div className="px-2 pb-2 pt-1">
            <span className="text-[10px] tracking-[0.22em] uppercase font-bold text-slate-500">
              Safety Platform
            </span>
          </div>
        )}

        {visibleLinks.map((item) => {
          const Icon = item.icon;
          const isActive =
            pathname === item.href ||
            (item.href !== "/dashboard" && pathname.startsWith(item.href));
          return (
            <Link
              key={item.href}
              href={item.href}
              onClick={onCloseMobile}
              className={cn(
                "group relative flex items-center gap-3 rounded-xl px-3 py-2.5 transition-all duration-200",
                isActive
                  ? "sidebar-nav-link-active"
                  : "sidebar-nav-link"
              )}
              title={collapsed ? item.label : undefined}
            >
              {/* Icon container */}
              <div
                className={cn(
                  "relative shrink-0 w-9 h-9 rounded-lg flex items-center justify-center transition-all",
                  isActive
                    ? "bg-gradient-to-br from-emergency-500/25 to-emergency-700/25 border border-emergency-500/50"
                    : "bg-black/30 border border-white/5 group-hover:border-white/15"
                )}
              >
                <Icon
                  className={cn(
                    "w-4.5 h-4.5",
                    isActive
                      ? "text-emergency-300 drop-shadow-[0_0_8px_rgba(239,68,68,0.7)]"
                      : "text-slate-400 group-hover:text-slate-200"
                  )}
                />
                {item.accent && !isActive && (
                  <span className="absolute -top-1 -right-1 w-2 h-2 rounded-full bg-emergency-500 animate-pulse" />
                )}
              </div>

              {/* Label + description */}
              {!collapsed && (
                <div className="min-w-0 flex-1 flex flex-col items-start">
                  <div className="flex items-center gap-2 w-full">
                    <span
                      className={cn(
                        "text-sm font-semibold tracking-wide truncate",
                        isActive ? "text-white" : "text-slate-200/90"
                      )}
                    >
                      {item.label}
                    </span>
                    {item.badge && (
                      <span
                        className="shrink-0 px-1.5 py-0.5 rounded-md text-[9px] font-black tracking-[0.14em] uppercase"
                        style={{
                          background:
                            "linear-gradient(135deg, rgba(220, 38, 38, 0.4), rgba(127, 29, 29, 0.4))",
                          border: "1px solid rgba(239, 68, 68, 0.35)",
                          color: "#fecaca",
                        }}
                      >
                        {item.badge}
                      </span>
                    )}
                  </div>
                  <span className="text-[10.5px] text-slate-500 truncate leading-tight mt-0.5">
                    {item.description}
                  </span>
                </div>
              )}
            </Link>
          );
        })}
      </nav>

      {/* Footer strip: back to public */}
      <div className="shrink-0 border-t border-white/5 p-3">
        <Link
          href="/"
          onClick={onCloseMobile}
          className={cn(
            "flex items-center gap-3 rounded-xl px-3 py-2 text-xs text-slate-400 hover:text-slate-200 hover:bg-white/5 transition",
            collapsed && "justify-center px-0 py-2.5"
          )}
          title={collapsed ? "Back to Home" : undefined}
        >
          <ShieldCheck className="w-4 h-4 text-emerald-400/80" />
          {!collapsed && (
            <span className="font-semibold tracking-wide">← Back to Public Site</span>
          )}
        </Link>
      </div>
    </div>
  );

  return (
    <>
      {/* Desktop sidebar (fixed) */}
      <aside
        className={cn(
          "hidden lg:flex fixed left-0 top-0 z-30 h-screen flex-col shrink-0 transition-all duration-300 ease-out border-r",
          collapsed ? "w-[88px]" : "w-[288px]"
        )}
        style={{
          background:
            "linear-gradient(180deg, rgba(6, 6, 14, 0.98) 0%, rgba(8, 8, 20, 0.98) 100%)",
          borderColor: "rgba(239, 68, 68, 0.14)",
          boxShadow: "14px 0 40px -30px rgba(0,0,0,0.9)",
          backdropFilter: "blur(16px)",
        }}
      >
        {sidebarInner}
      </aside>

      {/* Mobile drawer */}
      {isMobileOpen && (
        <div className="fixed inset-0 z-50 lg:hidden">
          <div
            className="absolute inset-0 bg-black/70 backdrop-blur-sm animate-fade-in-up"
            style={{ animationDuration: "0.2s", opacity: 1 }}
            onClick={onCloseMobile}
            aria-hidden
          />
          <aside
            className="absolute left-0 top-0 h-full w-[288px] max-w-[85%] flex-col flex animate-slide-in-left"
            style={{
              background:
                "linear-gradient(180deg, rgba(6, 6, 14, 0.98) 0%, rgba(8, 8, 20, 0.98) 100%)",
              borderRight: "1px solid rgba(239, 68, 68, 0.16)",
              boxShadow: "14px 0 55px -20px rgba(0,0,0,0.9)",
              animation: "slideInLeft 0.25s ease-out both",
            }}
          >
            {sidebarInner}
          </aside>
        </div>
      )}

      <style jsx global>{`
        @keyframes slideInLeft {
          0% { transform: translateX(-100%); opacity: 0; }
          100% { transform: translateX(0); opacity: 1; }
        }
        .animate-slide-in-left { animation: slideInLeft 0.25s ease-out both; }
        .custom-scrollbar-thin::-webkit-scrollbar { width: 6px; }
        .custom-scrollbar-thin::-webkit-scrollbar-track { background: transparent; }
        .custom-scrollbar-thin::-webkit-scrollbar-thumb {
          background: rgba(239, 68, 68, 0.25);
          border-radius: 999px;
        }
        .custom-scrollbar-thin::-webkit-scrollbar-thumb:hover {
          background: rgba(239, 68, 68, 0.45);
        }
      `}</style>
    </>
  );
};
