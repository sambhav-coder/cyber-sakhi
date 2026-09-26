"use client";

import React, { useCallback, useEffect, useRef, useState } from "react";
import { clsx } from "clsx";
import {
  AlertTriangle,
  ChevronLeft,
  ChevronRight,
  Download,
  Eye,
  EyeOff,
  FileLock2,
  FileText,
  KeyRound,
  LockKeyhole,
  ShieldCheck,
  X,
} from "lucide-react";

interface ReportRow {
  id: string;
  caseNumber: string;
  createdAt: string;
  state: string | null;
  district: string | null;
  threatCategory: string | null;
  riskLevel: string | null;
  govStatus: string;
  caseSource: string | null;
  assignedOfficer: string | null;
}

interface Dossier {
  reportId: string;
  version: number;
  generatedAt: string;
  passwordEnforced: boolean;
  sealSetAt: string | null;
  case: {
    id: string;
    caseNumber: string;
    title: string | null;
    description: string | null;
    status: string;
    govStatus: string;
    severity: string | null;
    riskLevel: string | null;
    threatType: string | null;
    threatCategory: string | null;
    stateCode: string | null;
    districtCode: string | null;
    subDivision: string | null;
    locality: string | null;
    createdAt: string;
    updatedAt: string;
    incidentDate: string | null;
    incidentChannel: string | null;
    lossAmount: string | null;
    currency: string | null;
    caseSource: string | null;
    assignedOfficer: { officerId: string; officerCode: string | null; fullName: string | null } | null;
  };
  assignments: Array<{ officer_id: string | null; assignment_type: string; reason: string | null; created_at: string }>;
  investigations: Array<{
    id: string;
    subject: string | null;
    sender: string | null;
    riskScore: number | null;
    verdict: string | null;
    createdAt: string;
    analysisSummary: {
      authentication?: { spf?: string; dkim?: string; dmarc?: string };
      senderDomain?: string | null;
      originatingIP?: string | null;
      smtpHops: number;
      indicatorsCount: number;
      threatScore: number | null;
      threatLevel: string | null;
      senderSpoofingDetected?: boolean | null;
    };
  }>;
  indicators: Array<{ id: string; type: string; value: string; created_at: string }>;
  notes: Array<{ id: string; officerId: string; content: string; createdAt: string; updatedAt: string; isEdited: boolean }>;
  evidence: Array<{
    id: string;
    evidenceCode: string;
    title: string;
    category: string | null;
    mimeType: string | null;
    fileSize: number | null;
    sha256: string | null;
    createdAt: string;
    source: string | null;
    blockchainAnchorId: string | null;
  }>;
  evidenceCount: number;
  timeline: Array<{ at: string; label: string; detail: string | null; actor: string | null; type: string }>;
}

function fmtDate(v: string | null): string {
  if (!v) return "—";
  const t = Date.parse(v);
  return Number.isNaN(t) ? "—" : new Date(t).toLocaleString("en-IN");
}

function fmtDay(v: string | null): string {
  if (!v) return "—";
  const t = Date.parse(v);
  return Number.isNaN(t) ? "—" : new Date(t).toLocaleDateString("en-IN");
}

export function GovReportsArchive({ officerName, officerCode }: { officerName: string; officerCode: string }) {
  const [rows, setRows] = useState<ReportRow[] | null>(null);
  const [total, setTotal] = useState(0);
  const [listGeneratedAt, setListGeneratedAt] = useState<string | null>(null);
  const [listLoading, setListLoading] = useState(true);
  const [listError, setListError] = useState<string | null>(null);

  const [focus, setFocus] = useState(0);
  const [selected, setSelected] = useState<ReportRow | null>(null);
  const [dossier, setDossier] = useState<Dossier | null>(null);
  const [unlocking, setUnlocking] = useState(false);
  const [unlockError, setUnlockError] = useState<string | null>(null);
  const [password, setPassword] = useState("");
  const [showPw, setShowPw] = useState(false);
  const [knownProtected, setKnownProtected] = useState<Record<string, boolean>>({});

  const [sealPw, setSealPw] = useState("");
  const [sealBusy, setSealBusy] = useState(false);
  const [sealMsg, setSealMsg] = useState<{ ok: boolean; text: string } | null>(null);
  const [exporting, setExporting] = useState<"CSV" | "PDF" | null>(null);
  const [exportError, setExportError] = useState<string | null>(null);

  const dialogRef = useRef<HTMLDivElement>(null);

  const loadList = useCallback(async () => {
    setListLoading(true);
    setListError(null);
    try {
      const res = await fetch("/gov/api/reports", { cache: "no-store" });
      if (!res.ok) {
        if (res.status === 401) throw new Error("Session expired — please sign in again.");
        if (res.status === 403) throw new Error("Your role cannot generate reports.");
        throw new Error(`Unable to load reports (${res.status}).`);
      }
      const data = (await res.json()) as { rows: ReportRow[]; total: number; generatedAt: string };
      setRows(Array.isArray(data.rows) ? data.rows : []);
      setTotal(typeof data.total === "number" ? data.total : 0);
      setListGeneratedAt(data.generatedAt ?? null);
      setFocus(0);
    } catch (e) {
      setListError(e instanceof Error ? e.message : "Unable to load reports.");
      setRows(null);
    } finally {
      setListLoading(false);
    }
  }, []);

  useEffect(() => {
    void loadList();
  }, [loadList]);

  // Lock body scroll while the sealed-report dialog is open; Esc closes.
  useEffect(() => {
    if (!selected) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") closeDialog();
    };
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selected]);

  const closeDialog = useCallback(() => {
    setSelected(null);
    setDossier(null);
    setUnlockError(null);
    setPassword("");
    setShowPw(false);
    setSealPw("");
    setSealMsg(null);
    setExportError(null);
  }, []);

  const openReport = useCallback((row: ReportRow) => {
    setSelected(row);
    setDossier(null);
    setUnlockError(null);
    setPassword("");
    setShowPw(false);
    setSealPw("");
    setSealMsg(null);
    setExportError(null);
  }, []);

  const unseal = useCallback(async () => {
    if (!selected || unlocking) return;
    setUnlocking(true);
    setUnlockError(null);
    try {
      const res = await fetch("/gov/api/reports/unseal", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ caseId: selected.id, ...(password ? { password } : {}) }),
      });
      const body = (await res.json().catch(() => null)) as (Dossier & { error?: { message?: string } }) | null;
      if (!res.ok) {
        if (res.status === 429) {
          setUnlockError(body?.error?.message ?? "Too many unlock attempts. Please wait and retry.");
        } else if (res.status === 401) {
          setUnlockError("Session expired — please sign in again.");
        } else {
          // Deliberately generic: a wrong password and a missing grant share
          // one message so failures confirm nothing about the seal.
          setUnlockError("Unable to unseal this report. Check the report password and try again.");
        }
        return;
      }
      if (!body || (body as { error?: unknown }).error) {
        setUnlockError("Unable to unseal this report. Check the connection and try again.");
        return;
      }
      const data = body as Dossier;
      setDossier(data);
      setKnownProtected((m) => ({ ...m, [selected.id]: data.passwordEnforced }));
    } catch {
      setUnlockError("Unable to unseal this report. Check the connection and try again.");
    } finally {
      setUnlocking(false);
    }
  }, [selected, password, unlocking]);

  const setSeal = useCallback(async () => {
    if (!selected || sealBusy || !sealPw) return;
    setSealBusy(true);
    setSealMsg(null);
    try {
      const res = await fetch("/gov/api/reports/seal", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ caseId: selected.id, password: sealPw }),
      });
      const data = (await res.json().catch(() => null)) as { error?: { message?: string } } | null;
      if (!res.ok) {
        setSealMsg({
          ok: false,
          text:
            res.status === 503
              ? "Password protection is not provisioned yet — the report stays under access control."
              : (data?.error?.message ?? "Unable to set the report password."),
        });
        return;
      }
      setSealMsg({ ok: true, text: "Report password set. Future opens of this report will require it." });
      setKnownProtected((m) => ({ ...m, [selected.id]: true }));
      setSealPw("");
    } catch {
      setSealMsg({ ok: false, text: "Unable to set the report password." });
    } finally {
      setSealBusy(false);
    }
  }, [selected, sealPw, sealBusy]);

  const exportDataset = useCallback(async (format: "CSV" | "PDF") => {
    if (exporting) return;
    setExporting(format);
    setExportError(null);
    try {
      const res = await fetch("/gov/api/reports", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ format, filters: {} }),
      });
      if (!res.ok) throw new Error(`Export failed (${res.status}).`);
      const blob = await res.blob();
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = `cyber-sakhi-cases.${format === "PDF" ? "pdf" : "csv"}`;
      document.body.appendChild(a);
      a.click();
      a.remove();
      URL.revokeObjectURL(url);
    } catch (e) {
      setExportError(e instanceof Error ? e.message : "Export failed.");
    } finally {
      setExporting(null);
    }
  }, [exporting]);

  const count = rows?.length ?? 0;
  const current = rows?.[focus] ?? null;
  const prev = useCallback(() => setFocus((f) => Math.max(0, f - 1)), []);
  const next = useCallback(() => setFocus((f) => (rows ? Math.min(rows.length - 1, f + 1) : f)), [rows]);

  return (
    <div className="space-y-6">
      {/* Shelf */}
      <section
        aria-label="Report archive shelf"
        aria-roledescription="carousel"
        aria-live="polite"
        tabIndex={0}
        onKeyDown={(e) => {
          const tag = (e.target as HTMLElement)?.tagName;
          if (tag === "INPUT" || tag === "TEXTAREA" || tag === "SELECT") return;
          if (e.key === "ArrowLeft") prev();
          if (e.key === "ArrowRight") next();
        }}
        className="gov-panel p-5 outline-none focus-visible:ring-2 focus-visible:ring-teal-500 sm:p-8"
      >
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <h2 className="text-xl font-extrabold tracking-tight text-slate-100">Forensic Report Archive</h2>
            <p className="mt-1 max-w-2xl text-xs leading-relaxed text-slate-400">
              Sealed per-case dossiers. Nothing inside a report is fetched or shown until you unseal it —
              every open and every failed unlock is audited. Use ← → arrow keys to browse.
            </p>
          </div>
          {rows && count > 0 && (
            <p className="rounded-full border border-slate-700/60 px-3 py-1 font-mono text-[11px] text-slate-400" aria-label={`Report ${focus + 1} of ${count}`}>
              Report {String(focus + 1).padStart(2, "0")} of {String(count).padStart(2, "0")}
            </p>
          )}
        </div>

        {listLoading ? (
          <div className="mx-auto mt-6 max-w-md animate-pulse rounded-xl bg-slate-50 p-8 shadow-2xl" aria-label="Loading reports">
            <div className="h-5 w-2/3 rounded bg-slate-200" />
            <div className="mt-3 h-3 w-1/2 rounded bg-slate-200" />
            <div className="mt-6 space-y-2">
              <div className="h-3 rounded bg-slate-200" />
              <div className="h-3 w-5/6 rounded bg-slate-200" />
              <div className="h-3 w-4/6 rounded bg-slate-200" />
            </div>
          </div>
        ) : listError ? (
          <div className="mx-auto mt-6 max-w-md rounded-xl border border-rose-500/40 bg-rose-500/10 p-6 text-center" role="alert">
            <AlertTriangle className="mx-auto h-6 w-6 text-rose-300" />
            <p className="mt-2 text-sm font-semibold text-rose-200">{listError}</p>
            <button
              type="button"
              onClick={() => void loadList()}
              className="mt-3 rounded-lg border border-rose-400/40 px-4 py-1.5 text-xs font-bold text-rose-200 hover:bg-rose-400/10"
            >
              Retry
            </button>
          </div>
        ) : count === 0 ? (
          <div className="mx-auto mt-6 max-w-md rounded-xl border border-dashed border-slate-700/60 bg-slate-900/30 p-8 text-center">
            <FileText className="mx-auto h-8 w-8 text-slate-600" />
            <p className="mt-3 text-sm font-bold text-slate-200">No reports in scope</p>
            <p className="mt-1 text-xs leading-relaxed text-slate-500">
              Reports are generated per scoped case. New investigations in your jurisdiction will appear here.
            </p>
          </div>
        ) : current && (
          <div className="mt-6 flex items-center gap-2 sm:gap-4">
            <button
              type="button"
              onClick={prev}
              disabled={focus === 0}
              aria-label="Previous report"
              className="shrink-0 rounded-full border border-slate-700/60 p-2.5 text-slate-300 transition hover:border-teal-400/40 hover:text-teal-300 disabled:cursor-not-allowed disabled:opacity-30"
            >
              <ChevronLeft className="h-5 w-5" />
            </button>

            {/* Floating letter card */}
            <button
              type="button"
              onClick={() => openReport(current)}
              aria-label={`Open sealed report for case ${current.caseNumber}`}
              className="group mx-auto block w-full max-w-md cursor-pointer rounded-xl bg-slate-50 p-7 text-left shadow-[0_18px_50px_-12px_rgba(0,0,0,0.65)] ring-1 ring-slate-900/10 transition hover:-translate-y-1 hover:shadow-[0_26px_60px_-12px_rgba(0,0,0,0.7)] focus:outline-none focus-visible:ring-2 focus-visible:ring-teal-500"
            >
              <div className="flex items-start justify-between gap-3 border-b-2 border-slate-900/80 pb-3">
                <div>
                  <p className="font-mono text-[10px] font-bold uppercase tracking-[0.22em] text-slate-500">
                    Cyber-Sakhi · Forensic Report
                  </p>
                  <p className="mt-1 font-mono text-lg font-bold text-slate-900">{current.caseNumber}</p>
                </div>
                <span
                  className={clsx(
                    "inline-flex shrink-0 items-center gap-1.5 rounded-full px-2.5 py-1 font-mono text-[10px] font-bold uppercase tracking-widest",
                    knownProtected[current.id]
                      ? "bg-amber-100 text-amber-900"
                      : "bg-slate-900 text-slate-100",
                  )}
                >
                  <FileLock2 className="h-3.5 w-3.5" />
                  {knownProtected[current.id] ? "Password sealed" : "Sealed"}
                </span>
              </div>
              <dl className="mt-4 grid grid-cols-2 gap-x-4 gap-y-2 text-xs text-slate-700">
                <div><dt className="font-mono text-[10px] uppercase tracking-wider text-slate-500">Type</dt><dd className="font-semibold">Case dossier</dd></div>
                <div><dt className="font-mono text-[10px] uppercase tracking-wider text-slate-500">Status</dt><dd className="font-semibold">{current.govStatus}</dd></div>
                <div><dt className="font-mono text-[10px] uppercase tracking-wider text-slate-500">Threat</dt><dd className="font-semibold">{current.threatCategory ?? "Unclassified"}</dd></div>
                <div><dt className="font-mono text-[10px] uppercase tracking-wider text-slate-500">Risk</dt><dd className="font-semibold">{current.riskLevel ?? "Unset"}</dd></div>
                <div><dt className="font-mono text-[10px] uppercase tracking-wider text-slate-500">Opened</dt><dd className="font-semibold">{fmtDay(current.createdAt)}</dd></div>
                <div><dt className="font-mono text-[10px] uppercase tracking-wider text-slate-500">Jurisdiction</dt><dd className="font-semibold">{current.state ?? "—"} / {current.district ?? "—"}</dd></div>
              </dl>
              <p className="mt-5 text-center font-mono text-[11px] font-bold uppercase tracking-[0.2em] text-teal-700 group-hover:text-teal-900">
                ▸ Click to unseal
              </p>
            </button>

            <button
              type="button"
              onClick={next}
              disabled={focus >= count - 1}
              aria-label="Next report"
              className="shrink-0 rounded-full border border-slate-700/60 p-2.5 text-slate-300 transition hover:border-teal-400/40 hover:text-teal-300 disabled:cursor-not-allowed disabled:opacity-30"
            >
              <ChevronRight className="h-5 w-5" />
            </button>
          </div>
        )}

        {rows && count > 0 && listGeneratedAt && (
          <p className="mt-4 text-center font-mono text-[10px] text-slate-600">
            {total} scoped report{total === 1 ? "" : "s"} · list generated {fmtDate(listGeneratedAt)} · source: live scoped query
          </p>
        )}
      </section>

      {/* Sealed dialog + dossier */}
      {selected && (
        <div className="fixed inset-0 z-50 overflow-y-auto bg-black/70 p-4 backdrop-blur-sm" onClick={closeDialog}>
          <div
            ref={dialogRef}
            role="dialog"
            aria-modal="true"
            aria-label={`Sealed report for case ${selected.caseNumber}`}
            onClick={(e) => e.stopPropagation()}
            className="mx-auto my-6 w-full max-w-3xl"
          >
            {!dossier ? (
              <div className="rounded-2xl border border-slate-700/60 bg-[#0a1222] p-6 sm:p-8">
                <div className="flex items-start justify-between gap-3">
                  <div className="flex items-center gap-3">
                    <span className="flex h-12 w-12 items-center justify-center rounded-xl border border-amber-400/30 bg-amber-400/10 text-amber-300">
                      <LockKeyhole className="h-6 w-6" />
                    </span>
                    <div>
                      <h3 className="text-base font-extrabold text-slate-100">Sealed report</h3>
                      <p className="font-mono text-xs text-slate-400">{selected.caseNumber} · contents hidden until unsealed</p>
                    </div>
                  </div>
                  <button type="button" onClick={closeDialog} aria-label="Close sealed report" className="rounded-lg p-1.5 text-slate-400 hover:bg-slate-800 hover:text-white">
                    <X className="h-5 w-5" />
                  </button>
                </div>

                <div className="mt-5 rounded-xl border border-slate-800 bg-slate-900/50 p-4 text-xs leading-relaxed text-slate-400">
                  <p className="flex items-start gap-2">
                    <ShieldCheck className="mt-0.5 h-4 w-4 shrink-0 text-teal-300" />
                    <span>
                      Unsealing re-checks your session, report permission, and jurisdiction scope on the server,
                      and the attempt is written to the audit ledger. If a report password was set for this case,
                      enter it below — otherwise leave it blank.
                    </span>
                  </p>
                </div>

                <label className="mt-4 block text-xs font-semibold text-slate-300">
                  Report password (only if one was set for this case)
                  <span className="mt-1.5 flex gap-2">
                    <input
                      type={showPw ? "text" : "password"}
                      value={password}
                      onChange={(e) => setPassword(e.target.value)}
                      onKeyDown={(e) => {
                        if (e.key === "Enter") void unseal();
                      }}
                      autoComplete="off"
                      autoFocus
                      placeholder="Leave blank if none was set"
                      className="min-w-0 flex-1 rounded-lg border border-slate-700/60 bg-slate-950 px-3 py-2 text-sm text-slate-100 placeholder:text-slate-600"
                    />
                    <button
                      type="button"
                      onClick={() => setShowPw((v) => !v)}
                      aria-label={showPw ? "Hide password" : "Show password"}
                      className="rounded-lg border border-slate-700/60 px-3 text-slate-300 hover:border-teal-400/40 hover:text-teal-300"
                    >
                      {showPw ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                    </button>
                  </span>
                </label>

                {unlockError && (
                  <p className="mt-3 rounded-lg border border-rose-400/30 bg-rose-400/10 px-3 py-2 text-xs font-semibold text-rose-200" role="alert">
                    {unlockError}
                  </p>
                )}

                <div className="mt-5 flex flex-wrap gap-2">
                  <button
                    type="button"
                    onClick={() => void unseal()}
                    disabled={unlocking}
                    className="rounded-lg bg-teal-500 px-5 py-2 text-sm font-bold text-slate-950 transition hover:bg-teal-400 disabled:opacity-50"
                  >
                    {unlocking ? "Unsealing…" : "Unseal report"}
                  </button>
                  <button
                    type="button"
                    onClick={closeDialog}
                    className="rounded-lg border border-slate-700/60 px-5 py-2 text-sm font-semibold text-slate-300 hover:border-slate-500"
                  >
                    Cancel
                  </button>
                </div>
              </div>
            ) : (
              <article className="overflow-hidden rounded-2xl bg-slate-50 text-slate-900 shadow-2xl">
                <header className="border-b-4 border-double border-slate-900/70 px-6 py-6 sm:px-10">
                  <div className="flex flex-wrap items-start justify-between gap-3">
                    <div>
                      <p className="font-mono text-[10px] font-bold uppercase tracking-[0.24em] text-slate-500">
                        Cyber-Sakhi · Digital Forensic Report
                      </p>
                      <h3 className="mt-1 font-mono text-2xl font-bold">{dossier.reportId}</h3>
                      <p className="mt-1 font-mono text-xs text-slate-600">
                        Case {dossier.case.caseNumber} · Version {dossier.version} · Generated {fmtDate(dossier.generatedAt)}
                      </p>
                    </div>
                    <button type="button" onClick={closeDialog} aria-label="Close report" className="rounded-lg border border-slate-300 p-1.5 text-slate-600 hover:bg-slate-200">
                      <X className="h-5 w-5" />
                    </button>
                  </div>
                  <dl className="mt-4 grid grid-cols-2 gap-2 text-xs sm:grid-cols-4">
                    <div><dt className="font-mono text-[10px] uppercase text-slate-500">Prepared for</dt><dd className="font-semibold">{officerName} ({officerCode})</dd></div>
                    <div><dt className="font-mono text-[10px] uppercase text-slate-500">Protection</dt><dd className="font-semibold">{dossier.passwordEnforced ? "Password sealed" : "Access-controlled"}</dd></div>
                    <div><dt className="font-mono text-[10px] uppercase text-slate-500">Classification</dt><dd className="font-semibold">Restricted · audit-logged</dd></div>
                    <div><dt className="font-mono text-[10px] uppercase text-slate-500">Integrity note</dt><dd className="font-semibold">Hashes below are observed values</dd></div>
                  </dl>
                </header>

                <div className="space-y-7 px-6 py-7 sm:px-10">
                  <DossierSection n="1" title="Executive summary (observed facts)">
                    <p className="text-sm leading-relaxed">
                      Case <strong className="font-mono">{dossier.case.caseNumber}</strong> is recorded as{" "}
                      <strong>{dossier.case.govStatus}</strong> with risk level{" "}
                      <strong>{dossier.case.riskLevel ?? "Unset"}</strong> and threat category{" "}
                      <strong>{dossier.case.threatCategory ?? "Unclassified"}</strong>. The dossier below
                      aggregates {dossier.investigations.length} email-forensic examination(s),{" "}
                      {dossier.indicators.length} correlated indicator(s), {dossier.evidenceCount} evidence
                      item(s), {dossier.notes.length} analyst note(s), and a {dossier.timeline.length}-event
                      case timeline. Jurisdiction of record: {dossier.case.stateCode ?? "—"}/
                      {dossier.case.districtCode ?? "—"} (officer-entered, unverified).
                    </p>
                  </DossierSection>

                  <DossierSection n="2" title="Incident details (observed facts)">
                    <MetaTable
                      rows={[
                        ["Title", dossier.case.title ?? "—"],
                        ["Description", dossier.case.description ?? "—"],
                        ["Status", `${dossier.case.govStatus} / ${dossier.case.status}`],
                        ["Severity / Risk", `${dossier.case.severity ?? "—"} / ${dossier.case.riskLevel ?? "Unset"}`],
                        ["Threat", `${dossier.case.threatType ?? "—"} / ${dossier.case.threatCategory ?? "—"}`],
                        ["Incident date", fmtDay(dossier.case.incidentDate)],
                        ["Channel", dossier.case.incidentChannel ?? "—"],
                        ["Reported loss", dossier.case.lossAmount ? `${dossier.case.lossAmount} ${dossier.case.currency ?? ""}`.trim() : "—"],
                        ["Source", dossier.case.caseSource ?? "—"],
                        ["Locality", [dossier.case.subDivision, dossier.case.locality].filter(Boolean).join(", ") || "—"],
                        ["Assigned", dossier.case.assignedOfficer ? `${dossier.case.assignedOfficer.fullName ?? "—"} (${dossier.case.assignedOfficer.officerCode ?? "—"})` : "Unassigned"],
                        ["Opened", fmtDate(dossier.case.createdAt)],
                        ["Last updated", fmtDate(dossier.case.updatedAt)],
                      ]}
                    />
                  </DossierSection>

                  <DossierSection n="3" title="Email forensic findings (system analysis of observed mail)">
                    {dossier.investigations.length === 0 ? (
                      <EmptyNote text="No email-forensic examinations are attached to this case." />
                    ) : (
                      dossier.investigations.map((inv) => (
                        <div key={inv.id} className="mb-4 rounded-lg border border-slate-300 bg-white p-4">
                          <p className="font-mono text-xs font-bold">Subject: {inv.sender ? inv.subject ?? "(none)" : inv.subject ?? "(none)"}</p>
                          <p className="mt-1 break-all font-mono text-xs text-slate-600">From: {inv.sender ?? "—"}</p>
                          <MetaTable
                            rows={[
                              ["Verdict (system analysis)", inv.verdict ?? "—"],
                              ["Risk score (system analysis)", inv.riskScore === null ? "—" : String(inv.riskScore)],
                              ["Threat (system analysis)", `${inv.analysisSummary.threatLevel ?? "—"}${inv.analysisSummary.threatScore === null ? "" : ` (${inv.analysisSummary.threatScore})`}`],
                              ["Sender domain", inv.analysisSummary.senderDomain ?? "—"],
                              ["SPF / DKIM / DMARC", [
                                inv.analysisSummary.authentication?.spf,
                                inv.analysisSummary.authentication?.dkim,
                                inv.analysisSummary.authentication?.dmarc,
                              ].map((v) => v ?? "?").join(" / ")],
                              ["Originating IP", inv.analysisSummary.originatingIP ?? "—"],
                              ["SMTP hops observed", String(inv.analysisSummary.smtpHops)],
                              ["Spoofing detected", inv.analysisSummary.senderSpoofingDetected === null || inv.analysisSummary.senderSpoofingDetected === undefined ? "—" : inv.analysisSummary.senderSpoofingDetected ? "Yes (system analysis)" : "No (system analysis)"],
                              ["Examined", fmtDate(inv.createdAt)],
                            ]}
                          />
                        </div>
                      ))
                    )}
                  </DossierSection>

                  <DossierSection n="4" title="Indicator correlations (observed)">
                    {dossier.indicators.length === 0 ? (
                      <EmptyNote text="No indicators are correlated to this case." />
                    ) : (
                      <table className="w-full text-left text-xs">
                        <thead><tr className="border-b border-slate-300 font-mono text-[10px] uppercase text-slate-500"><th className="py-1.5 pr-2">Type</th><th className="py-1.5 pr-2">Value</th><th className="py-1.5 text-right">First seen</th></tr></thead>
                        <tbody>
                          {dossier.indicators.map((i) => (
                            <tr key={i.id} className="border-b border-slate-200">
                              <td className="py-1.5 pr-2 font-mono font-bold">{i.type}</td>
                              <td className="max-w-56 truncate py-1.5 pr-2 font-mono" title={i.value}>{i.value}</td>
                              <td className="py-1.5 text-right font-mono">{fmtDay(i.created_at)}</td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    )}
                  </DossierSection>

                  <DossierSection n="5" title="Evidence summary (observed hashes)">
                    {dossier.evidence.length === 0 ? (
                      <EmptyNote text="No evidence items are attached to this case." />
                    ) : (
                      dossier.evidence.map((e) => (
                        <div key={e.id} className="mb-3 rounded-lg border border-slate-300 bg-white p-3 font-mono text-xs">
                          <p className="font-bold text-slate-900">{e.evidenceCode} · {e.title}</p>
                          <p className="mt-1 break-all text-slate-600">SHA-256: {e.sha256 ?? "not recorded"}</p>
                          <p className="mt-0.5 text-slate-500">
                            {e.category ?? "—"} · {e.mimeType ?? "—"}{e.fileSize === null ? "" : ` · ${e.fileSize} bytes`} · {fmtDay(e.createdAt)}
                            {e.blockchainAnchorId ? ` · anchored (${e.blockchainAnchorId.slice(0, 12)}…)` : " · not blockchain-anchored"}
                          </p>
                        </div>
                      ))
                    )}
                    <p className="mt-2 text-xs italic text-slate-600">
                      Hashes above are observed values, not a verification verdict. Full chain-of-custody
                      verification lives in the Evidence module.
                    </p>
                  </DossierSection>

                  <DossierSection n="6" title="Investigation timeline (observed events)">
                    {dossier.timeline.length === 0 ? (
                      <EmptyNote text="No timeline events recorded." />
                    ) : (
                      <ol className="relative ml-2 space-y-3 border-l-2 border-slate-300 pl-4">
                        {dossier.timeline.slice(0, 40).map((t, i) => (
                          <li key={i} className="text-xs">
                            <p className="font-bold">{t.label}</p>
                            <p className="font-mono text-[11px] text-slate-500">{fmtDate(t.at)}{t.actor ? ` · ${t.actor}` : ""}</p>
                            {t.detail && <p className="mt-0.5 line-clamp-3 text-slate-700">{t.detail}</p>}
                          </li>
                        ))}
                      </ol>
                    )}
                    {dossier.timeline.length > 40 && (
                      <p className="mt-2 text-xs italic text-slate-500">Showing the 40 most recent of {dossier.timeline.length} events.</p>
                    )}
                  </DossierSection>

                  <DossierSection n="7" title="Analyst notes (interpretation, not fact)">
                    {dossier.notes.length === 0 ? (
                      <EmptyNote text="No analyst notes on this case." />
                    ) : (
                      dossier.notes.map((n) => (
                        <div key={n.id} className="mb-3 rounded-lg bg-amber-50 p-3 text-xs ring-1 ring-amber-200">
                          <p className="text-slate-800">{n.content}</p>
                          <p className="mt-1 font-mono text-[11px] text-slate-500">{fmtDate(n.createdAt)}{n.isEdited ? " · edited" : ""}</p>
                        </div>
                      ))
                    )}
                  </DossierSection>

                  <DossierSection n="8" title="Findings, limitations, and integrity">
                    <ul className="list-disc space-y-1.5 pl-5 text-xs leading-relaxed text-slate-700">
                      <li><strong>Observed facts:</strong> case metadata, timeline events, evidence hashes, indicator values.</li>
                      <li><strong>System analysis:</strong> email verdicts, risk/threat scores, spoofing determinations — produced by automated examination, not human findings.</li>
                      <li><strong>External intelligence:</strong> none connected; no external feed contributed to this report.</li>
                      <li><strong>Unverified:</strong> jurisdiction labels and victim-provided details are officer-entered and unverified.</li>
                      <li><strong>Excluded:</strong> victim PII is never included in reports; chain-of-custody verification must be performed in the Evidence module.</li>
                      <li><strong>Audit:</strong> this unsealing was written to the audit ledger; exports are separately audited.</li>
                    </ul>
                  </DossierSection>

                  <div className="flex flex-wrap items-center gap-2 border-t border-slate-300 pt-4">
                    <button
                      type="button"
                      onClick={() => void exportDataset("CSV")}
                      disabled={exporting !== null}
                      className="inline-flex items-center gap-1.5 rounded-lg bg-slate-900 px-4 py-2 text-xs font-bold text-white hover:bg-slate-700 disabled:opacity-50"
                    >
                      <Download className="h-3.5 w-3.5" /> {exporting === "CSV" ? "Exporting…" : "Export CSV"}
                    </button>
                    <button
                      type="button"
                      onClick={() => void exportDataset("PDF")}
                      disabled={exporting !== null}
                      className="inline-flex items-center gap-1.5 rounded-lg border border-slate-900 px-4 py-2 text-xs font-bold text-slate-900 hover:bg-slate-200 disabled:opacity-50"
                    >
                      <Download className="h-3.5 w-3.5" /> {exporting === "PDF" ? "Exporting…" : "Export PDF"}
                    </button>
                    {exportError && <p className="text-xs font-semibold text-red-700" role="alert">{exportError}</p>}
                    <p className="w-full font-mono text-[10px] text-slate-500">Exports cover your scoped dataset and are audit-logged.</p>
                  </div>

                  <details className="rounded-lg border border-slate-300 bg-white p-4">
                    <summary className="cursor-pointer text-xs font-bold text-slate-800">
                      <KeyRound className="mr-1.5 inline h-3.5 w-3.5" />
                      Set a report password for this case
                    </summary>
                    <p className="mt-2 text-xs leading-relaxed text-slate-600">
                      Protected by the central password policy (minimum 12 characters, three character
                      classes). Stored as a bcrypt hash; future opens will require it. This does not
                      encrypt stored case data — it gates report access with an audited, rate-limited check.
                    </p>
                    <div className="mt-2 flex gap-2">
                      <input
                        type="password"
                        value={sealPw}
                        onChange={(e) => setSealPw(e.target.value)}
                        autoComplete="new-password"
                        placeholder="New report password"
                        className="min-w-0 flex-1 rounded-lg border border-slate-300 px-3 py-1.5 text-sm text-slate-900"
                      />
                      <button
                        type="button"
                        onClick={() => void setSeal()}
                        disabled={sealBusy || !sealPw}
                        className="rounded-lg bg-slate-900 px-4 py-1.5 text-xs font-bold text-white disabled:opacity-50"
                      >
                        {sealBusy ? "Setting…" : "Set"}
                      </button>
                    </div>
                    {sealMsg && (
                      <p className={clsx("mt-2 text-xs font-semibold", sealMsg.ok ? "text-emerald-700" : "text-red-700")} role="status">
                        {sealMsg.text}
                      </p>
                    )}
                  </details>

                  <button
                    type="button"
                    onClick={closeDialog}
                    className="w-full rounded-lg border border-slate-300 py-2 text-xs font-bold text-slate-700 hover:bg-slate-200"
                  >
                    Close report
                  </button>
                </div>
              </article>
            )}
          </div>
        </div>
      )}
    </div>
  );
}

function DossierSection({ n, title, children }: { n: string; title: string; children: React.ReactNode }) {
  return (
    <section aria-label={title}>
      <h4 className="border-b border-slate-300 pb-1 font-mono text-xs font-bold uppercase tracking-[0.18em] text-slate-700">
        §{n} · {title}
      </h4>
      <div className="mt-3">{children}</div>
    </section>
  );
}

function MetaTable({ rows }: { rows: Array<[string, string]> }) {
  return (
    <dl className="mt-2 grid grid-cols-1 gap-x-6 gap-y-1.5 text-xs sm:grid-cols-2">
      {rows.map(([k, v]) => (
        <div key={k} className="flex gap-2">
          <dt className="w-36 shrink-0 font-mono text-[11px] uppercase text-slate-500">{k}</dt>
          <dd className="min-w-0 break-words font-medium text-slate-800">{v}</dd>
        </div>
      ))}
    </dl>
  );
}

function EmptyNote({ text }: { text: string }) {
  return <p className="rounded-lg bg-slate-100 px-3 py-2 text-xs italic text-slate-500">{text}</p>;
}
