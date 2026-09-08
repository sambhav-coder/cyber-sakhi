"use client";

import React, { useCallback, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { useSession } from "next-auth/react";
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
}

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

export default function GmailForensicsPage() {
  const { data: session, status: sessionStatus } = useSession();
  const [currentUserId, setCurrentUserId] = useState<string | null>(null);
  
  const [messages, setMessages] = useState<EnrichedGmailMessage[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [isConnected, setIsConnected] = useState<boolean | null>(null);
  const [analyzingId, setAnalyzingId] = useState<string | null>(null);

  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [starredLocal, setStarredLocal] = useState<Set<string>>(new Set());
  const [sidebarFolder, setSidebarFolder] = useState<string>("INBOX");
  const [searchQuery, setSearchQuery] = useState<string>("");

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
      const response = await fetch("/api/gmail/messages", {
        method: "GET",
        cache: "no-store",
      });

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
            : "Unable to load Gmail messages. Please connect Gmail first."
        );

        return;
      }

      const gmailData = data as GmailListResponse;

      setMessages(gmailData.messages || []);
      setIsConnected(true);

      const allIds = new Set((gmailData.messages || []).map((m) => m.id));
      setSelectedIds((prev) => {
        const next = new Set<string>();
        for (const id of prev) if (allIds.has(id)) next.add(id);
        return next;
      });
    } catch {
      setError(
        "Unable to connect to Cyber Sakhi Gmail service. Please try again."
      );
      setIsConnected(false);
      setMessages([]);
    } finally {
      setIsLoading(false);
    }
  }, [session?.user?.id]);

  useEffect(() => {
    if (sessionStatus === "authenticated" && session?.user?.id) {
      loadMessages();
    }
  }, [loadMessages, sessionStatus, session?.user?.id]);

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
  };

  const handleAnalyze = async (messageId: string) => {
    setAnalyzingId(messageId);
    setError(null);

    try {
      const response = await fetch(
        `/api/gmail/analyze/${encodeURIComponent(messageId)}`,
        {
          method: "GET",
          cache: "no-store",
        }
      );

      const data = await response.json();

      if (!response.ok) {
        setError(data.error || "Unable to analyze this Gmail message.");
        return;
      }

      sessionStorage.setItem(
        "cyber_sakhi_gmail_analysis",
        JSON.stringify(data.analysis)
      );

      window.location.href = "/email-forensics";
    } catch {
      setError("Network error while analyzing the Gmail message.");
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

    return list;
  }, [messages, searchQuery, sidebarFolder]);

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
      <div className="flex flex-col sm:flex-row sm:items-start sm:justify-between gap-4">
        <div className="space-y-3">
          <Link
            href="/email-forensics"
            className="inline-flex items-center gap-2 text-xs text-slate-400 hover:text-white transition"
          >
            <ArrowLeft className="w-4 h-4" />
            Back to Email Forensics
          </Link>

          <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-red-950/80 border border-red-500/40 text-red-300 text-xs font-semibold">
            <Mail className="w-3.5 h-3.5" />
            <span>Gmail Investigation</span>
          </div>

          <h1 className="text-2xl sm:text-3xl font-extrabold text-white">
            Analyze a Suspicious Gmail Message
          </h1>

          <p className="text-sm text-slate-300 max-w-2xl">
            Connect your Gmail account and select a message to run Cyber
            Sakhi&apos;s email forensic analysis on its real raw email source.
          </p>
        </div>

        <div className="flex gap-2">
          {isConnected && (
            <button
              type="button"
              onClick={handleDisconnectGmail}
              className="inline-flex items-center gap-2 px-4 py-2 rounded-xl bg-red-950/80 hover:bg-red-900/70 border border-red-700/50 text-red-300 text-xs font-bold transition"
            >
              <ShieldAlert className="w-4 h-4" />
              Disconnect Gmail
            </button>
          )}
          <button
            type="button"
            onClick={loadMessages}
            disabled={isLoading}
            className="inline-flex items-center gap-2 px-4 py-2 rounded-xl bg-slate-800 hover:bg-slate-700 disabled:opacity-50 text-slate-200 text-xs font-bold transition border border-slate-700"
          >
            <RefreshCw
              className={`w-4 h-4 ${isLoading ? "animate-spin" : ""}`}
            />
            Refresh
          </button>
        </div>
      </div>

      <div className="p-5 rounded-2xl bg-slate-900/60 border border-slate-800">
        {isConnected === true ? (
          <div className="flex items-start gap-3">
            <CheckCircle2 className="w-5 h-5 text-emerald-400 shrink-0 mt-0.5" />

            <div>
              <div className="text-sm font-bold text-emerald-300">
                Gmail connected
              </div>

              <div className="text-xs text-slate-400 mt-1">
                Your read-only Gmail connection is available for forensic
                analysis.
              </div>
            </div>
          </div>
        ) : isConnected === false ? (
          <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
            <div className="flex items-start gap-3">
              <ShieldAlert className="w-5 h-5 text-amber-400 shrink-0 mt-0.5" />

              <div>
                <div className="text-sm font-bold text-amber-300">
                  Gmail is not connected
                </div>

                <div className="text-xs text-slate-400 mt-1">
                  Connect Gmail with read-only permission to fetch suspicious
                  messages for analysis.
                </div>
              </div>
            </div>

            <button
              type="button"
              onClick={handleConnectGmail}
              className="inline-flex items-center justify-center gap-2 px-5 py-2.5 rounded-xl bg-purple-600 hover:bg-purple-500 text-white text-xs font-bold transition shadow-lg shadow-purple-950/30"
            >
              <ShieldCheck className="w-4 h-4" />
              Connect Gmail
            </button>
          </div>
        ) : (
          <div className="flex items-center gap-3 text-slate-300">
            <Loader2 className="w-5 h-5 animate-spin text-purple-400" />

            <span className="text-sm">Checking Gmail connection...</span>
          </div>
        )}
      </div>

      {error && (
        <div className="p-4 rounded-xl bg-red-950/70 border border-red-500/40 text-red-200 text-xs flex items-start gap-2">
          <AlertCircle className="w-4 h-4 text-red-400 shrink-0 mt-0.5" />
          <span>{error}</span>
        </div>
      )}

      {isConnected && (
        <div className="rounded-2xl bg-slate-900/60 border border-slate-800 overflow-hidden">
          <div className="flex flex-col lg:flex-row min-h-[640px]">
            <aside className="w-full lg:w-60 shrink-0 border-b lg:border-b-0 lg:border-r border-slate-800/70 bg-slate-950/40 p-3 lg:p-4 space-y-1">
              <button
                type="button"
                className="w-full mb-2 inline-flex items-center justify-center gap-2 px-4 py-2.5 rounded-xl bg-purple-600 hover:bg-purple-500 text-white text-xs font-bold transition shadow-lg shadow-purple-950/30 disabled:opacity-60 cursor-not-allowed"
                disabled
                title="Forensic investigation is read-only — sending is disabled in Cyber Sakhi"
              >
                <FileText className="w-4 h-4" />
                Investigate
              </button>

              <nav className="space-y-0.5 text-xs" aria-label="Mail folders">
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
                        className={`w-full inline-flex items-center gap-2.5 px-3 py-2 rounded-lg transition ${
                          active
                            ? "bg-purple-950/60 text-purple-200 border border-purple-700/40 font-bold"
                            : "text-slate-300 hover:bg-slate-800/60 hover:text-slate-100 border border-transparent"
                        }`}
                      >
                        <Icon
                          className={`w-3.5 h-3.5 shrink-0 ${
                            active ? "text-purple-400" : "text-slate-400"
                          }`}
                        />
                        <span className="flex-1 text-left truncate">
                          {label}
                        </span>
                        {typeof count === "number" && count > 0 ? (
                          <span
                            className={`text-[10px] font-black tracking-wide px-1.5 py-0.5 rounded-md ${
                              active
                                ? "bg-purple-500/30 text-purple-200"
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
                  <div className="px-3 pb-1.5 text-[10px] uppercase tracking-widest text-slate-500 font-bold">
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
              <div className="flex flex-col sm:flex-row gap-2 sm:items-center border-b border-slate-800/70 px-3 lg:px-4 py-2.5 bg-slate-950/30">
                <div className="relative flex-1 min-w-0">
                  <Search className="w-3.5 h-3.5 absolute left-3 top-1/2 -translate-y-1/2 text-slate-500" />
                  <input
                    type="search"
                    value={searchQuery}
                    onChange={(e) => setSearchQuery(e.target.value)}
                    placeholder="Search sender, subject, preview…"
                    className="w-full pl-9 pr-9 py-2 rounded-xl bg-slate-800/80 border border-slate-700 text-xs text-slate-100 placeholder:text-slate-500 focus:outline-none focus:border-purple-500 focus:ring-1 focus:ring-purple-500/30"
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
                      className="w-3.5 h-3.5 rounded accent-purple-500 cursor-pointer"
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
                  <InboxIcon className="w-3.5 h-3.5 text-purple-400" />
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
                <div className="text-[10px] text-slate-500 font-mono">
                  {messages.length} total · read-only forensic access
                </div>
              </div>

              <div className="flex-1 min-h-[320px]">
                {isLoading ? (
                  <div className="flex items-center justify-center py-20 text-slate-400">
                    <Loader2 className="w-5 h-5 animate-spin mr-2 text-purple-400" />
                    <span className="text-xs">Loading Gmail messages…</span>
                  </div>
                ) : visibleCount === 0 ? (
                  <div className="flex flex-col items-center justify-center py-20 text-center px-6">
                    <div className="w-14 h-14 rounded-2xl bg-slate-800/70 border border-slate-700/70 flex items-center justify-center mb-4">
                      {searchQuery ? (
                        <Search className="w-6 h-6 text-slate-500" />
                      ) : (
                        <Mail className="w-6 h-6 text-slate-500" />
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
                        : "No messages to display"}
                    </div>
                    <div className="text-xs text-slate-500 max-w-sm">
                      {searchQuery
                        ? "Try clearing the search box or broadening your terms."
                        : messages.length > 0
                        ? "Try a different folder on the left, or refresh your inbox."
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
                      const isSelected = selectedIds.has(message.id);
                      const isStarred =
                        starredLocal.has(message.id) ||
                        labels.includes("STARRED");
                      const isAnalyzing = analyzingId === message.id;

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
                          className={`group relative cursor-pointer transition-colors ${
                            isSelected
                              ? "bg-purple-950/40"
                              : "hover:bg-slate-800/40"
                          } ${isUnread ? "bg-slate-900/60" : "bg-slate-900/10"}`}
                        >
                          <div
                            className={`grid grid-cols-[auto_auto_minmax(0,1fr)_auto] lg:grid-cols-[auto_auto_minmax(0,1.2fr)_minmax(0,2fr)_auto] items-center gap-2 lg:gap-3 px-3 lg:px-4 py-2.5 ${
                              isUnread
                                ? "shadow-[inset_3px_0_0_0_rgb(168_85_247_/_0.55)]"
                                : ""
                            }`}
                          >
                            <div
                              className="flex items-center py-0.5"
                              onClick={(e) => e.stopPropagation()}
                            >
                              <input
                                type="checkbox"
                                className="w-3.5 h-3.5 rounded accent-purple-500 cursor-pointer"
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

                            <div className="flex lg:flex-col items-center lg:items-end justify-end gap-1 lg:gap-0.5 shrink-0 pl-1 min-w-[60px] lg:min-w-[72px]">
                              <div className="flex items-center gap-1">
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
                                    className="inline-flex items-center lg:hidden w-2 h-2 rounded-full bg-purple-500 shadow shadow-purple-500/50"
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
                                className="hidden lg:inline-flex items-center gap-1.5 mt-1 px-2.5 py-1 rounded-lg text-[10px] font-bold transition border whitespace-nowrap disabled:opacity-70 disabled:cursor-wait bg-purple-950/70 border-purple-700/50 text-purple-200 hover:bg-purple-900/80 hover:border-purple-600/70 hover:text-white shadow-sm shadow-purple-950/40"
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
                            className="lg:hidden w-full flex items-center justify-center gap-2 border-t border-slate-800/40 bg-slate-950/40 px-3 py-2 text-[11px] font-bold text-purple-200 hover:bg-purple-950/50 disabled:opacity-70 disabled:cursor-wait"
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
        </div>
      )}

      <div className="p-4 rounded-xl bg-slate-950/70 border border-slate-800 text-[11px] text-slate-500 leading-5">
        Cyber Sakhi requests Gmail access only for the forensic workflow. The
        integration uses read-only Gmail access and does not send, modify, or
        delete messages. All analysis runs locally against the raw email
        source fetched from your account.
      </div>
    </div>
  );
}
