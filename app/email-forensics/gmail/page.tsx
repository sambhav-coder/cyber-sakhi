"use client";

import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import { useSession } from "next-auth/react";
import { EyebrowBadge } from "@/components/ui/EyebrowBadge";
import {
  AlertCircle,
  ArrowLeft,
  CheckCircle2,
  ChevronDown,
  Circle,
  Clock,
  FileText,
  Inbox as InboxIcon,
  Loader2,
  Mail,
  MoreHorizontal,
  Paperclip,
  RefreshCw,
  Search,
  Send,
  ShieldAlert,
  ShieldCheck,
  Star,
  Tag,
  Trash2,
} from "lucide-react";

interface EnrichedGmailMessage {
  id: string;
  threadId?: string;
  labelIds?: string[];
  snippet?: string;
  internalDate?: number | null;
  sizeEstimate?: number;
  historyId?: unknown;
  from?: string | null;
  to?: string | null;
  subject?: string | null;
  date?: string | null;
  isDemo?: boolean;
  forensicType?: string;
  description?: string;
}

/* ------------------------------------------------------------------ *
 * Quick-scan severity. Every message in the list is triaged by
 * /api/gmail/scan (offline analysis, no case created) and colour coded.
 * Colours always travel with a text label, never alone.
 * ------------------------------------------------------------------ */
type Severity = "SAFE" | "LOW" | "MEDIUM" | "HIGH" | "CRITICAL";

interface QuickScan {
  level: Severity;
  score: number;
  reason?: string | null;
}

const SEVERITY_ORDER: Severity[] = ["CRITICAL", "HIGH", "MEDIUM", "LOW", "SAFE"];

const SEVERITY_META: Record<
  Severity,
  { label: string; stripe: string; tint?: string; chip: string; dot: string }
> = {
  CRITICAL: {
    label: "Critical",
    stripe: "rgb(239 68 68 / 0.95)",
    tint: "linear-gradient(90deg, rgba(239,68,68,0.14), rgba(239,68,68,0) 45%)",
    chip: "bg-red-950/80 border-red-500/60 text-red-200",
    dot: "bg-red-500",
  },
  HIGH: {
    label: "High",
    stripe: "rgb(249 115 22 / 0.9)",
    tint: "linear-gradient(90deg, rgba(249,115,22,0.10), rgba(249,115,22,0) 45%)",
    chip: "bg-orange-950/70 border-orange-500/50 text-orange-200",
    dot: "bg-orange-500",
  },
  MEDIUM: {
    label: "Medium",
    stripe: "rgb(251 191 36 / 0.85)",
    chip: "bg-amber-950/60 border-amber-500/40 text-amber-200",
    dot: "bg-amber-400",
  },
  LOW: {
    label: "Low",
    stripe: "rgb(34 211 238 / 0.6)",
    chip: "bg-cyan-950/50 border-cyan-600/40 text-cyan-200",
    dot: "bg-cyan-400",
  },
  SAFE: {
    label: "Safe",
    stripe: "rgb(52 211 153 / 0.55)",
    chip: "bg-emerald-950/50 border-emerald-600/40 text-emerald-200",
    dot: "bg-emerald-400",
  },
};

const SCAN_BATCH = 20;
const scanCacheKey = (userId: string) => `cyber_sakhi_gmail_scan_${userId}`;

interface GmailListResponse {
  messages: EnrichedGmailMessage[];
  nextPageToken?: string | null;
  resultSizeEstimate?: number;
}

interface GmailErrorResponse {
  error?: string;
  details?: string;
}

function isGmailErrorResponse(
  data: GmailListResponse | GmailErrorResponse
): data is GmailErrorResponse {
  return "error" in data;
}

interface ParsedSender {
  displayName: string;
  email: string;
}

function parseRfc5322Address(raw: string | null | undefined): ParsedSender {
  if (!raw) return { displayName: "Unknown sender", email: "" };

  const trimmed = raw.trim();
  const angleMatch = trimmed.match(/^(.*?)\s*<([^>]+)>\s*$/);
  if (angleMatch) {
    const [, namePart, emailPart] = angleMatch;
    const displayName = namePart
      .trim()
      .replace(/^"|"$/g, "")
      .trim();
    return {
      displayName: displayName || emailPart.split("@")[0] || emailPart,
      email: emailPart.trim(),
    };
  }

  const bareMatch = trimmed.match(/^([^\s@<>"]+@[^\s@<>"]+\.[^\s@<>"]+)$/);
  if (bareMatch) {
    const email = bareMatch[1];
    return { displayName: email.split("@")[0] || email, email };
  }

  return { displayName: trimmed, email: "" };
}

function formatSentTime(
  internalDateMs: number | null | undefined,
  rfcDate: string | null | undefined
): { short: string; title: string } {
  let dateObj: Date | null = null;
  if (typeof internalDateMs === "number" && internalDateMs > 0) {
    dateObj = new Date(internalDateMs);
  } else if (rfcDate) {
    const parsed = new Date(rfcDate);
    if (!Number.isNaN(parsed.getTime())) dateObj = parsed;
  }

  if (!dateObj) {
    return { short: rfcDate?.substring(0, 16) || "—", title: rfcDate || "" };
  }

  const now = new Date();
  const sameDay =
    dateObj.getFullYear() === now.getFullYear() &&
    dateObj.getMonth() === now.getMonth() &&
    dateObj.getDate() === now.getDate();

  const sameYear = dateObj.getFullYear() === now.getFullYear();

  let short: string;
  if (sameDay) {
    short = dateObj.toLocaleTimeString([], {
      hour: "numeric",
      minute: "2-digit",
    });
  } else if (sameYear) {
    short = dateObj.toLocaleDateString([], {
      month: "short",
      day: "numeric",
    });
  } else {
    short = dateObj.toLocaleDateString([], {
      year: "numeric",
      month: "short",
      day: "numeric",
    });
  }

  return {
    short,
    title: dateObj.toLocaleString(),
  };
}

const STANDARD_LABEL_META: Record<
  string,
  { label: string; color: string; chip?: boolean }
> = {
  INBOX: { label: "Inbox", color: "bg-slate-700/60 border-slate-600 text-slate-200" },
  SPAM: { label: "Spam", color: "bg-red-950/60 border-red-700/50 text-red-300", chip: true },
  TRASH: { label: "Trash", color: "bg-slate-700/40 border-slate-600 text-slate-300" },
  SENT: { label: "Sent", color: "bg-slate-700/60 border-slate-600 text-slate-200" },
  DRAFT: { label: "Draft", color: "bg-amber-950/50 border-amber-700/40 text-amber-300", chip: true },
  STARRED: { label: "Starred", color: "bg-yellow-950/50 border-yellow-700/40 text-yellow-300" },
  UNREAD: { label: "Unread", color: "bg-blue-950/50 border-blue-700/40 text-blue-300" },
  IMPORTANT: { label: "Important", color: "bg-orange-950/50 border-orange-700/40 text-orange-300" },
  CATEGORY_PERSONAL: { label: "Personal", color: "bg-emerald-950/50 border-emerald-700/40 text-emerald-300" },
  CATEGORY_SOCIAL: { label: "Social", color: "bg-sky-950/50 border-sky-700/40 text-sky-300" },
  CATEGORY_PROMOTIONS: { label: "Promotions", color: "bg-violet-950/50 border-violet-700/40 text-violet-300" },
  CATEGORY_UPDATES: { label: "Updates", color: "bg-cyan-950/50 border-cyan-700/40 text-cyan-300" },
  CATEGORY_FORUMS: { label: "Forums", color: "bg-fuchsia-950/50 border-fuchsia-700/40 text-fuchsia-300" },
};

function formatBytes(bytes: number | undefined | null): string {
  if (!bytes || bytes <= 0) return "";
  const k = 1024;
  if (bytes < k) return `${bytes} B`;
  if (bytes < k * k) return `${(bytes / k).toFixed(1)} KB`;
  return `${(bytes / (k * k)).toFixed(1)} MB`;
}

function GmailLogo({ className = "" }: { className?: string }) {
  return (
    <svg
      viewBox="0 0 48 48"
      className={className}
      role="img"
      aria-label="Gmail logo"
      focusable="false"
    >
      <path
        fill="#4caf50"
        d="M45,16.2l-5,2.75l-5,4.75L35,40h7c1.657,0,3-1.343,3-3V16.2z"
      />
      <path
        fill="#1e88e5"
        d="M3,16.2l3.614,1.71L13,23.7V40H6c-1.657,0-3-1.343-3-3V16.2z"
      />
      <polygon
        fill="#e53935"
        points="35,11.2 24,19.45 13,11.2 12,17 13,23.7 24,31.95 35,23.7 36,17"
      />
      <path
        fill="#c62828"
        d="M3,12.298V16.2l10,7.5V11.2L9.876,8.859C9.132,8.301,8.228,8,7.298,8h0C4.924,8,3,9.924,3,12.298z"
      />
      <path
        fill="#fbc02d"
        d="M45,12.298V16.2l-10,7.5V11.2l3.124-2.341C38.868,8.301,39.772,8,40.702,8h0C43.076,8,45,9.924,45,12.298z"
      />
    </svg>
  );
}

export default function GmailForensicsPage() {
  const { data: session, status: sessionStatus } = useSession();
  const [currentUserId, setCurrentUserId] = useState<string | null>(null);
  
  const [messages, setMessages] = useState<EnrichedGmailMessage[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [isConnected, setIsConnected] = useState<boolean | null>(null);
  const [analyzingId, setAnalyzingId] = useState<string | null>(null);
  const [isDemoMode, setIsDemoMode] = useState<boolean>(false);

  const [mounted, setMounted] = useState(false);

  useEffect(() => {
    const raf = requestAnimationFrame(() => setMounted(true));
    return () => cancelAnimationFrame(raf);
  }, []);

  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [starredLocal, setStarredLocal] = useState<Set<string>>(new Set());
  const [sidebarFolder, setSidebarFolder] = useState<string>("INBOX");
  const [searchQuery, setSearchQuery] = useState<string>("");

  const [windowDays, setWindowDays] = useState<number>(30);
  const [scanResults, setScanResults] = useState<Record<string, QuickScan>>({});
  const scanResultsRef = useRef<Record<string, QuickScan>>({});
  const scanRunRef = useRef(0);
  const [scanState, setScanState] = useState<{
    running: boolean;
    done: number;
    total: number;
    error: string | null;
  }>({ running: false, done: 0, total: 0, error: null });
  const [severityFilter, setSeverityFilter] = useState<Severity | "ALL">("ALL");

  // Load this user's cached quick-scan results (or clear them on sign-out).
  useEffect(() => {
    scanRunRef.current++;
    let cached: Record<string, QuickScan> = {};
    if (currentUserId) {
      try {
        cached = JSON.parse(localStorage.getItem(scanCacheKey(currentUserId)) || "{}");
      } catch {
        cached = {};
      }
    }
    scanResultsRef.current = cached;
    setScanResults(cached);
    setSeverityFilter("ALL");
  }, [currentUserId]);

  // Reset all Gmail state when the authenticated user changes
  useEffect(() => {
    if (sessionStatus === "authenticated" && session?.user?.id) {
      if (currentUserId !== session.user.id) {
        // User has changed - reset all Gmail state
        setCurrentUserId(session.user.id);
        setMessages([]);
        setSelectedIds(new Set());
        setStarredLocal(new Set());
        setSidebarFolder("INBOX");
        setSearchQuery("");
        setError(null);
        setIsConnected(null);
        setAnalyzingId(null);
      }
    } else if (sessionStatus === "unauthenticated") {
      // User logged out - reset state
      setCurrentUserId(null);
      setMessages([]);
      setSelectedIds(new Set());
      setStarredLocal(new Set());
      setSidebarFolder("INBOX");
      setSearchQuery("");
      setError(null);
      setIsConnected(null);
      setAnalyzingId(null);
    }
  }, [sessionStatus, session?.user?.id, currentUserId]);

  const loadMessages = useCallback(async () => {
    if (!session?.user?.id) {
      setError("Please login to access Gmail integration.");
      setIsConnected(false);
      return;
    }

    setIsLoading(true);
    setError(null);

    try {
      // Check if this is the SIH Demo account and use demo mailbox
      const demoStatusResponse = await fetch("/api/demo/status", {
        method: "GET",
        cache: "no-store",
      });

      let isDemo = false;
      if (demoStatusResponse.ok) {
        const demoData = await demoStatusResponse.json();
        isDemo = demoData.isDemo;
        setIsDemoMode(isDemo);
      }

      const response = await fetch(
        isDemo ? "/api/demo/mailbox" : "/api/gmail/messages",
        {
          method: "GET",
          cache: "no-store",
        }
      );

      const data = (await response.json()) as
        | GmailListResponse
        | GmailErrorResponse;

      if (!response.ok) {
        setIsConnected(false);
        setMessages([]);
        setSelectedIds(new Set());

        setError(
          isGmailErrorResponse(data) && data.error
            ? data.error
            : isDemo
            ? "Unable to load demo mailbox. Please try again."
            : "Unable to load Gmail messages. Please connect Gmail first."
        );

        return;
      }

      const gmailData = data as GmailListResponse;

      setMessages(gmailData.messages || []);
      setIsConnected(true);
      setWindowDays(
        (gmailData as GmailListResponse & { window?: { days?: number } }).window
          ?.days ?? 30
      );

      const allIds = new Set((gmailData.messages || []).map((m) => m.id));
      setSelectedIds((prev) => {
        const next = new Set<string>();
        for (const id of prev) if (allIds.has(id)) next.add(id);
        return next;
      });
    } catch {
      setError(
        isDemoMode
          ? "Unable to connect to Cyber Sakhi demo mailbox. Please try again."
          : "Unable to connect to Cyber Sakhi Gmail service. Please try again."
      );
      setIsConnected(false);
      setMessages([]);
    } finally {
      setIsLoading(false);
    }
  }, [session?.user?.id, isDemoMode]);

  useEffect(() => {
    if (sessionStatus === "authenticated" && session?.user?.id) {
      loadMessages();
    }
  }, [loadMessages, sessionStatus, session?.user?.id, isDemoMode]);

  // Quick-scan every listed message that has no cached result yet, newest
  // first, in small batches so colours fill in progressively.
  useEffect(() => {
    if (!isConnected || !currentUserId || messages.length === 0) return;
    
    // Skip quick scan for demo mode - demo emails have pre-configured forensic types
    if (isDemoMode) {
      // Set demo-specific scan results based on forensic types
      const demoScanResults: Record<string, QuickScan> = {};
      messages.forEach(email => {
        if (email.forensicType) {
          const severityMap: Record<string, Severity> = {
            normal: "SAFE",
            phishing: "CRITICAL",
            spoofed: "HIGH",
            suspicious: "MEDIUM",
            "spf-dkim-dmarc": "LOW",
            "threat-indicators": "HIGH",
            "smtp-relay": "MEDIUM"
          };
          const scoreMap: Record<string, number> = {
            normal: 15,
            phishing: 95,
            spoofed: 78,
            suspicious: 62,
            "spf-dkim-dmarc": 25,
            "threat-indicators": 85,
            "smtp-relay": 55
          };
          demoScanResults[email.id] = {
            level: severityMap[email.forensicType] || "LOW",
            score: scoreMap[email.forensicType] || 50,
            reason: `Demo: ${email.forensicType} sample`
          };
        }
      });
      scanResultsRef.current = demoScanResults;
      setScanResults(demoScanResults);
      setScanState({ running: false, done: messages.length, total: messages.length, error: null });
      return;
    }
    
    const all = messages.map((m) => m.id);
    const pending = all.filter((id) => !scanResultsRef.current[id]);
    if (pending.length === 0) {
      setScanState({ running: false, done: all.length, total: all.length, error: null });
      return;
    }

    const run = ++scanRunRef.current;
    const userId = currentUserId;

    (async () => {
      let done = all.length - pending.length;
      setScanState({ running: true, done, total: all.length, error: null });

      for (let i = 0; i < pending.length; i += SCAN_BATCH) {
        if (scanRunRef.current !== run) return;
        const batch = pending.slice(i, i + SCAN_BATCH);
        try {
          const res = await fetch("/api/gmail/scan", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ ids: batch }),
          });
          const json = await res.json();
          if (!res.ok) throw new Error(json.error || `Scan failed (${res.status})`);
          if (scanRunRef.current !== run) return;

          const next = { ...scanResultsRef.current };
          for (const r of json.results as Array<{
            id: string;
            level?: Severity;
            score?: number;
            reason?: string | null;
          }>) {
            if (r.level && typeof r.score === "number") {
              next[r.id] = { level: r.level, score: r.score, reason: r.reason ?? null };
            }
          }
          scanResultsRef.current = next;
          setScanResults(next);
          try {
            localStorage.setItem(scanCacheKey(userId), JSON.stringify(next));
          } catch {
            /* storage full or blocked: results still show for this visit */
          }
          done += batch.length;
          setScanState({ running: true, done, total: all.length, error: null });
        } catch (err) {
          if (scanRunRef.current !== run) return;
          setScanState({
            running: false,
            done,
            total: all.length,
            error: err instanceof Error ? err.message : "Quick scan failed",
          });
          return;
        }
      }
      if (scanRunRef.current === run) {
        setScanState({ running: false, done: all.length, total: all.length, error: null });
      }
    })();
  }, [messages, isConnected, currentUserId, isDemoMode]);

  const severityCounts = useMemo(() => {
    const counts: Record<Severity, number> = { CRITICAL: 0, HIGH: 0, MEDIUM: 0, LOW: 0, SAFE: 0 };
    for (const m of messages) {
      const r = scanResults[m.id];
      if (r) counts[r.level]++;
    }
    return counts;
  }, [messages, scanResults]);

  const handleConnectGmail = () => {
    window.location.href = "/api/gmail/connect";
  };

  const handleDisconnectGmail = async () => {
    if (!session?.user?.id) return;

    // Clear user's Gmail token cookie
    document.cookie = `cyber_sakhi_gmail_token_${session.user.id}=; expires=Thu, 01 Jan 1970 00:00:00 UTC; path=/;`;
    
    // Reset local state
    setMessages([]);
    setSelectedIds(new Set());
    setStarredLocal(new Set());
    setIsConnected(false);
    setError(null);

    // Disconnecting Gmail also forgets what was learned from it.
    scanRunRef.current++;
    scanResultsRef.current = {};
    setScanResults({});
    setScanState({ running: false, done: 0, total: 0, error: null });
    try {
      localStorage.removeItem(scanCacheKey(session.user.id));
    } catch {
      /* nothing to clear */
    }
  };

  const handleAnalyze = async (messageId: string) => {
    setAnalyzingId(messageId);
    setError(null);

    try {
      const response = await fetch(
        isDemoMode
          ? `/api/demo/analyze/${encodeURIComponent(messageId)}`
          : `/api/gmail/analyze/${encodeURIComponent(messageId)}`,
        {
          method: "GET",
          cache: "no-store",
        }
      );

      const payload = await response.json();

      if (!response.ok) {
        setError(
          payload.error ||
            (isDemoMode
              ? "Unable to analyze this demo email."
              : "Unable to analyze this Gmail message.")
        );
        return;
      }

      sessionStorage.setItem(
        "cyber_sakhi_gmail_analysis",
        JSON.stringify({
          analysis: payload.analysis,
          historyId: payload.historyId,
          historySaveError: payload.historySaveError,
          case: payload.case,
          caseSaveError: payload.caseSaveError,
          isDemo: isDemoMode,
        })
      );

      window.location.href = "/email-forensics";
    } catch {
      setError(
        isDemoMode
          ? "Network error while analyzing the demo email."
          : "Network error while analyzing the Gmail message."
      );
    } finally {
      setAnalyzingId(null);
    }
  };

  const filteredMessages = useMemo(() => {
    const q = searchQuery.trim().toLowerCase();
    let list = messages;

    if (sidebarFolder !== "INBOX" && sidebarFolder !== "ALL") {
      list = list.filter((m) => (m.labelIds || []).includes(sidebarFolder));
    }
    if (sidebarFolder === "INBOX") {
      list = list.filter(
        (m) =>
          (m.labelIds || []).includes("INBOX") ||
          !(m.labelIds || []).some((l) =>
            ["SENT", "DRAFT", "SPAM", "TRASH"].includes(l)
          )
      );
    }

    if (q) {
      list = list.filter((m) => {
        const hay = [
          m.subject || "",
          m.from || "",
          m.to || "",
          m.snippet || "",
        ]
          .join(" ")
          .toLowerCase();
        return hay.includes(q);
      });
    }

    if (severityFilter !== "ALL") {
      list = list.filter((m) => scanResults[m.id]?.level === severityFilter);
    }

    return list;
  }, [messages, searchQuery, sidebarFolder, severityFilter, scanResults]);

  const allVisibleSelected =
    filteredMessages.length > 0 &&
    filteredMessages.every((m) => selectedIds.has(m.id));
  const someVisibleSelected =
    filteredMessages.some((m) => selectedIds.has(m.id)) && !allVisibleSelected;

  const toggleSelectAll = () => {
    if (allVisibleSelected) {
      setSelectedIds((prev) => {
        const next = new Set(prev);
        for (const m of filteredMessages) next.delete(m.id);
        return next;
      });
    } else {
      setSelectedIds((prev) => {
        const next = new Set(prev);
        for (const m of filteredMessages) next.add(m.id);
        return next;
      });
    }
  };

  const toggleSelectOne = (id: string, e: React.MouseEvent) => {
    e.stopPropagation();
    setSelectedIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  const toggleStar = (id: string, e: React.MouseEvent) => {
    e.stopPropagation();
    setStarredLocal((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  const visibleCount = filteredMessages.length;
  const inboxCount = messages.filter(
    (m) =>
      (m.labelIds || []).includes("UNREAD") &&
      ((m.labelIds || []).includes("INBOX") ||
        !(m.labelIds || []).some((l) =>
          ["SENT", "DRAFT", "SPAM", "TRASH"].includes(l)
        ))
  ).length;

  return (
    <div className="space-y-6 animate-in fade-in duration-300">
      {isConnected === true ? (
        <>
          <div className="flex flex-col xl:flex-row xl:items-end xl:justify-between gap-5">
            <div className="space-y-3">
              <Link
                href="/email-forensics"
                className="inline-flex items-center gap-2 text-xs font-medium text-slate-400 transition-colors hover:text-white"
              >
                <ArrowLeft className="h-4 w-4" />
                Back to Email Forensics
              </Link>

              <div className="inline-flex items-center gap-2 rounded-full border border-emergency-500/30 bg-emergency-950/50 px-3 py-1 text-[11px] font-semibold text-emergency-200 backdrop-blur-md">
                <Mail className="h-3.5 w-3.5 text-emergency-400" />
                <span>{isDemoMode ? "SIH Demo Mailbox" : "Gmail Investigation"}</span>
              </div>

              <h1 className="text-2xl font-extrabold text-white sm:text-3xl">
                {isDemoMode ? "SIH Demo Email Forensics" : "Analyze a Suspicious Gmail Message"}
              </h1>

              <p className="max-w-2xl text-sm text-slate-300">
                {isDemoMode
                  ? "Explore Cyber Sakhi's email forensic analysis using sanitized demo samples. No real Gmail account required."
                  : "Select a message below and run Cyber Sakhi's email forensic analysis on its real raw email source."
                }
              </p>
            </div>
          </div>

          <div className="flex flex-wrap items-center gap-x-4 gap-y-3 rounded-2xl border border-slate-800/90 bg-[#0b0b17]/80 px-4 py-3 backdrop-blur-xl">
            <span className="inline-flex h-9 w-9 shrink-0 items-center justify-center rounded-lg border border-slate-700/80 bg-[#0b0b17]/90 p-1.5">
              <GmailLogo className="h-full w-full" />
            </span>

            <div className="min-w-0">
              <div className="flex items-center gap-2">
                <span className="relative flex h-1.5 w-1.5">
                  <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-emerald-400 opacity-75 motion-reduce:animate-none" />
                  <span className="relative inline-flex h-1.5 w-1.5 rounded-full bg-emerald-400" />
                </span>
                <span className="text-[10px] font-bold uppercase tracking-[0.24em] text-emerald-300">
                  {isDemoMode ? "Demo Mode Active" : "Connected"}
                </span>
              </div>
              <div className="mt-0.5 truncate text-xs font-medium text-slate-300">
                {isDemoMode ? "SIH Demo Mailbox — Demo data — no real Gmail account connected" : (session?.user?.email ?? "Gmail")}
              </div>
            </div>

            <div className="flex w-full items-center gap-2 sm:ml-auto sm:w-auto">
              {isDemoMode ? (
                <span className="hidden sm:inline-flex items-center gap-1.5 rounded-lg border border-blue-700/50 bg-blue-950/60 px-3 py-1.5 text-[10px] font-bold uppercase tracking-widest text-blue-300">
                  <ShieldCheck className="h-3 w-3 text-blue-400" />
                  Read-only demonstration
                </span>
              ) : (
                <span className="hidden sm:inline-flex items-center gap-1.5 rounded-lg border border-slate-700/70 bg-slate-900/70 px-3 py-1.5 text-[10px] font-bold uppercase tracking-widest text-slate-400">
                  <ShieldCheck className="h-3 w-3 text-emerald-400" />
                  Read-only access
                </span>
              )}
              <button
                type="button"
                onClick={loadMessages}
                disabled={isLoading}
                className="inline-flex items-center gap-2 rounded-lg border border-slate-700 bg-slate-800 px-3.5 py-1.5 text-xs font-bold text-slate-200 transition hover:bg-slate-700 disabled:opacity-50"
              >
                <RefreshCw
                  className={`h-3.5 w-3.5 ${isLoading ? "animate-spin" : ""}`}
                />
                Refresh
              </button>
              {!isDemoMode && (
                <button
                  type="button"
                  onClick={handleDisconnectGmail}
                  className="inline-flex items-center gap-2 rounded-lg border border-red-700/50 bg-red-950/80 px-3.5 py-1.5 text-xs font-bold text-red-300 transition hover:bg-red-900/70"
                >
                  <ShieldAlert className="h-3.5 w-3.5" />
                  Disconnect Gmail
                </button>
              )}
            </div>
          </div>

          {error && (
            <div className="p-4 rounded-xl bg-red-950/70 border border-red-500/40 text-red-200 text-xs flex items-start gap-2">
              <AlertCircle className="w-4 h-4 text-red-400 shrink-0 mt-0.5" />
              <span>{error}</span>
            </div>
          )}
        </>
      ) : (
        <>
          {/* ============ DEMO MODE VS GMAIL CONNECT HERO ============ */}
          {isDemoMode ? (
            <section className="relative overflow-hidden">
              <div aria-hidden className="pointer-events-none absolute inset-0 -z-10">
                <div
                  className="absolute inset-0"
                  style={{
                    backgroundImage:
                      "linear-gradient(rgba(59,130,246,0.05) 1px, transparent 1px), linear-gradient(90deg, rgba(59,130,246,0.05) 1px, transparent 1px)",
                    backgroundSize: "44px 44px",
                    maskImage:
                      "radial-gradient(ellipse 75% 70% at 50% 10%, black 30%, transparent 80%)",
                    WebkitMaskImage:
                      "radial-gradient(ellipse 75% 70% at 50% 10%, black 30%, transparent 80%)",
                  }}
                />
                <div
                  className="absolute left-1/2 -top-32 -translate-x-1/2 w-[640px] h-[380px] rounded-full"
                  style={{
                    background:
                      "radial-gradient(circle, rgba(59,130,246,0.26) 0%, rgba(59,130,246,0.06) 45%, transparent 72%)",
                    filter: "blur(36px)",
                  }}
                />
              </div>

              <div className="hero-scanline" aria-hidden />

              <div className="relative z-10 mx-auto max-w-4xl px-4 py-10 sm:py-14">
                <Link
                  href="/email-forensics"
                  className="inline-flex items-center gap-2 text-xs font-medium text-slate-400 transition-opacity duration-700 hover:text-white"
                >
                  <ArrowLeft className="h-4 w-4" />
                  Back to Email Forensics
                </Link>

                <div className="mt-8 flex items-center gap-4">
                  <span className="inline-flex h-14 w-14 shrink-0 items-center justify-center rounded-2xl border border-blue-700/80 bg-[#0b0b17]/90 p-2.5 backdrop-blur-md shadow-lg shadow-blue-950/30">
                    <GmailLogo className="h-full w-full" />
                  </span>
                  <EyebrowBadge icon={Mail}>
                    <span>SIH Demo Mailbox</span>
                  </EyebrowBadge>
                </div>

                <div className="mt-5">
                  <div
                    role="status"
                    className="inline-flex items-center gap-2 rounded-full border border-blue-500/25 bg-blue-950/50 px-3 py-1 backdrop-blur-md"
                  >
                    <span className="relative flex h-1.5 w-1.5">
                      <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-blue-400 opacity-75 motion-reduce:animate-none" />
                      <span className="relative inline-flex h-1.5 w-1.5 rounded-full bg-blue-500" />
                    </span>
                    <span className="text-[10px] font-bold uppercase tracking-[0.28em] text-blue-200">
                      Demo Mode Active
                    </span>
                  </div>
                </div>

                <h1 className="mt-6">
                  <span className="tracking-tight text-white font-black text-4xl sm:text-5xl md:text-6xl">
                    SIH Demo <span className="text-blue-gradient">Email Forensics</span>
                  </span>
                </h1>

                <div className="mt-5">
                  <p className="max-w-2xl text-sm font-light leading-relaxed tracking-wide text-slate-200 sm:text-base">
                    Explore Cyber Sakhi's email forensic analysis using sanitized demo samples.
                    No real Gmail account required — perfect for SIH judges and demonstrations.
                  </p>
                  <p className="mt-2 max-w-2xl text-xs leading-relaxed text-slate-400">
                    Demo mailbox contains preloaded forensic samples including phishing attempts, spoofed emails,
                    SPF/DKIM/DMARC analysis, and threat indicators. All data is clearly marked as demonstration content.
                  </p>
                </div>

                <div className="mt-8 max-w-2xl rounded-2xl border border-blue-800/90 bg-[#0b0b17]/80 p-5 backdrop-blur-xl sm:p-6">
                  <div className="flex flex-col gap-5 sm:flex-row sm:items-center sm:justify-between">
                    <div className="flex items-start gap-3 min-w-0">
                      <span className="inline-flex h-10 w-10 shrink-0 items-center justify-center rounded-xl border border-blue-700/50 bg-blue-950/60">
                        <ShieldCheck className="h-5 w-5 text-blue-300" />
                      </span>
                      <div className="min-w-0">
                        <div className="text-sm font-bold text-white">
                          Demo mailbox ready to use
                        </div>
                        <div className="mt-1 text-[11px] leading-relaxed text-slate-400">
                          The SIH Demo account has automatic access to the demo mailbox with preloaded forensic samples.
                          No Google OAuth required.
                        </div>
                      </div>
                    </div>

                    <button
                      type="button"
                      onClick={loadMessages}
                      disabled={isLoading}
                      className="btn-emergency w-full shrink-0 sm:w-auto"
                      style={{
                        background: "linear-gradient(135deg, #3b82f6 0%, #2563eb 50%, #1d4ed8 100%)",
                        boxShadow: "0 15px 40px -12px rgba(59, 130, 246, 0.5), inset 0 1px 0 rgba(255,255,255,0.18)",
                      }}
                    >
                      {isLoading ? (
                        <>
                          <Loader2 className="h-4 w-4 animate-spin" />
                          <span>Loading demo mailbox…</span>
                        </>
                      ) : (
                        <>
                          <ShieldCheck className="h-4 w-4" />
                          <span>Open Demo Mailbox</span>
                        </>
                      )}
                    </button>
                  </div>

                  {error && (
                    <div
                      role="alert"
                      className="mt-4 flex items-start gap-2 rounded-xl border border-red-500/50 bg-red-950/80 p-3 text-xs text-red-200"
                    >
                      <AlertCircle className="h-4 w-4 shrink-0 text-red-400" />
                      <span className="min-w-0 break-words">{error}</span>
                    </div>
                  )}

                  <ul className="mt-5 grid gap-2 border-t border-slate-800/70 pt-4 text-[11px] text-slate-400 sm:grid-cols-3">
                    <li className="flex items-center gap-2">
                      <CheckCircle2 className="h-3.5 w-3.5 shrink-0 text-emerald-400" />
                      No Google OAuth required
                    </li>
                    <li className="flex items-center gap-2">
                      <CheckCircle2 className="h-3.5 w-3.5 shrink-0 text-emerald-400" />
                      Preloaded forensic samples
                    </li>
                    <li className="flex items-center gap-2">
                      <CheckCircle2 className="h-3.5 w-3.5 shrink-0 text-emerald-400" />
                      Clearly marked demo data
                    </li>
                  </ul>
                </div>
              </div>
            </section>
          ) : (
            <section className="relative overflow-hidden">
              <div aria-hidden className="pointer-events-none absolute inset-0 -z-10">
                <div
                  className="absolute inset-0"
                  style={{
                    backgroundImage:
                      "linear-gradient(rgba(239,68,68,0.05) 1px, transparent 1px), linear-gradient(90deg, rgba(239,68,68,0.05) 1px, transparent 1px)",
                    backgroundSize: "44px 44px",
                    maskImage:
                      "radial-gradient(ellipse 75% 70% at 50% 10%, black 30%, transparent 80%)",
                    WebkitMaskImage:
                      "radial-gradient(ellipse 75% 70% at 50% 10%, black 30%, transparent 80%)",
                  }}
                />
                <div
                  className="absolute left-1/2 -top-32 -translate-x-1/2 w-[640px] h-[380px] rounded-full"
                  style={{
                    background:
                      "radial-gradient(circle, rgba(185,28,28,0.26) 0%, rgba(185,28,28,0.06) 45%, transparent 72%)",
                    filter: "blur(36px)",
                  }}
                />
                <div
                  className="absolute -left-24 top-1/3 w-[420px] h-[280px] rounded-full"
                  style={{
                    background:
                      "radial-gradient(circle, rgba(51,65,85,0.5) 0%, transparent 70%)",
                    filter: "blur(40px)",
                  }}
                />
              </div>

              <div className="hero-scanline" aria-hidden />

              <span
                aria-hidden
                className="pointer-events-none absolute left-3 top-3 h-7 w-7 rounded-tl-xl border-l-2 border-t-2 border-emergency-500/30"
              />
              <span
                aria-hidden
                className="pointer-events-none absolute right-3 top-3 h-7 w-7 rounded-tr-xl border-r-2 border-t-2 border-emergency-500/30"
              />

              <div className="relative z-10 mx-auto max-w-4xl px-4 py-10 sm:py-14">
                <Link
                  href="/email-forensics"
                  className={`inline-flex items-center gap-2 text-xs font-medium text-slate-400 transition-opacity duration-700 hover:text-white ${
                    mounted ? "opacity-100" : "opacity-0"
                  } motion-reduce:transition-none`}
                >
                  <ArrowLeft className="h-4 w-4" />
                  Back to Email Forensics
                </Link>

                <div
                  className={`mt-8 flex items-center gap-4 transition-all duration-1000 ease-out ${
                    mounted ? "opacity-100 translate-y-0" : "opacity-0 translate-y-6"
                  } motion-reduce:opacity-100 motion-reduce:translate-y-0`}
                  style={{ transitionDelay: "60ms" }}
                >
                  <span className="inline-flex h-14 w-14 shrink-0 items-center justify-center rounded-2xl border border-slate-700/80 bg-[#0b0b17]/90 p-2.5 backdrop-blur-md shadow-lg shadow-emergency-950/30">
                    <GmailLogo className="h-full w-full" />
                  </span>
                  <EyebrowBadge icon={Mail}>
                    <span>Live Gmail Integration</span>
                  </EyebrowBadge>
                </div>

                <div
                  className={`mt-5 transition-all duration-1000 ease-out ${
                    mounted ? "opacity-100 translate-y-0" : "opacity-0 translate-y-6"
                  } motion-reduce:opacity-100 motion-reduce:translate-y-0`}
                  style={{ transitionDelay: "160ms" }}
                >
                  <div
                    role="status"
                    className="inline-flex items-center gap-2 rounded-full border border-emergency-500/25 bg-emergency-950/50 px-3 py-1 backdrop-blur-md"
                  >
                    {isConnected === null ? (
                      <Loader2 className="h-3 w-3 animate-spin text-emergency-400 motion-reduce:animate-none" />
                    ) : (
                      <span className="relative flex h-1.5 w-1.5">
                        <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-emergency-400 opacity-75 motion-reduce:animate-none" />
                        <span className="relative inline-flex h-1.5 w-1.5 rounded-full bg-emergency-500" />
                      </span>
                    )}
                    <span className="text-[10px] font-bold uppercase tracking-[0.28em] text-emergency-200">
                      {isConnected === null
                        ? "Checking Connection"
                        : "Not Connected"}
                    </span>
                  </div>
                </div>

                <h1
                  className={`mt-6 transition-all duration-1000 ease-out ${
                    mounted ? "opacity-100 translate-y-0" : "opacity-0 translate-y-6"
                  } motion-reduce:opacity-100 motion-reduce:translate-y-0`}
                  style={{ transitionDelay: "260ms" }}
                >
                  <span className="tracking-tight text-white font-black text-4xl sm:text-5xl md:text-6xl">
                    Connect <span className="text-crimson-gradient">Gmail</span>
                  </span>
                </h1>

                <div
                  className={`transition-all duration-1000 ease-out ${
                    mounted ? "opacity-100 translate-y-0" : "opacity-0 translate-y-6"
                  } motion-reduce:opacity-100 motion-reduce:translate-y-0`}
                  style={{ transitionDelay: "380ms" }}
                >
                  <p className="mt-5 max-w-2xl text-sm font-light leading-relaxed tracking-wide text-slate-200 sm:text-base">
                    Connecting Gmail lets Cyber Sakhi inspect suspicious messages
                    directly — fetching real raw email sources from your inbox for
                    full forensic analysis.
                  </p>
                  <p className="mt-2 max-w-2xl text-xs leading-relaxed text-slate-400">
                    Works through the existing Cyber Sakhi Gmail integration. No
                    sending, no editing, no deleting — inspection only.
                  </p>
                </div>

                <div
                  className={`transition-all duration-1000 ease-out ${
                    mounted ? "opacity-100 translate-y-0" : "opacity-0 translate-y-6"
                  } motion-reduce:opacity-100 motion-reduce:translate-y-0`}
                  style={{ transitionDelay: "500ms" }}
                >
                  <div className="mt-8 max-w-2xl rounded-2xl border border-slate-800/90 bg-[#0b0b17]/80 p-5 backdrop-blur-xl sm:p-6">
                    <div className="flex flex-col gap-5 sm:flex-row sm:items-center sm:justify-between">
                      <div className="flex items-start gap-3 min-w-0">
                        <span className="inline-flex h-10 w-10 shrink-0 items-center justify-center rounded-xl border border-emergency-700/50 bg-emergency-950/60">
                          <ShieldCheck className="h-5 w-5 text-emergency-300" />
                        </span>
                        <div className="min-w-0">
                          <div className="text-sm font-bold text-white">
                            Authorize read-only forensic access
                          </div>
                          <div className="mt-1 text-[11px] leading-relaxed text-slate-400">
                            You&apos;ll be redirected to Google to securely grant
                            Cyber Sakhi read-only access to your Gmail.
                          </div>
                        </div>
                      </div>

                      <button
                        type="button"
                        onClick={handleConnectGmail}
                        disabled={isConnected === null}
                        className="btn-emergency w-full shrink-0 sm:w-auto"
                      >
                        {isConnected === null ? (
                          <>
                            <Loader2 className="h-4 w-4 animate-spin" />
                            <span>Checking connection…</span>
                          </>
                        ) : (
                          <>
                            <ShieldCheck className="h-4 w-4" />
                            <span>Connect Gmail</span>
                          </>
                        )}
                      </button>
                    </div>

                    {error && (
                      <div
                        role="alert"
                        className="mt-4 flex items-start gap-2 rounded-xl border border-red-500/50 bg-red-950/80 p-3 text-xs text-red-200"
                      >
                        <AlertCircle className="h-4 w-4 shrink-0 text-red-400" />
                        <span className="min-w-0 break-words">{error}</span>
                      </div>
                    )}

                    <ul className="mt-5 grid gap-2 border-t border-slate-800/70 pt-4 text-[11px] text-slate-400 sm:grid-cols-3">
                      <li className="flex items-center gap-2">
                        <CheckCircle2 className="h-3.5 w-3.5 shrink-0 text-emerald-400" />
                        Read-only Gmail access
                      </li>
                      <li className="flex items-center gap-2">
                        <CheckCircle2 className="h-3.5 w-3.5 shrink-0 text-emerald-400" />
                        Forensic inspection via existing integration
                      </li>
                      <li className="flex items-center gap-2">
                        <CheckCircle2 className="h-3.5 w-3.5 shrink-0 text-emerald-400" />
                        Secure OAuth — token stored encrypted
                      </li>
                    </ul>
                  </div>
                </div>
              </div>
            </section>
          )}
        </>
      )}

      {isConnected && (
        <section className="relative overflow-hidden rounded-2xl border border-slate-800/90 bg-[#0b0b17]/70 backdrop-blur-xl">
          <div aria-hidden className="pointer-events-none absolute inset-0 -z-10">
            <div
              className="absolute inset-0"
              style={{
                backgroundImage:
                  "linear-gradient(rgba(239,68,68,0.04) 1px, transparent 1px), linear-gradient(90deg, rgba(239,68,68,0.04) 1px, transparent 1px)",
                backgroundSize: "44px 44px",
                maskImage:
                  "radial-gradient(ellipse 80% 60% at 50% 0%, black 30%, transparent 75%)",
                WebkitMaskImage:
                  "radial-gradient(ellipse 80% 60% at 50% 0%, black 30%, transparent 75%)",
              }}
            />
            <div
              className="absolute left-1/2 -top-36 h-[320px] w-[720px] -translate-x-1/2 rounded-full"
              style={{
                background:
                  "radial-gradient(circle, rgba(185,28,28,0.18) 0%, rgba(185,28,28,0.04) 45%, transparent 72%)",
                filter: "blur(40px)",
              }}
            />
          </div>
          <div className="hero-scanline" aria-hidden />
          <span
            aria-hidden
            className="pointer-events-none absolute left-2 top-2 h-6 w-6 rounded-tl-lg border-l-2 border-t-2 border-emergency-500/25"
          />
          <span
            aria-hidden
            className="pointer-events-none absolute right-2 top-2 h-6 w-6 rounded-tr-lg border-r-2 border-t-2 border-emergency-500/25"
          />

          <div className="relative z-10 flex flex-col lg:flex-row min-h-[640px]">
            <aside className="w-full shrink-0 border-b bg-slate-950/40 p-3 space-y-4 backdrop-blur-md lg:w-60 lg:border-b-0 lg:border-r lg:p-4 lg:border-slate-800/70">
              <div>
                <div className="px-3 pb-1.5 text-[10px] font-bold uppercase tracking-[0.2em] text-slate-500">
                  Investigation
                </div>
                <button
                  type="button"
                  className="w-full inline-flex items-center justify-center gap-2 px-4 py-2.5 rounded-xl bg-emergency-600 hover:bg-emergency-500 text-white text-xs font-bold transition shadow-lg shadow-emergency-950/30 disabled:opacity-60 cursor-not-allowed"
                  disabled
                  title="Forensic investigation is read-only — sending is disabled in Cyber Sakhi"
                >
                  <FileText className="w-4 h-4" />
                  Investigate
                </button>
              </div>

              <nav className="space-y-0.5 text-xs" aria-label="Mail folders">
                <div className="px-3 pb-1.5 text-[10px] font-bold uppercase tracking-[0.2em] text-slate-500">
                  Mailbox
                </div>
                {[
                  {
                    key: "INBOX",
                    label: "Inbox",
                    Icon: InboxIcon,
                    count: inboxCount,
                  },
                  {
                    key: "STARRED",
                    label: "Starred",
                    Icon: Star,
                  },
                  {
                    key: "SENT",
                    label: "Sent",
                    Icon: Send,
                  },
                  {
                    key: "DRAFT",
                    label: "Drafts",
                    Icon: FileText,
                  },
                  {
                    key: "SPAM",
                    label: "Spam",
                    Icon: ShieldAlert,
                  },
                  {
                    key: "TRASH",
                    label: "Trash",
                    Icon: Trash2,
                  },
                ].map(
                  ({
                    key,
                    label,
                    Icon,
                    count,
                  }) => {
                    const active = sidebarFolder === key;
                    return (
                      <button
                        key={key}
                        type="button"
                        onClick={() => setSidebarFolder(key)}
                        className={`relative w-full inline-flex items-center gap-2.5 px-3 py-2 rounded-lg transition ${
                          active
                            ? "bg-emergency-950/50 text-emergency-200 border border-emergency-700/40 font-bold"
                            : "text-slate-300 hover:bg-slate-800/60 hover:text-slate-100 border border-transparent"
                        }`}
                      >
                        {active && (
                          <span
                            aria-hidden
                            className="absolute left-0 top-1/2 h-5 w-0.5 -translate-y-1/2 rounded-r-full bg-emergency-400"
                          />
                        )}
                        <Icon
                          className={`w-3.5 h-3.5 shrink-0 ${
                            active ? "text-emergency-400" : "text-slate-400"
                          }`}
                        />
                        <span className="flex-1 text-left truncate">
                          {label}
                        </span>
                        {typeof count === "number" && count > 0 ? (
                          <span
                            className={`text-[10px] font-black tracking-wide px-1.5 py-0.5 rounded-md ${
                              active
                                ? "bg-emergency-500/30 text-emergency-200"
                                : "bg-slate-800 text-slate-300"
                            }`}
                          >
                            {count > 99 ? "99+" : count}
                          </span>
                        ) : null}
                      </button>
                    );
                  }
                )}

                <div className="pt-3 mt-2 border-t border-slate-800/60 space-y-0.5">
                  <div className="px-3 pb-1.5 text-[10px] font-bold uppercase tracking-[0.2em] text-slate-500">
                    Categories
                  </div>
                  {[
                    { key: "CATEGORY_PERSONAL", label: "Personal" },
                    { key: "CATEGORY_SOCIAL", label: "Social" },
                    { key: "CATEGORY_PROMOTIONS", label: "Promotions" },
                    { key: "CATEGORY_UPDATES", label: "Updates" },
                  ].map(({ key, label }) => {
                    const active = sidebarFolder === key;
                    return (
                      <button
                        key={key}
                        type="button"
                        onClick={() => setSidebarFolder(key)}
                        className={`w-full inline-flex items-center gap-2.5 px-3 py-1.5 rounded-lg transition ${
                          active
                            ? "bg-slate-800/80 text-slate-100 font-semibold"
                            : "text-slate-400 hover:bg-slate-800/50 hover:text-slate-200"
                        }`}
                      >
                        <Tag className="w-3 h-3 shrink-0 text-slate-500" />
                        <span className="flex-1 text-left truncate text-[11px]">
                          {label}
                        </span>
                      </button>
                    );
                  })}

                  <button
                    key="ALL"
                    type="button"
                    onClick={() => setSidebarFolder("ALL")}
                    className={`w-full inline-flex items-center gap-2.5 px-3 py-1.5 rounded-lg transition ${
                      sidebarFolder === "ALL"
                        ? "bg-slate-800/80 text-slate-100 font-semibold"
                        : "text-slate-400 hover:bg-slate-800/50 hover:text-slate-200"
                    }`}
                  >
                    <Mail className="w-3 h-3 shrink-0 text-slate-500" />
                    <span className="flex-1 text-left truncate text-[11px]">
                      All Mail
                    </span>
                  </button>
                </div>
              </nav>
            </aside>

            <section className="flex-1 min-w-0 flex flex-col">
              <div className="flex flex-col gap-2 border-b border-slate-800/70 bg-slate-950/40 px-3 py-2.5 sm:flex-row sm:items-center lg:px-4">
                <div className="relative flex-1 min-w-0">
                  <Search className="absolute left-3 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-slate-500" />
                  <input
                    type="search"
                    value={searchQuery}
                    onChange={(e) => setSearchQuery(e.target.value)}
                    placeholder="Search sender, subject, preview…"
                    className="w-full rounded-lg border border-slate-700/70 bg-[#0a0a16]/80 py-2 pl-9 pr-9 text-xs font-mono text-slate-100 placeholder:text-slate-500 focus:border-emergency-500 focus:outline-none focus:ring-1 focus:ring-emergency-500/40"
                  />
                  {searchQuery ? (
                    <button
                      type="button"
                      onClick={() => setSearchQuery("")}
                      className="absolute right-2.5 top-1/2 -translate-y-1/2 text-slate-500 hover:text-slate-300 text-[11px] px-1.5 py-0.5 rounded"
                      aria-label="Clear search"
                    >
                      ✕
                    </button>
                  ) : null}
                </div>

                <div className="flex items-center gap-1 text-slate-400 shrink-0">
                  <div className="flex items-center">
                    <label className="sr-only" htmlFor="select-all-visible">
                      Select all visible
                    </label>
                    <input
                      id="select-all-visible"
                      type="checkbox"
                      className="w-3.5 h-3.5 rounded accent-emergency-500 cursor-pointer"
                      checked={allVisibleSelected}
                      ref={(el) => {
                        if (el) el.indeterminate = someVisibleSelected;
                      }}
                      onChange={toggleSelectAll}
                    />
                  </div>
                  <ChevronDown className="w-3.5 h-3.5 mx-0.5 opacity-60" />
                  <span className="mx-2 h-4 w-px bg-slate-700/70" />
                  <span className="text-[11px] px-2 py-1 rounded-lg bg-slate-800/60 border border-slate-700/50 text-slate-300 tabular-nums">
                    {selectedIds.size > 0
                      ? `${selectedIds.size} of ${visibleCount} selected`
                      : `${visibleCount} message${visibleCount === 1 ? "" : "s"}`}
                  </span>
                  <div className="ml-auto sm:ml-2 flex items-center gap-1.5">
                    <button
                      type="button"
                      disabled
                      className="p-1.5 rounded-lg text-slate-500 opacity-60 cursor-not-allowed"
                      title="Archive — read-only mode"
                    >
                      <FileText className="w-3.5 h-3.5" />
                    </button>
                    <button
                      type="button"
                      disabled
                      className="p-1.5 rounded-lg text-slate-500 opacity-60 cursor-not-allowed"
                      title="Delete — read-only mode"
                    >
                      <Trash2 className="w-3.5 h-3.5" />
                    </button>
                    <button
                      type="button"
                      disabled
                      className="p-1.5 rounded-lg text-slate-500 opacity-60 cursor-not-allowed"
                      title="More actions — read-only mode"
                    >
                      <MoreHorizontal className="w-3.5 h-3.5" />
                    </button>
                  </div>
                </div>
              </div>

              <div className="flex items-center justify-between px-3 lg:px-4 py-2 border-b border-slate-800/50 bg-slate-900/30">
                <div className="text-[11px] font-semibold uppercase tracking-widest text-slate-400 flex items-center gap-2">
                  <InboxIcon className="w-3.5 h-3.5 text-emergency-400" />
                  {sidebarFolder === "ALL"
                    ? "All Mail"
                    : sidebarFolder === "STARRED"
                    ? "Starred Messages"
                    : sidebarFolder.startsWith("CATEGORY_")
                    ? sidebarFolder.replace("CATEGORY_", "").toLowerCase() === "promotions"
                      ? "Promotions"
                      : sidebarFolder.replace("CATEGORY_", "")
                    : sidebarFolder[0] + sidebarFolder.slice(1).toLowerCase()}
                  {searchQuery ? (
                    <span className="normal-case font-normal text-slate-500">
                      · searching &ldquo;{searchQuery}&rdquo;
                    </span>
                  ) : null}
                </div>
                <div className="flex items-center gap-3">
                  <span className={`inline-flex items-center gap-1.5 rounded-full border px-2.5 py-1 ${
                    isDemoMode 
                      ? "border-blue-500/25 bg-blue-950/50" 
                      : "border-emergency-500/25 bg-emergency-950/50"
                  }`}>
                    <span className="relative flex h-1 w-1">
                      <span className={`absolute inline-flex h-full w-full animate-ping rounded-full motion-reduce:animate-none ${
                        isDemoMode ? "bg-blue-400" : "bg-emergency-400"
                      } opacity-75`} />
                      <span className={`relative inline-flex h-1 w-1 rounded-full ${
                        isDemoMode ? "bg-blue-500" : "bg-emergency-500"
                      }`} />
                    </span>
                    <span className={`text-[9px] font-bold uppercase tracking-[0.22em] ${
                      isDemoMode ? "text-blue-200" : "text-emergency-200"
                    }`}>
                      {isDemoMode ? "Demo Mailbox" : "Live Investigation"}
                    </span>
                  </span>
                  <span className="text-[10px] font-mono text-slate-500">
                    {isDemoMode 
                      ? `${messages.length} demo messages · demonstration data`
                      : `${messages.length} in the last ${windowDays} days · read-only forensic access`
                    }
                  </span>
                </div>
              </div>

              {messages.length > 0 ? (
                <div className="flex flex-col gap-2 px-3 lg:px-4 py-2.5 border-b border-slate-800/50 bg-slate-950/40">
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <div className="flex items-center gap-2 text-[11px] text-slate-400">
                      {scanState.running ? (
                        <Loader2 className="w-3.5 h-3.5 animate-spin text-emergency-400 motion-reduce:animate-none" />
                      ) : (
                        <ShieldAlert className="w-3.5 h-3.5 text-emergency-400" />
                      )}
                      <span className="tabular-nums">
                        {scanState.running
                          ? `Quick-scanning ${scanState.done} of ${scanState.total} emails…`
                          : `Quick-scanned ${Object.keys(scanResults).filter((id) => messages.some((m) => m.id === id)).length} of ${messages.length} emails`}
                      </span>
                      {severityCounts.CRITICAL + severityCounts.HIGH > 0 ? (
                        <span className="text-red-300 font-semibold">
                          · {severityCounts.CRITICAL + severityCounts.HIGH} need attention
                        </span>
                      ) : null}
                    </div>
                    <span className="text-[10px] text-slate-500">
                      Quick scan skips live network checks and creates no case. Open an email for full forensics.
                    </span>
                  </div>

                  {scanState.running && scanState.total > 0 ? (
                    <div className="h-1 w-full rounded-full bg-slate-800 overflow-hidden" aria-hidden>
                      <div
                        className="h-full bg-emergency-500 transition-[width] duration-300"
                        style={{ width: `${Math.round((scanState.done / scanState.total) * 100)}%` }}
                      />
                    </div>
                  ) : null}

                  {scanState.error ? (
                    <div className="text-[11px] text-red-300">
                      Quick scan stopped: {scanState.error}. Refresh to retry.
                    </div>
                  ) : null}

                  <div className="flex flex-wrap items-center gap-1.5" role="group" aria-label="Filter by severity">
                    <button
                      type="button"
                      onClick={() => setSeverityFilter("ALL")}
                      aria-pressed={severityFilter === "ALL"}
                      className={`px-2 py-0.5 rounded-md border text-[10px] font-bold uppercase tracking-wide transition ${
                        severityFilter === "ALL"
                          ? "bg-slate-200 text-slate-900 border-slate-200"
                          : "bg-slate-900/60 text-slate-400 border-slate-700/60 hover:text-slate-200"
                      }`}
                    >
                      All
                    </button>
                    {SEVERITY_ORDER.map((level) => {
                      const meta = SEVERITY_META[level];
                      const active = severityFilter === level;
                      return (
                        <button
                          key={level}
                          type="button"
                          onClick={() => setSeverityFilter(active ? "ALL" : level)}
                          aria-pressed={active}
                          className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-md border text-[10px] font-bold uppercase tracking-wide tabular-nums transition ${
                            active ? meta.chip : "bg-slate-900/60 text-slate-400 border-slate-700/60 hover:text-slate-200"
                          }`}
                        >
                          <span className={`w-1.5 h-1.5 rounded-full ${meta.dot}`} aria-hidden />
                          {meta.label} {severityCounts[level]}
                        </button>
                      );
                    })}
                  </div>
                </div>
              ) : null}

              <div className="flex-1 min-h-[320px]">
                {isLoading ? (
                  <div className="flex flex-col items-center justify-center gap-3 py-20">
                    <Loader2 className="h-6 w-6 animate-spin text-emergency-400 motion-reduce:animate-none" />
                    <span className="text-[10px] font-bold uppercase tracking-[0.24em] text-slate-400">
                      Loading Gmail messages…
                    </span>
                  </div>
                ) : visibleCount === 0 ? (
                  <div className="flex flex-col items-center justify-center py-20 text-center px-6">
                    <div className="relative mb-4 flex h-14 w-14 items-center justify-center rounded-2xl border border-slate-700/70 bg-slate-950/60">
                      <div
                        aria-hidden
                        className="absolute inset-0 rounded-2xl"
                        style={{
                          backgroundImage:
                            "linear-gradient(rgba(239,68,68,0.06) 1px, transparent 1px), linear-gradient(90deg, rgba(239,68,68,0.06) 1px, transparent 1px)",
                          backgroundSize: "16px 16px",
                        }}
                      />
                      {searchQuery ? (
                        <Search className="relative h-6 w-6 text-slate-500" />
                      ) : (
                        <Mail className="relative h-6 w-6 text-slate-500" />
                      )}
                    </div>
                    <div className="text-sm font-bold text-slate-200 mb-1">
                      {searchQuery
                        ? "No messages match your search"
                        : sidebarFolder === "TRASH"
                        ? "Trash is empty"
                        : sidebarFolder === "SPAM"
                        ? "No messages in Spam"
                        : sidebarFolder === "STARRED"
                        ? "No starred messages yet"
                        : sidebarFolder.startsWith("CATEGORY_")
                        ? "No messages in this category"
                        : isDemoMode
                        ? "No demo messages in this folder"
                        : "No messages to display"}
                    </div>
                    <div className="text-xs text-slate-500 max-w-sm">
                      {searchQuery
                        ? "Try clearing the search box or broadening your terms."
                        : messages.length > 0
                        ? "Try a different folder on the left, or refresh your inbox."
                        : isDemoMode
                        ? "Try a different folder on the left, or refresh the demo mailbox."
                        : "If you just connected Gmail, click Refresh above to pull the latest messages."}
                    </div>
                  </div>
                ) : (
                  <ul
                    role="list"
                    className="divide-y divide-slate-800/60"
                  >
                    {filteredMessages.map((message) => {
                      const sender = parseRfc5322Address(message.from);
                      const { short: sentShort, title: sentFull } =
                        formatSentTime(message.internalDate, message.date);
                      const labels = message.labelIds || [];
                      const isUnread = labels.includes("UNREAD");
                      const isSuspicious = labels.includes("SPAM");
                      const isSelected = selectedIds.has(message.id);
                      const isStarred =
                        starredLocal.has(message.id) ||
                        labels.includes("STARRED");
                      const isAnalyzing = analyzingId === message.id;
                      const scan = scanResults[message.id];
                      const sevMeta = scan ? SEVERITY_META[scan.level] : null;

                      const visibleBadges: {
                        label: string;
                        color: string;
                      }[] = [];

                      const importantLabels = [
                        "SPAM",
                        "DRAFT",
                        "IMPORTANT",
                      ];
                      for (const l of importantLabels) {
                        if (labels.includes(l) && STANDARD_LABEL_META[l]) {
                          visibleBadges.push(STANDARD_LABEL_META[l]);
                        }
                      }

                      for (const l of labels) {
                        if (l.startsWith("CATEGORY_") && STANDARD_LABEL_META[l]) {
                          visibleBadges.push(STANDARD_LABEL_META[l]);
                        }
                      }

                      return (
                        <li
                          key={message.id}
                          data-message-id={message.id}
                          onClick={() => handleAnalyze(message.id)}
                          className={`group relative cursor-pointer transition ${
                            isSelected
                              ? "bg-emergency-950/40 hover:bg-emergency-950/50"
                              : isSuspicious
                              ? "bg-red-950/10 hover:bg-red-950/20 hover:shadow-[inset_0_0_0_1px_rgba(239,68,68,0.18)]"
                              : "hover:bg-slate-800/45 hover:shadow-[inset_0_0_0_1px_rgba(239,68,68,0.12)] focus-within:bg-slate-800/45 focus-within:shadow-[inset_0_0_0_1px_rgba(239,68,68,0.12)]"
                          } ${isUnread ? "bg-slate-900/50" : "bg-slate-950/30"} motion-reduce:transition-none`}
                        >
                          <div
                            className={`grid grid-cols-[auto_auto_minmax(0,1fr)_auto] lg:grid-cols-[auto_auto_minmax(0,1.2fr)_minmax(0,2fr)_auto] items-center gap-2 lg:gap-3 px-3 lg:px-4 py-3 ${
                              isSelected
                                ? "shadow-[inset_3px_0_0_0_rgb(239_68_68_/_0.8)]"
                                : isSuspicious
                                ? "shadow-[inset_3px_0_0_0_rgb(239_68_68_/_0.6)]"
                                : isUnread
                                ? "shadow-[inset_3px_0_0_0_rgb(148_163_184_/_0.4)]"
                                : ""
                            }`}
                            style={
                              sevMeta && !isSelected
                                ? {
                                    boxShadow: `inset 4px 0 0 0 ${sevMeta.stripe}`,
                                    backgroundImage: sevMeta.tint,
                                  }
                                : undefined
                            }
                          >
                            <div
                              className="flex items-center py-0.5"
                              onClick={(e) => e.stopPropagation()}
                            >
                              <input
                                type="checkbox"
                                className="w-3.5 h-3.5 rounded accent-emergency-500 cursor-pointer"
                                aria-label={`Select message from ${sender.displayName}`}
                                checked={isSelected}
                                onChange={(e) =>
                                  toggleSelectOne(message.id, e as unknown as React.MouseEvent)
                                }
                                onClick={(e) => e.stopPropagation()}
                              />
                            </div>

                            <div className="flex items-center py-0.5">
                              <button
                                type="button"
                                aria-label={
                                  isStarred ? "Unstar message" : "Star message"
                                }
                                onClick={(e) => toggleStar(message.id, e)}
                                className={`p-0.5 rounded transition ${
                                  isStarred
                                    ? "text-yellow-400 hover:text-yellow-300"
                                    : "text-slate-600 group-hover:text-slate-400"
                                }`}
                              >
                                {isStarred ? (
                                  <Star className="w-4 h-4 fill-current" />
                                ) : (
                                  <Star className="w-4 h-4" />
                                )}
                              </button>
                            </div>

                            <div className="flex flex-col min-w-0 pr-1">
                              <div className="flex items-center gap-2 min-w-0">
                                {isSuspicious && (
                                  <ShieldAlert
                                    className="h-3.5 w-3.5 shrink-0 text-emergency-400"
                                    aria-label="Flagged as spam by Gmail"
                                  />
                                )}
                                <span
                                  className={`truncate text-[12px] lg:text-[13px] ${
                                    isUnread
                                      ? "text-white font-bold"
                                      : "text-slate-200 font-semibold"
                                  }`}
                                  title={
                                    sender.email
                                      ? `${sender.displayName} <${sender.email}>`
                                      : sender.displayName
                                  }
                                >
                                  {sender.displayName}
                                </span>
                                {labels.includes("IMPORTANT") ? (
                                  <span className="shrink-0 inline-flex items-center text-yellow-500" title="Important">
                                    <Circle className="w-2 h-2 fill-current" />
                                  </span>
                                ) : null}
                              </div>
                              <div className="hidden lg:flex items-center gap-1 mt-0.5">
                                {sender.email ? (
                                  <span className="truncate text-[10px] text-slate-500 font-mono">
                                    {sender.email}
                                  </span>
                                ) : null}
                              </div>
                            </div>

                            <div className="col-span-2 lg:col-span-1 min-w-0 flex flex-col">
                              <div className="flex items-center gap-1.5 min-w-0">
                                <span
                                  className={`truncate text-[12px] lg:text-[13px] ${
                                    isUnread
                                      ? "text-white font-bold"
                                      : "text-slate-100 font-medium"
                                  }`}
                                  title={message.subject || "(no subject)"}
                                >
                                  {message.subject ? (
                                    message.subject
                                  ) : (
                                    <span className="italic text-slate-500 font-normal">
                                      (no subject)
                                    </span>
                                  )}
                                </span>
                                {visibleBadges.length > 0 ? (
                                  <div className="hidden sm:inline-flex flex-wrap gap-1 shrink-0">
                                    {visibleBadges.slice(0, 2).map((badge) => (
                                      <span
                                        key={badge.label}
                                        className={`inline-flex items-center px-1.5 py-0.5 rounded-md border text-[9px] font-bold uppercase tracking-wide ${badge.color}`}
                                      >
                                        {badge.label}
                                      </span>
                                    ))}
                                  </div>
                                ) : null}
                              </div>

                              <div className="flex items-center gap-2 mt-0.5 min-w-0">
                                <span
                                  className="truncate text-[11px] text-slate-500 leading-tight"
                                  title={message.snippet}
                                >
                                  {message.snippet
                                    ? message.snippet
                                    : "No preview text available"}
                                </span>
                              </div>
                            </div>

                            <div className="flex lg:flex-col items-center lg:items-end justify-end gap-1 lg:gap-1.5 shrink-0 pl-1 min-w-[60px] lg:min-w-[96px]">
                              <div className="flex items-center gap-1">
                                {sevMeta && scan ? (
                                  <span
                                    className={`inline-flex items-center gap-1 px-1.5 py-0.5 rounded-md border text-[9px] font-bold uppercase tracking-wide tabular-nums ${sevMeta.chip}`}
                                    title={
                                      scan.reason
                                        ? `Quick scan: ${sevMeta.label} (${scan.score}/100) — ${scan.reason}`
                                        : `Quick scan: ${sevMeta.label} (${scan.score}/100)`
                                    }
                                  >
                                    <span className={`w-1.5 h-1.5 rounded-full ${sevMeta.dot}`} aria-hidden />
                                    {sevMeta.label} · {scan.score}
                                  </span>
                                ) : scanState.running ? (
                                  <span
                                    className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded-md border border-slate-700/60 bg-slate-900/60 text-[9px] font-bold uppercase tracking-wide text-slate-500"
                                    title="Waiting for quick scan"
                                  >
                                    <Loader2 className="w-2.5 h-2.5 animate-spin motion-reduce:animate-none" />
                                    Scanning
                                  </span>
                                ) : null}
                                {visibleBadges.length > 2 ? (
                                  <span
                                    className="hidden sm:inline-flex items-center px-1.5 py-0.5 rounded-md border bg-slate-800 border-slate-700 text-[9px] font-bold text-slate-300"
                                    title={visibleBadges
                                      .slice(2)
                                      .map((b) => b.label)
                                      .join(", ")}
                                  >
                                    +{visibleBadges.length - 2}
                                  </span>
                                ) : null}
                                {typeof message.sizeEstimate === "number" &&
                                message.sizeEstimate > 50_000 ? (
                                  <span
                                    className="hidden lg:inline-flex items-center text-slate-500"
                                    title={`Size: ${formatBytes(
                                      message.sizeEstimate
                                    )}`}
                                  >
                                    <Paperclip className="w-3 h-3" />
                                  </span>
                                ) : null}
                                {isUnread ? (
                                  <span
                                    className="inline-flex items-center lg:hidden w-2 h-2 rounded-full bg-emergency-400 shadow shadow-emergency-500/50"
                                    aria-label="Unread"
                                  />
                                ) : null}
                              </div>

                              <div
                                className="flex items-center gap-1"
                                title={sentFull}
                              >
                                <Clock className="hidden lg:block w-3 h-3 text-slate-600 shrink-0" />
                                <span
                                  className={`text-[11px] tabular-nums ${
                                    isUnread
                                      ? "text-slate-100 font-semibold"
                                      : "text-slate-400"
                                  }`}
                                >
                                  {sentShort}
                                </span>
                              </div>

                              <button
                                type="button"
                                onClick={(e) => {
                                  e.stopPropagation();
                                  void handleAnalyze(message.id);
                                }}
                                disabled={isAnalyzing}
                                className="hidden lg:inline-flex items-center gap-1.5 mt-1 px-3 py-1.5 rounded-lg bg-emergency-600 text-white text-[10px] font-bold uppercase tracking-wide transition duration-150 hover:bg-emergency-500 group-hover:scale-[1.04] group-hover:shadow-emergency-900/60 active:scale-95 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-emergency-400 focus-visible:ring-offset-2 focus-visible:ring-offset-slate-950 disabled:opacity-70 disabled:cursor-wait disabled:transform-none whitespace-nowrap shadow-lg shadow-emergency-950/40 motion-reduce:transform-none"
                              >
                                {isAnalyzing ? (
                                  <>
                                    <Loader2 className="w-3 h-3 animate-spin" />
                                    Analyzing
                                  </>
                                ) : (
                                  <>
                                    <Search className="w-3 h-3" />
                                    Analyze
                                  </>
                                )}
                              </button>
                            </div>
                          </div>

                          <button
                            type="button"
                            onClick={() => handleAnalyze(message.id)}
                            disabled={isAnalyzing}
                            className="lg:hidden flex min-h-11 w-full items-center justify-center gap-2 border-t border-emergency-800/30 bg-emergency-950/50 px-3 py-2.5 text-[11px] font-bold text-emergency-100 transition-colors hover:bg-emergency-950/70 active:bg-emergency-900/50 disabled:opacity-70 disabled:cursor-wait"
                          >
                            {isAnalyzing ? (
                              <>
                                <Loader2 className="w-3.5 h-3.5 animate-spin" />
                                Running forensic analysis…
                              </>
                            ) : (
                              <>
                                <Search className="w-3.5 h-3.5" />
                                Run forensic analysis on this message
                              </>
                            )}
                          </button>
                        </li>
                      );
                    })}
                  </ul>
                )}
              </div>
            </section>
          </div>
        </section>
      )}

      <div className="p-4 rounded-xl bg-slate-950/70 border border-slate-800 text-[11px] text-slate-500 leading-5">
        {isDemoMode ? (
          <>
            <strong className="text-blue-300">SIH Demo Mode:</strong> This demo mailbox contains
            sanitized sample emails for forensic demonstration. No real Gmail account is connected.
            All data is clearly marked as demonstration content and does not represent real threats or victims.
          </>
        ) : (
          <>
            Cyber Sakhi requests Gmail access only for the forensic workflow. The
            integration uses read-only Gmail access and does not send, modify, or
            delete messages. All analysis runs locally against the raw email
            source fetched from your account.
          </>
        )}
      </div>
    </div>
  );
}
