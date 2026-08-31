"use client";

import React, { useState } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { useSession, signOut } from "next-auth/react";
import {
  ShieldAlert,
  Search,
  Lock,
  MessageSquare,
  Users,
  LayoutDashboard,
  Shield,
  Code,
  Menu,
  X,
  AlertTriangle,
  Radio,
  LogIn,
  LogOut,
  User,
} from "lucide-react";
import { CyberSakhiLogo } from "./CyberSakhiLogo";
import { SOSModal } from "./SOSModal";

export const Navbar: React.FC = () => {
  const pathname = usePathname();
  const { data: session, status } = useSession();
  const [isSosOpen, setIsSosOpen] = useState(false);
  const [isMobileMenuOpen, setIsMobileMenuOpen] = useState(false);
  const [isUserMenuOpen, setIsUserMenuOpen] = useState(false);

  const isAdmin = session?.user?.role === "ADMIN";

  const allNavLinks = [
    { href: "/", label: "Home", icon: Shield },
    { href: "/detector", label: "Check Message", icon: Search },
    { href: "/sos", label: "VoiceShield SOS", icon: Radio },
    { href: "/locker", label: "Evidence Locker", icon: Lock },
    { href: "/companion", label: "Sakhi AI", icon: MessageSquare },
    { href: "/contacts", label: "Contacts", icon: Users },
    { href: "/dashboard", label: "Dashboard", icon: LayoutDashboard },
    { href: "/admin", label: "Admin Portal", icon: ShieldAlert, adminOnly: true },
    { href: "/developer", label: "SDK / API", icon: Code },
  ];

  // RBAC Filter: Only render Admin Portal for authenticated ADMIN users
  const visibleNavLinks = allNavLinks.filter((link) => {
    if (link.adminOnly) {
      return isAdmin;
    }
    return true;
  });

  return (
    <>
      <header className="sticky top-0 z-40 border-b border-purple-900/30 bg-[#0a0a16]/80 backdrop-blur-xl">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="flex items-center justify-between h-16">
            {/* Logo */}
            <Link href="/" className="flex items-center gap-2.5 group">
              <div className="w-10 h-10 rounded-xl bg-gradient-to-tr from-purple-700 via-purple-600 to-indigo-500 p-0.5 shadow-lg shadow-purple-900/30 group-hover:scale-105 transition">
                <div className="w-full h-full bg-[#0d0d1e] rounded-[10px] flex items-center justify-center">
                  <CyberSakhiLogo className="w-5 h-5 group-hover:scale-110 transition" />
                </div>
              </div>
              <div className="flex flex-col">
                <span className="text-lg font-bold tracking-tight text-white flex items-center gap-1.5">
                  Cyber Sakhi
                  <span className="text-[10px] px-1.5 py-0.2 rounded bg-purple-900/60 text-purple-300 font-semibold border border-purple-700/50">
                    MVP
                  </span>
                </span>
                <span className="text-[10px] text-purple-300/80 -mt-1 font-medium">
                  AI Safety Companion
                </span>
              </div>
            </Link>

            {/* Desktop Navigation */}
            <nav className="hidden lg:flex items-center gap-1">
              {visibleNavLinks.map((item) => {
                const Icon = item.icon;
                const isActive = pathname === item.href;
                return (
                  <Link
                    key={item.href}
                    href={item.href}
                    className={`px-3 py-1.5 rounded-lg text-xs font-medium transition flex items-center gap-1.5 ${
                      isActive
                        ? "bg-purple-950/80 text-purple-200 border border-purple-600/40 shadow-sm shadow-purple-900/40"
                        : "text-slate-300 hover:text-white hover:bg-slate-800/50"
                    }`}
                  >
                    <Icon className={`w-3.5 h-3.5 ${isActive ? "text-purple-400" : "text-slate-400"}`} />
                    {item.label}
                  </Link>
                );
              })}
            </nav>

            {/* Right Action Cluster: Auth State & 1-Tap SOS */}
            <div className="flex items-center gap-2.5">
              {/* Authenticated User / Login Link */}
              {status === "authenticated" && session?.user ? (
                <div className="relative">
                  <button
                    onClick={() => setIsUserMenuOpen(!isUserMenuOpen)}
                    className="flex items-center gap-2 px-2.5 py-1.5 rounded-xl bg-slate-900/80 hover:bg-slate-800 border border-purple-900/40 transition text-xs"
                    title="User Account & Session"
                  >
                    <div className="w-6 h-6 rounded-full bg-gradient-to-tr from-purple-600 to-indigo-600 flex items-center justify-center text-white text-[11px] font-bold">
                      {session.user.name?.charAt(0).toUpperCase() || "U"}
                    </div>
                    <div className="hidden sm:flex flex-col text-left">
                      <span className="text-slate-200 font-semibold max-w-[100px] truncate leading-tight">
                        {session.user.name || "User"}
                      </span>
                      <span
                        className={`text-[9px] font-mono leading-tight ${
                          isAdmin ? "text-purple-300 font-bold" : "text-slate-400"
                        }`}
                      >
                        {session.user.role}
                      </span>
                    </div>
                  </button>

                  {/* Dropdown Menu */}
                  {isUserMenuOpen && (
                    <div className="absolute right-0 mt-2 w-56 rounded-2xl bg-[#121222] border border-purple-900/50 shadow-2xl p-2 z-50 text-xs space-y-1 animate-in zoom-in-95">
                      <div className="p-2 border-b border-slate-800">
                        <div className="font-bold text-white truncate">{session.user.name}</div>
                        <div className="text-[11px] text-slate-400 truncate">{session.user.email}</div>
                        <div className="mt-1 inline-flex items-center gap-1 text-[10px] px-2 py-0.5 rounded-full bg-purple-950 text-purple-300 border border-purple-700/50 font-semibold">
                          Role: {session.user.role}
                        </div>
                      </div>

                      {isAdmin && (
                        <Link
                          href="/admin"
                          onClick={() => setIsUserMenuOpen(false)}
                          className="flex items-center gap-2 px-3 py-2 rounded-xl text-purple-300 hover:bg-purple-950/60 font-medium"
                        >
                          <ShieldAlert className="w-3.5 h-3.5" />
                          <span>Admin Incident Portal</span>
                        </Link>
                      )}

                      <button
                        onClick={() => {
                          setIsUserMenuOpen(false);
                          signOut({ callbackUrl: "/login" });
                        }}
                        className="w-full flex items-center gap-2 px-3 py-2 rounded-xl text-red-400 hover:bg-red-950/50 text-left font-medium transition"
                      >
                        <LogOut className="w-3.5 h-3.5" />
                        <span>Sign Out</span>
                      </button>
                    </div>
                  )}
                </div>
              ) : status === "unauthenticated" ? (
                <Link
                  href="/login"
                  className="hidden sm:inline-flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-slate-900/90 hover:bg-purple-950/80 border border-purple-800/40 text-purple-200 text-xs font-semibold transition"
                >
                  <LogIn className="w-3.5 h-3.5 text-purple-400" />
                  <span>Sign In</span>
                </Link>
              ) : null}

              {/* 1-Tap SOS Button */}
              <button
                onClick={() => setIsSosOpen(true)}
                className="relative inline-flex items-center justify-center px-3.5 py-1.5 sm:px-4 sm:py-2 text-xs font-bold text-white transition-all bg-gradient-to-r from-red-600 via-rose-600 to-red-700 rounded-xl shadow-lg shadow-red-900/40 hover:from-red-500 hover:to-rose-600 focus:outline-none focus:ring-2 focus:ring-red-500 focus:ring-offset-2 focus:ring-offset-slate-900 glow-red animate-pulse"
              >
                <AlertTriangle className="w-3.5 h-3.5 sm:w-4 sm:h-4 mr-1 sm:mr-1.5 text-white animate-bounce-subtle" />
                <span>🚨 1-TAP SOS</span>
              </button>

              {/* Mobile Menu Toggle */}
              <button
                onClick={() => setIsMobileMenuOpen(!isMobileMenuOpen)}
                className="lg:hidden p-2 text-slate-400 hover:text-white rounded-lg bg-slate-800/60"
                aria-label="Toggle Navigation Menu"
              >
                {isMobileMenuOpen ? <X className="w-5 h-5" /> : <Menu className="w-5 h-5 text-purple-300" />}
              </button>
            </div>
          </div>
        </div>

        {/* Mobile Dropdown */}
        {isMobileMenuOpen && (
          <div className="lg:hidden border-t border-slate-800 bg-[#0d0d1e]/95 px-4 py-3 space-y-1">
            {visibleNavLinks.map((item) => {
              const Icon = item.icon;
              const isActive = pathname === item.href;
              return (
                <Link
                  key={item.href}
                  href={item.href}
                  onClick={() => setIsMobileMenuOpen(false)}
                  className={`flex items-center gap-2.5 px-3 py-2 rounded-lg text-sm font-medium ${
                    isActive
                      ? "bg-purple-900/40 text-purple-200 border border-purple-500/30"
                      : "text-slate-300 hover:bg-slate-800"
                  }`}
                >
                  <Icon className="w-4 h-4 text-purple-400" />
                  {item.label}
                </Link>
              );
            })}

            {/* Mobile Auth Button */}
            <div className="pt-2 border-t border-slate-800/80">
              {status === "authenticated" && session?.user ? (
                <div className="flex items-center justify-between p-2 rounded-lg bg-slate-900 text-xs">
                  <div>
                    <div className="font-semibold text-white">{session.user.name}</div>
                    <div className="text-[10px] text-purple-300">Role: {session.user.role}</div>
                  </div>
                  <button
                    onClick={() => signOut({ callbackUrl: "/login" })}
                    className="text-red-400 hover:text-red-300 font-semibold text-xs"
                  >
                    Sign Out
                  </button>
                </div>
              ) : (
                <Link
                  href="/login"
                  onClick={() => setIsMobileMenuOpen(false)}
                  className="flex items-center justify-center gap-2 w-full py-2 rounded-lg bg-purple-600 hover:bg-purple-500 text-white text-xs font-bold"
                >
                  <LogIn className="w-4 h-4" />
                  <span>Sign In / Register</span>
                </Link>
              )}
            </div>
          </div>
        )}
      </header>

      {/* Global SOS Modal */}
      <SOSModal isOpen={isSosOpen} onClose={() => setIsSosOpen(false)} />
    </>
  );
};