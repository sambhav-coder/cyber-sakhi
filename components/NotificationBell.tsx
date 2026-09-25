"use client";

import React, { useEffect, useRef, useState } from "react";
import Link from "next/link";
import { useSession } from "next-auth/react";
import {
  ArrowLeft,
  ArrowRight,
  Bell,
  FileText,
  Lock,
  Mail,
  MapPin,
  MessageSquare,
  ShieldCheck,
  Sparkles,
} from "lucide-react";

/* ------------------------------------------------------------------ *
 * Navbar notifications.
 *
 * Notifications are defined here as code; read state is kept per user in
 * localStorage, so every account (new or existing) sees each notification
 * as unread exactly once on a device. Adding a new entry with a new id to
 * NOTIFICATIONS shows it to everyone again.
 * ------------------------------------------------------------------ */

interface AppNotification {
  id: string;
  title: string;
  summary: string;
  date: string;
  kind: "launch";
}

const NOTIFICATIONS: AppNotification[] = [
  {
    id: "launch-2026-09-welcome",
    title: "Welcome to Cyber Sakhi",
    summary:
      "Your safety companion for online harassment, scams and real-world emergencies. See what you can do here.",
    date: "2026-09-25",
    kind: "launch",
  },
];

const FEATURES = [
  {
    href: "/sakhi",
    icon: MessageSquare,
    title: "Sakhi AI",
    body: "Talk through what happened in English, Hindi or Hinglish and get clear, calm next steps.",
  },
  {
    href: "/email-forensics",
    icon: Mail,
    title: "Email Forensics",
    body: "Paste an email or connect Gmail to catch phishing, spoofed senders and scam links.",
  },
  {
    href: "/locker",
    icon: Lock,
    title: "Evidence Locker",
    body: "Keep screenshots encrypted with a tamper-proof chain of custody for police or court.",
  },
  {
    href: "/cases",
    icon: FileText,
    title: "My Cases",
    body: "Every investigation becomes a case with a report you can share or file.",
  },
  {
    href: "/sos",
    icon: MapPin,
    title: "Live Location",
    body: "Capture your GPS position in one tap and attach it to a case when you need help.",
  },
];

const storageKey = (userId: string) => `cyber_sakhi_notifications_read_${userId}`;

function readIds(userId: string): string[] {
  try {
    const parsed = JSON.parse(localStorage.getItem(storageKey(userId)) || "[]");
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

function writeIds(userId: string, ids: string[]) {
  try {
    localStorage.setItem(storageKey(userId), JSON.stringify(ids));
  } catch {
    /* storage blocked: state still holds for this visit */
  }
}

function formatDate(iso: string) {
  return new Date(`${iso}T00:00:00`).toLocaleDateString(undefined, {
    day: "numeric",
    month: "short",
    year: "numeric",
  });
}

function LaunchDetail({ onBack, onNavigate }: { onBack: () => void; onNavigate: () => void }) {
  return (
    <div className="flex flex-col max-h-[min(560px,calc(100vh-6rem))]">
      <div className="flex items-center gap-2 px-3 py-2.5 border-b border-white/[0.06]">
        <button
          type="button"
          onClick={onBack}
          className="p-1.5 rounded-lg text-slate-400 hover:text-slate-100 hover:bg-white/[0.06] transition-colors"
          aria-label="Back to notifications"
        >
          <ArrowLeft className="w-4 h-4" />
        </button>
        <span className="text-[13px] font-semibold text-slate-200">Welcome to Cyber Sakhi</span>
      </div>

      <div className="overflow-y-auto">
        <div className="px-5 pt-5 pb-4">
          <div className="inline-flex items-center gap-1.5 rounded-full border border-red-500/25 bg-red-500/[0.08] px-2.5 py-1 text-[11px] font-medium text-red-300">
            <Sparkles className="w-3 h-3" />
            Now live
          </div>
          <h3 className="mt-3 text-[17px] font-semibold leading-snug text-slate-50">
            One place to stay safe online and offline
          </h3>
          <p className="mt-1.5 text-[13px] leading-relaxed text-slate-400">
            Cyber Sakhi helps you recognise threats, collect proof that holds up, and get
            help fast, whether it&apos;s a scam email, blackmail or an emergency on the street.
          </p>
        </div>

        <ul className="px-2 pb-2">
          {FEATURES.map(({ href, icon: Icon, title, body }) => (
            <li key={href}>
              <Link
                href={href}
                onClick={onNavigate}
                className="group flex items-start gap-3 rounded-xl px-3 py-2.5 hover:bg-white/[0.04] transition-colors"
              >
                <span className="mt-0.5 flex h-8 w-8 shrink-0 items-center justify-center rounded-lg border border-white/[0.08] bg-white/[0.03]">
                  <Icon className="w-4 h-4 text-red-400" />
                </span>
                <span className="min-w-0 flex-1">
                  <span className="flex items-center gap-1 text-[13px] font-medium text-slate-100">
                    {title}
                    <ArrowRight className="w-3.5 h-3.5 text-slate-500 opacity-0 -translate-x-1 transition-all group-hover:opacity-100 group-hover:translate-x-0" />
                  </span>
                  <span className="block mt-0.5 text-[12.5px] leading-snug text-slate-400">{body}</span>
                </span>
              </Link>
            </li>
          ))}
        </ul>

        <div className="mx-5 mb-4 flex items-start gap-2.5 rounded-xl border border-emerald-500/15 bg-emerald-500/[0.05] px-3.5 py-3">
          <ShieldCheck className="w-4 h-4 mt-0.5 shrink-0 text-emerald-400" />
          <p className="text-[12.5px] leading-snug text-slate-300">
            Your evidence stays private and encrypted. Nothing is shared unless you choose to.
          </p>
        </div>
      </div>

      <div className="p-3 border-t border-white/[0.06]">
        <Link
          href="/sakhi"
          onClick={onNavigate}
          className="flex h-9 w-full items-center justify-center gap-1.5 rounded-lg bg-red-600 text-[13px] font-semibold text-white hover:bg-red-500 transition-colors"
        >
          Start with Sakhi AI
          <ArrowRight className="w-3.5 h-3.5" />
        </Link>
      </div>
    </div>
  );
}

export function NotificationBell() {
  const { data: session, status } = useSession();
  const userId = session?.user?.id;
  const [readSet, setReadSet] = useState<Set<string> | null>(null);
  const [isOpen, setIsOpen] = useState(false);
  const [detailId, setDetailId] = useState<string | null>(null);
  const rootRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (userId) setReadSet(new Set(readIds(userId)));
  }, [userId]);

  useEffect(() => {
    if (!isOpen) return;
    const onPointer = (e: MouseEvent) => {
      if (!rootRef.current?.contains(e.target as Node)) setIsOpen(false);
    };
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") setIsOpen(false);
    };
    document.addEventListener("mousedown", onPointer);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("mousedown", onPointer);
      document.removeEventListener("keydown", onKey);
    };
  }, [isOpen]);

  if (status !== "authenticated" || !userId) return null;

  const unread = readSet ? NOTIFICATIONS.filter((n) => !readSet.has(n.id)) : [];

  const markRead = (ids: string[]) => {
    setReadSet((prev) => {
      const next = new Set(prev ?? []);
      ids.forEach((id) => next.add(id));
      writeIds(userId, Array.from(next));
      return next;
    });
  };

  const openNotification = (id: string) => {
    markRead([id]);
    setDetailId(id);
  };

  const close = () => setIsOpen(false);

  return (
    <div ref={rootRef} className="relative">
      <button
        type="button"
        onClick={() => {
          setIsOpen((v) => !v);
          setDetailId(null);
        }}
        className="relative inline-flex h-10 w-10 items-center justify-center rounded-xl border border-white/[0.08] bg-white/[0.03] text-slate-300 transition-colors hover:border-white/[0.16] hover:bg-white/[0.06] hover:text-white focus:outline-none focus-visible:ring-2 focus-visible:ring-red-500/60"
        aria-label={unread.length ? `Notifications, ${unread.length} unread` : "Notifications"}
        aria-expanded={isOpen}
        aria-haspopup="dialog"
      >
        <Bell className="w-[18px] h-[18px]" />
        {unread.length > 0 && (
          <span className="absolute -top-1 -right-1 flex h-[18px] min-w-[18px] items-center justify-center rounded-full bg-red-600 px-1 text-[10px] font-bold leading-none text-white ring-2 ring-[#07060b]">
            {unread.length}
          </span>
        )}
      </button>

      {isOpen && (
        <div
          role="dialog"
          aria-label="Notifications"
          className="notif-panel fixed left-3 right-3 top-[4.25rem] sm:absolute sm:left-auto sm:right-0 sm:top-[calc(100%+10px)] sm:w-[380px] z-50 overflow-hidden rounded-2xl border border-white/[0.08] bg-[#0c0a12] shadow-[0_24px_60px_-20px_rgba(0,0,0,0.85)]"
        >
          <style>{PANEL_CSS}</style>

          {detailId ? (
            <LaunchDetail onBack={() => setDetailId(null)} onNavigate={close} />
          ) : (
            <>
              <div className="flex items-center justify-between px-4 py-3 border-b border-white/[0.06]">
                <span className="text-sm font-semibold text-slate-100">Notifications</span>
                {unread.length > 0 && (
                  <button
                    type="button"
                    onClick={() => markRead(unread.map((n) => n.id))}
                    className="text-[12px] font-medium text-slate-400 hover:text-slate-100 transition-colors"
                  >
                    Mark all as read
                  </button>
                )}
              </div>

              <ul className="p-1.5">
                {NOTIFICATIONS.map((n) => {
                  const isUnread = !readSet?.has(n.id);
                  return (
                    <li key={n.id}>
                      <button
                        type="button"
                        onClick={() => openNotification(n.id)}
                        className="group flex w-full items-start gap-3 rounded-xl px-3 py-3 text-left hover:bg-white/[0.04] transition-colors"
                      >
                        <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg border border-red-500/20 bg-red-500/[0.08]">
                          <Sparkles className="w-4 h-4 text-red-400" />
                        </span>
                        <span className="min-w-0 flex-1">
                          <span className="flex items-center justify-between gap-2">
                            <span className={`text-[13px] ${isUnread ? "font-semibold text-slate-50" : "font-medium text-slate-300"}`}>
                              {n.title}
                            </span>
                            {isUnread && <span className="h-2 w-2 shrink-0 rounded-full bg-red-500" aria-label="Unread" />}
                          </span>
                          <span className="mt-0.5 block text-[12.5px] leading-snug text-slate-400">{n.summary}</span>
                          <span className="mt-1.5 flex items-center gap-1 text-[11px] text-slate-500">
                            Launch · {formatDate(n.date)}
                            <span className="ml-auto inline-flex items-center gap-0.5 font-medium text-red-300/90 opacity-0 transition-opacity group-hover:opacity-100">
                              Take the tour <ArrowRight className="w-3 h-3" />
                            </span>
                          </span>
                        </span>
                      </button>
                    </li>
                  );
                })}
              </ul>

              {unread.length === 0 && (
                <div className="px-4 py-2.5 border-t border-white/[0.06] text-center text-[11.5px] text-slate-500">
                  You&apos;re all caught up
                </div>
              )}
            </>
          )}
        </div>
      )}
    </div>
  );
}

const PANEL_CSS = `
@keyframes notif-panel-in {
  0% { opacity: 0; transform: translateY(-6px) scale(0.98); }
  100% { opacity: 1; transform: translateY(0) scale(1); }
}
.notif-panel { transform-origin: top right; animation: notif-panel-in 180ms cubic-bezier(0.2, 0.8, 0.2, 1) both; }
@media (prefers-reduced-motion: reduce) { .notif-panel { animation: none; } }
`;
