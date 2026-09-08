"use client";

import React, { useState } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { useSession, signOut } from "next-auth/react";
import {
  Menu,
  LogOut,
  ShieldAlert,
  AlertTriangle,
  User,
  ChevronDown,
} from "lucide-react";
import { AppSidebar } from "@/components/AppSidebar";
import { SOSModal } from "@/components/SOSModal";
import { clsx } from "clsx";
import { twMerge } from "tailwind-merge";

function cn(...inputs: Parameters<typeof clsx>) {
  return twMerge(clsx(inputs));
}

const PUBLIC_PATHS = new Set(["/", "/login", "/signup", "/privacy"]);

const TopBar: React.FC<{ onOpenSidebar: () => void; sidebarCollapsed: boolean }> = ({
  onOpenSidebar,
  sidebarCollapsed,
}) => {
  const { data: session, status } = useSession();
  const [isUserMenuOpen, setIsUserMenuOpen] = useState(false);
  const [isSosOpen, setIsSosOpen] = useState(false);

  const isAdmin = session?.user?.role === "ADMIN";
  const sakhiNumber = session?.user?.sakhiNumber;
  const userInitial = session?.user?.name?.charAt(0).toUpperCase() || "U";

  const handleSignOut = () => {
    setIsUserMenuOpen(false);
    // Clear all Gmail token cookies on logout (legacy from Navbar)
    try {
      document.cookie.split(";").forEach((cookie) => {
        const [name] = cookie.trim().split("=");
        if (name && name.startsWith("cyber_sakhi_gmail_token_")) {
          document.cookie = `${name}=; expires=Thu, 01 Jan 1970 00:00:00 UTC; path=/;`;
        }
      });
    } catch {
      /* silent */
    }
    signOut({ callbackUrl: "/login" });
  };

  return (
    <header
      className="sticky top-0 z-20 h-16 shrink-0 flex items-center justify-between px-4 sm:px-6 backdrop-blur-xl border-b"
      style={{
        background:
          "linear-gradient(180deg, rgba(5,5,11,0.9) 0%, rgba(5,5,11,0.75) 100%)",
        borderColor: "rgba(239, 68, 68, 0.12)",
      }}
    >
      <div className="flex items-center gap-3 min-w-0">
        {/* Mobile sidebar open */}
        <button
          type="button"
          onClick={onOpenSidebar}
          className="lg:hidden p-2 rounded-lg text-slate-300 hover:text-white hover:bg-white/10 transition"
          aria-label="Open sidebar"
        >
          <Menu className="w-5 h-5" />
        </button>

        {/* Path / breadcrumb indicator */}
        <div className="hidden sm:flex items-center gap-2 text-xs text-slate-400 min-w-0">
          <span className="font-bold tracking-[0.2em] uppercase text-[10px] text-emergency-400">
            CYBER SAKHI
          </span>
          <span className="text-slate-700">/</span>
          <span className="truncate text-slate-300/80 font-medium">
            {sakhiNumber ? (
              <span className="font-mono text-[11px] tracking-wider text-emerald-300/90">
                {sakhiNumber}
              </span>
            ) : (
              "Security Console"
            )}
          </span>
        </div>
      </div>

      <div className="flex items-center gap-2.5 sm:gap-3">
        {/* SOS button */}
        <button
          type="button"
          onClick={() => setIsSosOpen(true)}
          className={cn(
            "relative inline-flex items-center justify-center gap-1.5 rounded-xl px-3 sm:px-4 py-2 text-white text-xs font-bold transition-all",
            sidebarCollapsed ? "" : ""
          )}
          style={{
            background:
              "linear-gradient(135deg, #b91c1c 0%, #ef4444 50%, #dc2626 100%)",
            boxShadow:
              "0 12px 32px -12px rgba(220, 38, 38, 0.85), inset 0 1px 0 rgba(255,255,255,0.18)",
            clipPath:
              "polygon(0 0, 100% 0, 100% calc(100% - 6px), calc(100% - 6px) 100%, 0 100%)",
          }}
          title="1-Tap Emergency SOS"
        >
          <AlertTriangle className="w-4 h-4 animate-pulse" />
          <span className="hidden sm:inline tracking-[0.06em]">1-TAP SOS</span>
        </button>

        {/* User avatar + dropdown (only if authenticated) */}
        {status === "authenticated" && session?.user ? (
          <div className="relative">
            <button
              type="button"
              onClick={() => setIsUserMenuOpen((v) => !v)}
              className={cn(
                "flex items-center gap-2.5 rounded-xl px-2 py-1.5 border transition",
                "bg-black/50 border-white/5 hover:border-emergency-500/30 hover:bg-emergency-950/30"
              )}
              title="User Account"
            >
              <div
                className="w-8 h-8 rounded-full flex items-center justify-center text-[11px] font-black text-white shrink-0"
                style={{
                  background:
                    "linear-gradient(135deg, #7f1d1d 0%, #dc2626 55%, #ef4444 100%)",
                  boxShadow: "0 0 18px -4px rgba(239, 68, 68, 0.7)",
                }}
              >
                {userInitial}
              </div>
              <div className="hidden sm:flex flex-col text-left leading-tight">
                <span className="text-slate-100 text-[12px] font-semibold max-w-[110px] truncate">
                  {session.user.name || "User"}
                </span>
                <span
                  className={cn(
                    "text-[10px] font-bold tracking-wider",
                    isAdmin ? "text-amber-300" : "text-slate-500"
                  )}
                >
                  {session.user.role}
                </span>
              </div>
              <ChevronDown
                className={cn(
                  "w-3.5 h-3.5 text-slate-500 transition-transform hidden sm:block",
                  isUserMenuOpen && "rotate-180"
                )}
              />
            </button>

            {/* Dropdown */}
            {isUserMenuOpen && (
              <>
                <div
                  className="fixed inset-0 z-40"
                  onClick={() => setIsUserMenuOpen(false)}
                  aria-hidden
                />
                <div
                  className="absolute right-0 mt-2 w-64 rounded-2xl shadow-2xl border z-50 text-xs animate-fade-in-up"
                  style={{
                    background:
                      "linear-gradient(180deg, rgba(12, 12, 24, 0.99) 0%, rgba(6, 6, 14, 0.99) 100%)",
                    border: "1px solid rgba(239, 68, 68, 0.22)",
                    animationDuration: "0.2s",
                  }}
                >
                  <div className="p-3.5 border-b border-white/5">
                    <div className="flex items-center gap-3">
                      <div
                        className="w-10 h-10 rounded-full flex items-center justify-center text-sm font-black text-white shrink-0"
                        style={{
                          background:
                            "linear-gradient(135deg, #7f1d1d 0%, #dc2626 55%, #ef4444 100%)",
                        }}
                      >
                        {userInitial}
                      </div>
                      <div className="min-w-0 flex-1">
                        <div className="font-bold text-white truncate">
                          {session.user.name}
                        </div>
                        <div className="text-[11px] text-slate-400 truncate">
                          {session.user.email}
                        </div>
                        <div className="mt-1 flex items-center gap-2 flex-wrap">
                          <span
                            className={cn(
                              "inline-flex items-center gap-1 px-2 py-0.5 rounded-full border text-[9px] font-black tracking-[0.14em] uppercase",
                              isAdmin
                                ? "bg-amber-950/50 border-amber-500/40 text-amber-300"
                                : "bg-emerald-950/40 border-emerald-500/30 text-emerald-300"
                            )}
                          >
                            <User className="w-2.5 h-2.5" />
                            {session.user.role}
                          </span>
                          {sakhiNumber && (
                            <span className="font-mono text-[10px] tracking-wider text-emergency-300">
                              {sakhiNumber}
                            </span>
                          )}
                        </div>
                      </div>
                    </div>
                  </div>

                  <div className="p-2 space-y-0.5">
                    <Link
                      href="/dashboard"
                      onClick={() => setIsUserMenuOpen(false)}
                      className="flex items-center gap-2.5 px-3 py-2 rounded-xl text-slate-200 hover:bg-white/5 transition"
                    >
                      <User className="w-3.5 h-3.5 text-slate-400" />
                      <span className="font-semibold">Go to Dashboard</span>
                    </Link>

                    {isAdmin && (
                      <Link
                        href="/admin"
                        onClick={() => setIsUserMenuOpen(false)}
                        className="flex items-center gap-2.5 px-3 py-2 rounded-xl text-amber-300 hover:bg-amber-950/30 border border-transparent hover:border-amber-500/20 transition"
                      >
                        <ShieldAlert className="w-3.5 h-3.5 text-amber-400" />
                        <span className="font-semibold">Admin Incident Portal</span>
                      </Link>
                    )}

                    <button
                      type="button"
                      onClick={handleSignOut}
                      className="w-full flex items-center gap-2.5 px-3 py-2 rounded-xl text-red-300 hover:bg-red-950/40 border border-transparent hover:border-red-500/20 transition mt-1"
                    >
                      <LogOut className="w-3.5 h-3.5 text-red-400" />
                      <span className="font-semibold text-left flex-1">Sign Out</span>
                    </button>
                  </div>
                </div>
              </>
            )}
          </div>
        ) : status === "unauthenticated" ? (
          <Link
            href="/login"
            className="hidden sm:inline-flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-black/40 border border-white/10 hover:border-emergency-500/40 hover:text-white text-slate-200 text-xs font-semibold transition"
          >
            Sign In
          </Link>
        ) : null}
      </div>

      {/* SOS modal */}
      <SOSModal isOpen={isSosOpen} onClose={() => setIsSosOpen(false)} />
    </header>
  );
};

interface AppShellProps {
  children: React.ReactNode;
}

export const AppShell: React.FC<AppShellProps> = ({ children }) => {
  const pathname = usePathname();
  const isPublicRoute = PUBLIC_PATHS.has(pathname);

  const [isMobileOpen, setIsMobileOpen] = useState(false);
  const [collapsed, setCollapsed] = useState(false);

  if (isPublicRoute) {
    return <>{children}</>;
  }

  const sidebarWidthLg = collapsed ? "lg:pl-[88px]" : "lg:pl-[288px]";

  return (
    <div className="relative min-h-screen w-full bg-midnight-950 text-slate-100">
      {/* Ambient background overlay for authenticated pages */}
      <div
        className="fixed inset-0 pointer-events-none"
        aria-hidden
        style={{
          background:
            "radial-gradient(ellipse 55% 45% at 10% 0%, rgba(220, 38, 38, 0.16), transparent 65%), radial-gradient(ellipse 40% 40% at 95% 100%, rgba(127, 29, 29, 0.22), transparent 65%)",
        }}
      />
      {/* Subtle grain */}
      <div
        className="fixed inset-0 opacity-[0.04] mix-blend-overlay pointer-events-none"
        aria-hidden
        style={{
          backgroundImage:
            "repeating-linear-gradient(0deg, transparent 0 2px, rgba(255,255,255,0.08) 2px 3px)",
        }}
      />

      <AppSidebar
        isMobileOpen={isMobileOpen}
        onCloseMobile={() => setIsMobileOpen(false)}
        collapsed={collapsed}
        onToggleCollapse={() => setCollapsed((v) => !v)}
      />

      <div className={cn("relative z-10 min-h-screen flex flex-col", sidebarWidthLg)}>
        <TopBar
          onOpenSidebar={() => setIsMobileOpen(true)}
          sidebarCollapsed={collapsed}
        />
        <main className="flex-1 min-w-0 w-full px-4 sm:px-6 lg:px-8 py-5 sm:py-7 animate-fade-in-up">
          {children}
        </main>
      </div>
    </div>
  );
};
