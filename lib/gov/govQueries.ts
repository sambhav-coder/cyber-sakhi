/**
 * Government scoped data queries (Phases 5-15 query core).
 *
 * Every read in this module is filtered server-side by officer scope:
 *   ALL_INDIA      → no geo constraint (bounded by permission checks)
 *   STATE          → state_code matches
 *   DISTRICT       → state_code + district_code match
 *   ASSIGNED_CASES → case id IN the officer's ACTIVE assignments (fail-closed: none → empty)
 *
 * Additional region/status/threat/risk/time filters are composed on top of the
 * scope. Case-level authorization (permission + scope + assignment + grant +
 * PII/evidence tiers) is layered per-endpoint in the API routes using
 * lib/gov/govAuthorization; this module provides the raw scoped data.
 */

import { getSupabaseServer } from "@/lib/supabaseServer";
import { throwIfError } from "@/lib/db/errors";
import type { GovOfficerRow } from "./govCredentials";
import {
  createGovAssignment,
  listActiveAssignmentsForOfficer,
  listAssignmentsForCase,
  type GovAssignmentRow,
} from "./govAssignments";
import { getCanonicalEvidenceDigest } from "@/lib/evidenceDigest";
import { verifyAnchorOnChain } from "@/lib/blockchain/anchor";
import {
  getLatestAnchorForEvidence,
  type BlockchainAnchorRow,
} from "@/lib/db/blockchainAnchors";
import {
  listChainOfCustody,
  verifyChainOfCustody,
} from "@/lib/db/chainOfCustody";
import {
  buildGovAuditEvent,
  type GovAuditActor,
} from "./govAudit";
import { persistGovAuditEvent } from "./govAuditPersistence";
import type {
  ChainOfCustodyRow,
  EmailInvestigationRow,
  EvidenceRow,
  IndicatorRow,
} from "@/lib/db/types";

// ---------------------------------------------------------------------------
// Scope filter
// ---------------------------------------------------------------------------

export type GovScopeFilter =
  | { kind: "all" }
  | { kind: "state"; stateCode: string }
  | { kind: "district"; stateCode: string; districtCode: string }
  | { kind: "assigned"; caseIds: string[] };

export type GovScopeOfficerInput = Pick<
  GovOfficerRow,
  "id" | "scope" | "state_code" | "district_code"
>;

/** Resolve an officer's jurisdiction to a concrete case-id/geo constraint. */
export async function resolveGovScopeFilter(
  officer: GovScopeOfficerInput,
): Promise<GovScopeFilter> {
  switch (officer.scope) {
    case "ALL_INDIA":
      return { kind: "all" };
    case "STATE":
      return { kind: "state", stateCode: officer.state_code ?? "" };
    case "DISTRICT":
      return {
        kind: "district",
        stateCode: officer.state_code ?? "",
        districtCode: officer.district_code ?? "",
      };
    case "ASSIGNED_CASES": {
      const assignments = await listActiveAssignmentsForOfficer(officer.id);
      return { kind: "assigned", caseIds: assignments.map((a) => a.case_id) };
    }
  }
}

/**
 * Apply a scope filter to a query builder targeting the `cases` table
 * (geo columns state_code/district_code; base table id).
 */
export function applyGovScopeFilter(
  query: any,
  filter: GovScopeFilter,
  caseIds: string[] = [],
): any {
  switch (filter.kind) {
    case "state":
      return query.eq("state_code", filter.stateCode);
    case "district":
      return query.eq("state_code", filter.stateCode).eq("district_code", filter.districtCode);
    case "assigned":
      return query.in("id", filter.caseIds);
    case "all":
      return caseIds.length ? query.in("id", caseIds) : query;
  }
}

/** True when the scope filter is the empty assignees special case. */
export function isScopeEmpty(filter: GovScopeFilter): boolean {
  return filter.kind === "assigned" && filter.caseIds.length === 0;
}

// ---------------------------------------------------------------------------
// Shared views
// ---------------------------------------------------------------------------

export const GOV_CASE_VIEW_FIELDS =
  "id,case_number,title,description,threat_type,threat_category,risk_level,gov_status,status,severity,state_code,district_code,sub_division,locality,created_at,updated_at,incident_date,incident_channel,loss_amount,currency,case_source,created_by";

export interface GovCaseView {
  id: string;
  caseNumber: string;
  title: string | null;
  description: string | null;
  threatType: string | null;
  threatCategory: string | null;
  riskLevel: string | null;
  govStatus: string;
  status: string;
  severity: string | null;
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
  createdBy: string | null;
  assignedOfficer: {
    officerId: string;
    officerCode: string | null;
    fullName: string | null;
  } | null;
}

const CASE_CODE_LABELS: Record<string, string> = {
  NEW: "New",
  TRIAGED: "Triaged",
  ASSIGNED: "Assigned",
  UNDER_INVESTIGATION: "Under investigation",
  AWAITING_EVIDENCE: "Awaiting evidence",
  RESOLVED: "Resolved",
  CLOSED: "Closed",
};

export function govStatusLabel(status: string): string {
  return CASE_CODE_LABELS[status] ?? status;
}

interface RawGovCaseRow extends Record<string, unknown> {
  id: string;
  case_number: string;
  title: string | null;
  description: string | null;
  threat_type: string | null;
  threat_category: string | null;
  risk_level: string | null;
  gov_status: string;
  status: string;
  severity: string | null;
  state_code: string | null;
  district_code: string | null;
  sub_division: string | null;
  locality: string | null;
  created_at: string;
  updated_at: string;
  incident_date: string | null;
  incident_channel: string | null;
  loss_amount: string | null;
  currency: string | null;
  case_source: string | null;
  created_by: string | null;
}

function toGovCaseView(row: RawGovCaseRow): GovCaseView {
  return {
    id: row.id,
    caseNumber: row.case_number,
    title: row.title,
    description: row.description,
    threatType: row.threat_type,
    threatCategory: row.threat_category,
    riskLevel: row.risk_level,
    govStatus: row.gov_status,
    status: row.status,
    severity: row.severity,
    stateCode: row.state_code,
    districtCode: row.district_code,
    subDivision: row.sub_division,
    locality: row.locality,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
    incidentDate: row.incident_date,
    incidentChannel: row.incident_channel,
    lossAmount: row.loss_amount,
    currency: row.currency,
    caseSource: row.case_source,
    createdBy: row.created_by,
    assignedOfficer: null,
  };
}

/** Attach ACTIVE primary assignments to a set of case views. */
async function attachAssignments(
  rows: GovCaseView[],
  officerNames: Map<string, { officerCode: string; fullName: string }>,
): Promise<GovCaseView[]> {
  if (rows.length === 0) return rows;
  const ids = rows.map((r) => r.id);
  const { data, error } = await getSupabaseServer()
    .from("case_assignments")
    .select("case_id,officer_id,assignment_type,status")
    .in("case_id", ids)
    .eq("status", "ACTIVE");
  throwIfError(error, "Failed to load case assignments.");
  const byCase = new Map<string, string>();
  for (const a of ((data ?? []) as Array<{
    case_id: string;
    officer_id: string;
    assignment_type: string;
    status: string;
  }>).filter((a) => a.assignment_type === "PRIMARY")) {
    if (!byCase.has(a.case_id)) byCase.set(a.case_id, a.officer_id);
  }
  return rows.map((row) => {
    const officerId = byCase.get(row.id);
    if (!officerId) return row;
    const name = officerNames.get(officerId);
    return {
      ...row,
      assignedOfficer: name
        ? { officerId, officerCode: name.officerCode, fullName: name.fullName }
        : { officerId, officerCode: null, fullName: null },
    };
  });
}

async function officerNameMap(officerIds: string[]): Promise<Map<string, { officerCode: string; fullName: string }>> {
  const map = new Map<string, { officerCode: string; fullName: string }>();
  if (officerIds.length === 0) return map;
  const { data, error } = await getSupabaseServer()
    .from("gov_officers")
    .select("id,officer_code,full_name")
    .in("id", officerIds);
  throwIfError(error, "Failed to load officer names.");
  for (const o of (data ?? []) as Array<{ id: string; officer_code: string; full_name: string }>) {
    map.set(o.id, { officerCode: o.officer_code, fullName: o.full_name });
  }
  return map;
}

// ---------------------------------------------------------------------------
// Phase 6 — Case Explorer
// ---------------------------------------------------------------------------

export interface GovExplorerQuery {
  scope: GovScopeFilter;
  term?: string;
  stateCode?: string;
  districtCode?: string;
  threatCategory?: string;
  riskLevel?: string;
  govStatus?: string;
  officerId?: string;
  from?: string;
  to?: string;
  page: number;
  pageSize: number;
  sort?: "created_at" | "gov_status";
  sortDir?: "asc" | "desc";
}

export interface GovExplorerResult {
  rows: GovCaseView[];
  total: number;
  page: number;
  pageSize: number;
}

/** Case ids matching a free-text search term (case number, sakhi number, email, domain, IP, URL, hash, phone). */
async function caseIdsMatchingTerm(term: string): Promise<string[]> {
  const sb = getSupabaseServer();
  const set = new Set<string>();
  const needle = `%${term}%`;

  const { data: byCase, error: e1 } = await sb
    .from("cases")
    .select("id")
    .or(`case_number.ilike.${needle},title.ilike.${needle}`);
  if (!e1) for (const r of (byCase ?? []) as Array<{ id: string }>) set.add(r.id);

  const { data: byIndicator, error: e2 } = await sb
    .from("indicators")
    .select("case_id")
    .ilike("value", needle)
    .not("case_id", "is", null);
  if (!e2) for (const r of (byIndicator ?? []) as Array<{ case_id: string | null }>) if (r.case_id) set.add(r.case_id);

  const { data: byInvestigation, error: e3 } = await sb
    .from("email_investigations")
    .select("case_id")
    .or(`sender.ilike.${needle},recipients.ilike.${needle},subject.ilike.${needle}`)
    .not("case_id", "is", null);
  if (!e3) for (const r of (byInvestigation ?? []) as Array<{ case_id: string | null }>) if (r.case_id) set.add(r.case_id);

  const { data: byProfile, error: e4 } = await sb.from("profiles").select("id").ilike("sakhi_number", needle);
  if (!e4) {
    const profileIds = (byProfile ?? []).map((r) => (r as { id: string }).id);
    if (profileIds.length) {
      const { data: byCreator, error: e5 } = await sb.from("cases").select("id").in("created_by", profileIds);
      if (!e5) for (const r of (byCreator ?? []) as Array<{ id: string }>) set.add(r.id);
    }
  }

  return [...set];
}

export async function govExplorer(query: GovExplorerQuery): Promise<GovExplorerResult> {
  if (isScopeEmpty(query.scope)) {
    return { rows: [], total: 0, page: query.page, pageSize: query.pageSize };
  }

  const sb = getSupabaseServer();
  const page = Math.max(1, query.page);
  const pageSize = Math.min(100, Math.max(1, query.pageSize));

  let termIds: string[] | null = null;
  if (query.term && query.term.trim().length > 0) {
    termIds = await caseIdsMatchingTerm(query.term.trim());
    if (termIds.length === 0) {
      return { rows: [], total: 0, page, pageSize };
    }
  }

  let officerIds: string[] | null = null;
  if (query.officerId) {
    const { data, error } = await sb
      .from("case_assignments")
      .select("case_id")
      .eq("officer_id", query.officerId)
      .eq("status", "ACTIVE");
    throwIfError(error, "Failed to filter by assigned officer.");
    officerIds = (data ?? []).map((r) => (r as { case_id: string }).case_id);
    if (officerIds.length === 0) return { rows: [], total: 0, page, pageSize };
  }

  const base = sb
    .from("cases")
    .select(GOV_CASE_VIEW_FIELDS, { count: "exact", head: false });

  let q = applyGovScopeFilter(base, query.scope);
  if (termIds) q = q.in("id", termIds);
  if (officerIds) q = q.in("id", officerIds);
  if (query.stateCode) q = q.eq("state_code", query.stateCode);
  if (query.districtCode) q = q.eq("district_code", query.districtCode);
  if (query.threatCategory) q = q.eq("threat_category", query.threatCategory);
  if (query.riskLevel) q = q.eq("risk_level", query.riskLevel);
  if (query.govStatus) q = q.eq("gov_status", query.govStatus);
  if (query.from) q = q.gte("created_at", query.from);
  if (query.to) q = q.lte("created_at", query.to);

  const sortCol = query.sort === "gov_status" ? "gov_status" : "created_at";
  const sortDir = query.sortDir === "asc" ? "asc" : "desc";
  q = q.order(sortCol, { ascending: sortDir === "asc" }).order("created_at", { ascending: false });

  const from = (page - 1) * pageSize;
  q = q.range(from, from + pageSize - 1);

  const { data, error, count } = await q;
  throwIfError(error, "Failed to query government cases.");

  const raw = ((data ?? []) as RawGovCaseRow[]).map(toGovCaseView);
  const officerIdsToFetch = raw
    .map((r) => r.assignedOfficer?.officerId)
    .filter((x): x is string => Boolean(x));
  const rows = await attachAssignments(raw, await officerNameMap([...new Set(officerIdsToFetch)]));

  return { rows, total: count ?? 0, page, pageSize };
}

// ---------------------------------------------------------------------------
// Phase 7 — Case detail / workspace
// ---------------------------------------------------------------------------

export interface GovCaseDetail extends GovCaseView {
  victimSummary: {
    name: string | null;
    phoneMasked: string | null;
    age: string | null;
    profileId: string | null;
  } | null;
  assignments: GovAssignmentRow[];
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
  indicators: IndicatorRow[];
  notes: Array<{ id: string; officerId: string; content: string; createdAt: string; updatedAt: string; isEdited: boolean }>;
  evidenceCount: number;
  timeline: Array<{ at: string; label: string; detail: string | null; actor: string | null; type: string }>;
}

function safeAnalysisSummary(analysis: unknown) {
  const a = (analysis ?? {}) as {
    authentication?: { spf?: string; dkim?: string; dmarc?: string };
    senderDomain?: string | null;
    originatingIP?: string | null;
    smtpPath?: unknown[];
    indicators?: unknown[];
    threatScore?: number | null;
    threatLevel?: string | null;
    senderSpoofingDetected?: boolean | null;
  };
  return {
    authentication: a.authentication ?? {},
    senderDomain: a.senderDomain ?? null,
    originatingIP: a.originatingIP ?? null,
    smtpHops: Array.isArray(a.smtpPath) ? a.smtpPath.length : 0,
    indicatorsCount: Array.isArray(a.indicators) ? a.indicators.length : 0,
    threatScore: a.threatScore ?? null,
    threatLevel: a.threatLevel ?? null,
    senderSpoofingDetected: a.senderSpoofingDetected ?? null,
  };
}

const AUDIT_LABELS: Record<string, string> = {
  "case.access_allowed": "Officer viewed case",
  "case.access_denied": "Case access denied",
  "pii.access_allowed": "Victim PII accessed",
  "evidence.access_allowed": "Evidence accessed",
  "evidence.access_denied": "Evidence access denied",
  "case.updated": "Case updated",
  "case.note_added": "Investigation note added",
  "assignment.created": "Case assigned",
  "report.exported": "Report exported",
  "report.generated": "Report generated",
  "auth.login_succeeded": "Officer signed in",
  "session.revoked": "Session revoked",
};

export async function govCaseDetail(caseId: string): Promise<GovCaseDetail | null> {
  const sb = getSupabaseServer();

  const { data: row, error } = await sb
    .from("cases")
    .select("*")
    .eq("id", caseId)
    .maybeSingle();
  if (error && error.code === "PGRST116") return null;
  throwIfError(error, "Failed to load government case.");
  if (!row) return null;

  const view = toGovCaseView(row as RawGovCaseRow);

  const [assignments, investigationsData, indicatorsData, notesData, evidenceData, auditData, profileData] =
    await Promise.all([
      listAssignmentsForCase(caseId),
      sb.from("email_investigations").select("*").eq("case_id", caseId).order("created_at", { ascending: false }),
      sb.from("indicators").select("*").eq("case_id", caseId).order("created_at", { ascending: false }),
      sb.from("gov_case_notes").select("*").eq("case_id", caseId).order("created_at", { ascending: false }),
      sb.from("evidence")
        .select("id,evidence_code,title,category,mime_type,file_size,sha256,created_at,source,blockchain_anchor_id")
        .eq("case_id", caseId)
        .order("created_at", { ascending: true }),
      sb.from("audit_logs").select("*").eq("case_id", caseId).order("created_at", { ascending: false }),
      row.created_by
        ? sb.from("profiles").select("sakhi_number,city").eq("id", row.created_by).maybeSingle()
        : Promise.resolve({ data: null, error: null }),
    ]);

  throwIfError(assignments instanceof Error ? assignments : null, "Failed to load assignments.");
  throwIfError(investigationsData.error, "Failed to load investigations.");
  throwIfError(indicatorsData.error, "Failed to load indicators.");
  throwIfError(notesData.error, "Failed to load notes.");
  throwIfError(evidenceData.error, "Failed to load evidence.");
  throwIfError(auditData.error, "Failed to load audit trail.");

  const investigations = ((investigationsData.data ?? []) as unknown[]).map((inv) => {
    const r = inv as EmailInvestigationRow;
    return {
      id: r.id,
      subject: r.subject ?? null,
      sender: r.sender ?? null,
      riskScore: r.risk_score ?? null,
      verdict: r.verdict ?? null,
      createdAt: r.created_at,
      analysisSummary: safeAnalysisSummary(r.analysis),
    };
  });

  const indicators = (indicatorsData.data ?? []) as IndicatorRow[];
  const notes = ((notesData.data ?? []) as Array<{
    id: string;
    officer_id: string;
    content: string;
    created_at: string;
    updated_at: string;
    is_edited: boolean;
  }>).map((n) => ({
    id: n.id,
    officerId: n.officer_id,
    content: n.content,
    createdAt: n.created_at,
    updatedAt: n.updated_at,
    isEdited: n.is_edited,
  }));

  const officerIds = [
    ...assignments.map((a) => a.officer_id).map((x) => x ?? ""),
    ...notes.map((n) => n.officerId),
    ...((auditData.data ?? []) as Array<{ actor_gov_id: string | null }>).map((a) => a.actor_gov_id ?? ""),
  ].filter((x) => x.length > 0);
  const names = await officerNameMap([...new Set(officerIds)]);
  const officerLabel = (id: string | null | undefined): string | null => {
    if (!id) return null;
    const n = names.get(id);
    return n ? `${n.fullName} (${n.officerCode})` : id.slice(0, 8);
  };

  const timeline: GovCaseDetail["timeline"] = [];
  timeline.push({ at: view.createdAt, label: "Case created", detail: view.caseNumber, actor: null, type: "case" });

  for (const inv of investigations) {
    timeline.push({
      at: inv.createdAt,
      label: "Forensic analysis added",
      detail: `Subject: ${inv.subject ?? "(none)"}`,
      actor: null,
      type: "forensics",
    });
  }

  const evidenceList = (evidenceData.data ?? []) as Array<{
    id: string;
    evidence_code: string;
    title: string;
    category: string | null;
    created_at: string;
  }>;
  for (const ev of evidenceList) {
    timeline.push({
      at: ev.created_at,
      label: "Evidence uploaded",
      detail: `${ev.evidence_code}${ev.category ? ` · ${ev.category}` : ""}`,
      actor: null,
      type: "evidence",
    });
  }

  for (const a of assignments) {
    timeline.push({
      at: a.created_at,
      label: a.assignment_type === "PRIMARY" ? "Assigned" : "Supporting officer assigned",
      detail: a.reason,
      actor: officerLabel(a.assigned_by),
      type: "assignment",
    });
  }

  for (const n of notes) {
    timeline.push({
      at: n.createdAt,
      label: "Investigation note added",
      detail: n.content.slice(0, 140),
      actor: officerLabel(n.officerId),
      type: "note",
    });
  }

  const auditRows = (auditData.data ?? []) as Array<{
    action: string;
    actor_gov_id: string | null;
    actor_type: string | null;
    outcome: string | null;
    created_at: string;
  }>;
  for (const a of auditRows) {
    const label = AUDIT_LABELS[a.action] ?? a.action;
    timeline.push({
      at: a.created_at,
      label,
      detail: a.outcome === "deny" ? "Denied" : null,
      actor: a.actor_type === "gov_officer" ? officerLabel(a.actor_gov_id) : a.actor_type ?? "system",
      type: "audit",
    });
  }

  timeline.sort((a, b) => (a.at < b.at ? 1 : a.at > b.at ? -1 : 0));

  const profile = profileData?.data as { sakhi_number: string | null; city: string | null } | null;
  const victimRow = row as RawGovCaseRow & {
    victim_name: string | null;
    victim_phone: string | null;
    victim_email: string | null;
    victim_age: string | null;
  };
  const victimSummary = victimRow.victim_name
    ? {
        name: victimRow.victim_name,
        phoneMasked: victimRow.victim_phone ? maskPhone(victimRow.victim_phone) : null,
        age: victimRow.victim_age ?? null,
        profileId: row.created_by ?? null,
      }
    : profile
      ? {
          name: null,
          phoneMasked: profile.sakhi_number ? `Sakhi ${maskPhone(profile.sakhi_number)}` : null,
          age: null,
          profileId: row.created_by ?? null,
        }
      : null;

  return {
    ...view,
    victimSummary,
    assignments,
    investigations,
    indicators,
    notes,
    evidenceCount: evidenceList.length,
    timeline,
  };
}

export function maskPhone(value: string): string {
  const digits = value.replace(/\D/g, "");
  if (digits.length < 5) return "••••";
  return `${digits.slice(0, digits.length - 4).replace(/./g, "•")}${digits.slice(-4)}`;
}

// ---------------------------------------------------------------------------
// Phase 7 — Victim PII (gated)
// ---------------------------------------------------------------------------

export interface GovVictimDetail {
  name: string | null;
  phone: string | null;
  email: string | null;
  age: string | null;
  sakhiNumber: string | null;
  city: string | null;
  incidentDate: string | null;
}

export async function govCaseVictim(caseId: string): Promise<GovVictimDetail | null> {
  const sb = getSupabaseServer();
  const { data: row, error } = await sb
    .from("cases")
    .select("victim_name,victim_phone,victim_email,victim_age,incident_date,created_by")
    .eq("id", caseId)
    .maybeSingle();
  if (error && error.code === "PGRST116") return null;
  throwIfError(error, "Failed to load victim information.");
  if (!row) return null;

  const r = row as {
    victim_name: string | null;
    victim_phone: string | null;
    victim_email: string | null;
    victim_age: string | null;
    incident_date: string | null;
    created_by: string | null;
  };
  let sakhiNumber: string | null = null;
  let city: string | null = null;
  if (r.created_by) {
    const { data: profile, error: perr } = await sb
      .from("profiles")
      .select("sakhi_number,city")
      .eq("id", r.created_by)
      .maybeSingle();
    if (!perr && profile) {
      sakhiNumber = (profile as { sakhi_number: string | null }).sakhi_number;
      city = (profile as { city: string | null }).city;
    }
  }

  return {
    name: r.victim_name,
    phone: r.victim_phone,
    email: r.victim_email,
    age: r.victim_age,
    sakhiNumber,
    city,
    incidentDate: r.incident_date,
  };
}

// ---------------------------------------------------------------------------
// Phase 7 — Notes
// ---------------------------------------------------------------------------

export async function listGovCaseNotes(caseId: string): Promise<GovCaseDetail["notes"]> {
  const { data, error } = await getSupabaseServer()
    .from("gov_case_notes")
    .select("*")
    .eq("case_id", caseId)
    .order("created_at", { ascending: false });
  throwIfError(error, "Failed to load investigation notes.");
  return ((data ?? []) as Array<{
    id: string;
    officer_id: string;
    content: string;
    created_at: string;
    updated_at: string;
    is_edited: boolean;
  }>).map((n) => ({
    id: n.id,
    officerId: n.officer_id,
    content: n.content,
    createdAt: n.created_at,
    updatedAt: n.updated_at,
    isEdited: n.is_edited,
  }));
}

export async function addGovCaseNote(
  caseId: string,
  officerId: string,
  content: string,
): Promise<{ id: string }> {
  const { data, error } = await getSupabaseServer()
    .from("gov_case_notes")
    .insert({ case_id: caseId, officer_id: officerId, content: content.trim() })
    .select("id")
    .single();
  throwIfError(error, "Failed to add investigation note.");
  return data as { id: string };
}

// ---------------------------------------------------------------------------
// Phase 7/12 — Case triage update + assignment
// ---------------------------------------------------------------------------

export interface GovCaseTriagePatch {
  govStatus?: string;
  riskLevel?: string;
  severity?: string;
  threatCategory?: string;
}

const GOV_STATUSES = new Set([
  "NEW", "TRIAGED", "ASSIGNED", "UNDER_INVESTIGATION", "AWAITING_EVIDENCE", "RESOLVED", "CLOSED",
]);
const RISK_LEVELS = new Set(["LOW", "MEDIUM", "HIGH", "CRITICAL"]);

export async function govUpdateCaseTriage(
  caseId: string,
  patch: GovCaseTriagePatch,
): Promise<Record<string, unknown> | null> {
  const dbPatch: Record<string, unknown> = {};
  if (patch.govStatus !== undefined) {
    if (!GOV_STATUSES.has(patch.govStatus)) throw new Error("Invalid gov_status.");
    dbPatch.gov_status = patch.govStatus;
  }
  if (patch.riskLevel !== undefined) {
    if (patch.riskLevel && !RISK_LEVELS.has(patch.riskLevel)) throw new Error("Invalid risk level.");
    dbPatch.risk_level = patch.riskLevel || null;
  }
  if (patch.severity !== undefined) dbPatch.severity = patch.severity || null;
  if (patch.threatCategory !== undefined) dbPatch.threat_category = patch.threatCategory || null;
  if (Object.keys(dbPatch).length === 0) throw new Error("Nothing to update.");

  const { data, error } = await getSupabaseServer()
    .from("cases")
    .update(dbPatch)
    .eq("id", caseId)
    .select("id,case_number,gov_status,risk_level,severity,threat_category")
    .single();
  throwIfError(error, "Failed to update case.");
  return data as Record<string, unknown> | null;
}

export interface GovAssignInput {
  caseId: string;
  officerId: string;
  assignedBy: string | null;
  reason: string;
  ticket?: string | null;
}

/** Assign a case (or reassign as a new PRIMARY row) and audit it. */
export async function govAssignCase(
  input: GovAssignInput,
  actor: GovAuditActor,
  correlationId: string,
): Promise<GovAssignmentRow> {
  const assignment = await createGovAssignment({
    caseId: input.caseId,
    officerId: input.officerId,
    assignmentType: "PRIMARY",
    reason: input.reason,
    ticket: input.ticket ?? null,
    assignedBy: input.assignedBy,
  });

  const { data } = await getSupabaseServer()
    .from("cases")
    .select("gov_status")
    .eq("id", input.caseId)
    .maybeSingle();
  const current = (data as { gov_status?: string } | null)?.gov_status;
  if (current && (current === "NEW" || current === "TRIAGED")) {
    await getSupabaseServer()
      .from("cases")
      .update({ gov_status: "ASSIGNED" })
      .eq("id", input.caseId);
  }

  const event = buildGovAuditEvent({
    action: "assignment.created",
    actor,
    caseId: input.caseId,
    assignmentId: assignment.id,
    permission: "case.assign",
    result: "allow",
    correlationId,
    payload: { reason: input.reason, ticket: input.ticket ?? null },
  });
  if (event) await persistGovAuditEvent(event);

  return assignment;
}

// ---------------------------------------------------------------------------
// Phase 8 — Evidence + Chain of Custody + Blockchain verification
// ---------------------------------------------------------------------------

export interface GovCaseEvidenceRow {
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
}

export async function govEvidenceForCase(caseId: string): Promise<GovCaseEvidenceRow[]> {
  const { data, error } = await getSupabaseServer()
    .from("evidence")
    .select("id,evidence_code,title,category,mime_type,file_size,sha256,created_at,source,blockchain_anchor_id")
    .eq("case_id", caseId)
    .order("created_at", { ascending: true });
  throwIfError(error, "Failed to load case evidence.");
  return ((data ?? []) as Array<{
    id: string;
    evidence_code: string;
    title: string;
    category: string | null;
    mime_type: string | null;
    file_size: number | null;
    sha256: string | null;
    created_at: string;
    source: string | null;
    blockchain_anchor_id: string | null;
  }>).map((e) => ({
    id: e.id,
    evidenceCode: e.evidence_code,
    title: e.title,
    category: e.category,
    mimeType: e.mime_type,
    fileSize: e.file_size,
    sha256: e.sha256,
    createdAt: e.created_at,
    source: e.source,
    blockchainAnchorId: e.blockchain_anchor_id,
  }));
}

export interface GovEvidenceIntegrity {
  row: EvidenceRow | null;
  custody: ChainOfCustodyRow[];
  custodyVerification: {
    isValid: boolean;
    errors: string[];
    verifiedEventCount: number;
    totalEventCount: number;
    schemaVersion: string;
  } | null;
  anchor: BlockchainAnchorRow | null;
  anchorVerification: {
    status: string;
    reason?: string | null;
    chainName?: string | null;
    chainId?: string | null;
    blockNumber?: number | null;
    anchoredDigest?: string | null;
    expectedDigest?: string | null;
    verifiedAt?: string | null;
    anchoredAt?: string | null;
  } | null;
  expectedDigest: { source: string; value: string } | null;
  chain: string | null;
}

/**
 * Evidence detail + integrity for the government console. Reuses the
 * repository's canonical digest logic, custody-chain verifier, and the
 * existing blockchain anchor verification — nothing is reimplemented.
 */
export async function govEvidenceIntegrity(
  evidenceId: string,
  verifyBlockchain = false,
): Promise<GovEvidenceIntegrity> {
  const sb = getSupabaseServer();
  const { data: row, error } = await sb.from("evidence").select("*").eq("id", evidenceId).maybeSingle();
  if (error && error.code === "PGRST116") {
    return { row: null, custody: [], custodyVerification: null, anchor: null, anchorVerification: null, expectedDigest: null, chain: null };
  }
  throwIfError(error, "Failed to load evidence.");

  const evidence = row as EvidenceRow;
  const custody = await listChainOfCustody(evidenceId);
  const custodyVerification = await verifyChainOfCustody(evidenceId).catch(() => null);

  const canonical = getCanonicalEvidenceDigest({
    encryptedContent:
      typeof evidence.encrypted_content === "string" ? evidence.encrypted_content : null,
    sha256: evidence.sha256 ?? undefined,
    metadata: (evidence.metadata as Record<string, unknown> | null) ?? undefined,
  });

  const anchor = evidence.blockchain_anchor_id
    ? await getLatestAnchorForEvidence(evidenceId)
    : null;

  let anchorVerification: GovEvidenceIntegrity["anchorVerification"] = null;
  if (verifyBlockchain && anchor) {
    const record = { txHash: anchor.tx_hash ?? "", digest: anchor.anchored_digest ?? "", chainId: anchor.chain_id ?? "" };
    try {
      const result = await verifyAnchorOnChain({ record, currentDigest: canonical ?? "" });
      anchorVerification = {
        status: result.status,
        reason: result.reason ?? null,
        chainName: anchor.network_name ?? null,
        chainId: anchor.chain_id ?? null,
        blockNumber: anchor.block_number ?? null,
        anchoredDigest: anchor.anchored_digest ?? null,
        expectedDigest: canonical ?? null,
        verifiedAt: result.verifiedAt ?? null,
        anchoredAt: anchor.anchored_at ?? null,
      };
    } catch {
      anchorVerification = {
        status: "unavailable",
        reason: "Blockchain verification could not be completed. External data: Not connected.",
        chainName: anchor.network_name ?? null,
        chainId: anchor.chain_id ?? null,
        blockNumber: anchor.block_number ?? null,
        anchoredDigest: anchor.anchored_digest ?? null,
        expectedDigest: canonical ?? null,
        anchoredAt: anchor.anchored_at ?? null,
      };
    }
  } else if (anchor) {
    anchorVerification = {
      status: anchor.status ?? "not_created",
      reason: anchor.status === "confirmed" ? "Pending on-chain re-verification." : null,
      chainName: anchor.network_name ?? null,
      chainId: anchor.chain_id ?? null,
      blockNumber: anchor.block_number ?? null,
      anchoredDigest: anchor.anchored_digest ?? null,
      expectedDigest: canonical ?? null,
      anchoredAt: anchor.anchored_at ?? null,
    };
  }

  return {
    row: evidence,
    custody,
    custodyVerification,
    anchor,
    anchorVerification,
    expectedDigest: canonical
      ? { source: "canonical (encrypted content => sha256)", value: canonical }
      : null,
    chain: anchor?.network_name ?? null,
  };
}

// ---------------------------------------------------------------------------
// Phase 9 — Geographic intelligence
// ---------------------------------------------------------------------------

export interface GovGeoMetric {
  cases: number;
  new7d: number;
  highRisk: number;
  open: number;
}

export interface GovGeoSummary {
  state: string | null;
  district: string | null;
  level: "india" | "state" | "district" | "locality";
  from: string | null;
  to: string | null;
  rows: Array<{ code: string; label: string; metric: GovGeoMetric }>;
  total: GovGeoMetric;
  threatBreakdown?: Array<{ label: string; count: number }>;
  riskBreakdown?: Array<{ label: string; count: number }>;
  cases?: GovCaseView[];
}

function new7dAgo(): string {
  return new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString();
}

export async function govGeoSummary(opts: {
  scope: GovScopeFilter;
  state: string | null;
  district: string | null;
  from?: string | null;
  to?: string | null;
  casesLimit?: number;
}): Promise<GovGeoSummary> {
  if (isScopeEmpty(opts.scope)) {
    const empty: GovGeoMetric = { cases: 0, new7d: 0, highRisk: 0, open: 0 };
    return { state: opts.state, district: opts.district, level: "india", from: opts.from ?? null, to: opts.to ?? null, rows: [], total: empty };
  }

  const groupField =
    opts.state === null ? "state_code" : opts.district === null ? "district_code" : "sub_division";

  let q = getSupabaseServer()
    .from("cases")
    .select(`id,created_at,risk_level,threat_category,gov_status,${groupField},state_code,district_code,sub_division,locality`);
  q = applyGovScopeFilter(q, opts.scope);
  if (opts.state) q = q.eq("state_code", opts.state);
  if (opts.district) q = q.eq("district_code", opts.district);
  if (opts.from) q = q.gte("created_at", opts.from);
  if (opts.to) q = q.lte("created_at", opts.to);
  const { data, error } = await q;

  if (error) throw error;

  const rowsVec = (data ?? []) as Array<{
    id: string;
    created_at: string;
    risk_level: string | null;
    threat_category: string | null;
    gov_status: string;
    state_code: string | null;
    district_code: string | null;
    sub_division: string | null;
    locality: string | null;
  }>;

  const map = new Map<string, GovGeoMetric>();
  const totals: GovGeoMetric = { cases: 0, new7d: 0, highRisk: 0, open: 0 };
  const cutoff = new7dAgo();
  for (const row of rowsVec) {
    const rawKey = row[groupField] as string | null;
    const key = groupField === "sub_division" && !rawKey ? row.locality : rawKey;
    const metric = map.get((key ?? "") || "UNKNOWN") ?? { cases: 0, new7d: 0, highRisk: 0, open: 0 };
    metric.cases += 1;
    if (row.created_at >= cutoff) metric.new7d += 1;
    if (row.risk_level === "HIGH" || row.risk_level === "CRITICAL") metric.highRisk += 1;
    if (row.gov_status !== "RESOLVED" && row.gov_status !== "CLOSED") metric.open += 1;
    map.set((key ?? "") || "UNKNOWN", metric);

    totals.cases += 1;
    if (row.created_at >= cutoff) totals.new7d += 1;
    if (row.risk_level === "HIGH" || row.risk_level === "CRITICAL") totals.highRisk += 1;
    if (row.gov_status !== "RESOLVED" && row.gov_status !== "CLOSED") totals.open += 1;
  }

  const rows = [...map.entries()]
    .map(([code, metric]) => ({ code, label: code === "UNKNOWN" ? "Not located" : code, metric }))
    .sort((a, b) => b.metric.cases - a.metric.cases);

  let threatBreakdown: Array<{ label: string; count: number }> | undefined;
  let riskBreakdown: Array<{ label: string; count: number }> | undefined;
  let cases: GovCaseView[] | undefined;

  if (rowsVec.length > 0) {
    const tc = new Map<string, number>();
    const rc = new Map<string, number>();
    for (const row of rowsVec) {
      const t = row.threat_category ?? "Other";
      tc.set(t, (tc.get(t) ?? 0) + 1);
      const r = row.risk_level ?? "Unset";
      rc.set(r, (rc.get(r) ?? 0) + 1);
    }
    threatBreakdown = [...tc.entries()].map(([label, count]) => ({ label, count })).sort((a, b) => b.count - a.count);
    riskBreakdown = [...rc.entries()].map(([label, count]) => ({ label, count })).sort((a, b) => b.count - a.count);
  }

  if (opts.casesLimit && opts.casesLimit > 0) {
    cases = rowsVec
      .slice(0, opts.casesLimit)
      .map((r) =>
        toGovCaseView({
          id: r.id,
          case_number: "",
          title: null,
          description: null,
          threat_type: null,
          threat_category: r.threat_category,
          risk_level: r.risk_level,
          gov_status: r.gov_status,
          status: "",
          severity: null,
          state_code: r.state_code,
          district_code: r.district_code,
          sub_division: r.sub_division,
          locality: r.locality,
          created_at: r.created_at,
          updated_at: r.created_at,
          incident_date: null,
          incident_channel: null,
          loss_amount: null,
          currency: null,
          case_source: null,
          created_by: null,
        }),
      );
  }

  return {
    state: opts.state,
    district: opts.district,
    level: opts.state === null ? "india" : opts.district === null ? "state" : "district",
    from: opts.from ?? null,
    to: opts.to ?? null,
    rows,
    total: totals,
    threatBreakdown,
    riskBreakdown,
    cases,
  };
}

// ---------------------------------------------------------------------------
// Phase 11 — Indicator intelligence
// ---------------------------------------------------------------------------

export interface GovIndicatorResultItem {
  type: string;
  value: string;
  firstSeen: string | null;
  lastSeen: string | null;
  caseCount: number;
  malicious: boolean | null;
  confidence: number | null;
  source: string | null;
  states: Array<{ code: string | null; count: number }>;
  categories: Array<{ label: string | null; count: number }>;
  cases: Array<{
    id: string;
    caseNumber: string | null;
    stateCode: string | null;
    districtCode: string | null;
    threatCategory: string | null;
    createdAt: string | null;
  }>;
}

export async function govSearchIndicators(
  scope: GovScopeFilter,
  value: string,
  limit = 10,
): Promise<GovIndicatorResultItem[]> {
  if (isScopeEmpty(scope)) return [];

  const sb = getSupabaseServer();
  const needle = `%${value}%`;

  const { data, error } = await sb
    .from("indicators")
    .select("id,type,value,malicious,confidence,source,case_id,created_at")
    .or(`value.ilike.${needle},type.ilike.${needle}`)
    .not("case_id", "is", null)
    .order("created_at", { ascending: false });
  throwIfError(error, "Failed to search indicators.");

  const rows = (data ?? []) as Array<{
    id: string;
    type: string;
    value: string;
    malicious: boolean | null;
    confidence: number | null;
    source: string | null;
    case_id: string | null;
    created_at: string;
  }>;

  const validIds: string[] = [];
  if (scope.kind === "assigned") {
    validIds.push(...scope.caseIds);
  } else {
    let q = sb.from("cases").select("id");
    q = applyGovScopeFilter(q, scope);
    const { data: scopedIds, error: serr } = await q;
    if (serr) throw serr;
    validIds.push(...((scopedIds ?? []) as Array<{ id: string }>).map((r) => r.id));
  }
  const allowed = new Set(validIds);

  const scopedRows = rows.filter((r) => r.case_id && allowed.has(r.case_id));

  const byValue = new Map<string, GovIndicatorResultItem>();
  for (const row of scopedRows) {
    const key = `${row.type}|${row.value}`;
    const item = byValue.get(key) ?? {
      type: row.type,
      value: row.value,
      firstSeen: row.created_at,
      lastSeen: row.created_at,
      caseCount: 0,
      malicious: row.malicious ?? null,
      confidence: row.confidence ?? null,
      source: row.source ?? null,
      states: [],
      categories: [],
      cases: [],
    };
    if (!item.firstSeen || row.created_at < item.firstSeen) item.firstSeen = row.created_at;
    if (!item.lastSeen || row.created_at > item.lastSeen) item.lastSeen = row.created_at;
    item.caseCount += 1;
    if (item.malicious === null && row.malicious !== null) item.malicious = row.malicious;
    if (item.confidence === null && row.confidence !== null) item.confidence = row.confidence;
    item.cases.push({
      id: row.case_id as string,
      caseNumber: null,
      stateCode: null,
      districtCode: null,
      threatCategory: null,
      createdAt: row.created_at,
    });
    byValue.set(key, item);
  }

  // Enrich related cases.
  for (const [key, item] of byValue) {
    const caseIds = item.cases.map((c) => c.id);
    const { data: caseRows, error: cerr } = await sb
      .from("cases")
      .select("id,case_number,state_code,district_code,threat_category,created_at")
      .in("id", caseIds);
    if (cerr) continue;
    const lookup = new Map((caseRows ?? []).map((r) => {
      const c = r as {
        id: string;
        case_number: string;
        state_code: string | null;
        district_code: string | null;
        threat_category: string | null;
        created_at: string;
      };
      return [c.id, c];
    }));
    item.cases = item.cases.map((c) => {
      const row = lookup.get(c.id);
      return row
        ? {
            ...c,
            caseNumber: row.case_number,
            stateCode: row.state_code,
            districtCode: row.district_code,
            threatCategory: row.threat_category,
          }
        : c;
    });
    const stateMap = new Map<string, number>();
    const catMap = new Map<string, number>();
    for (const c of item.cases) {
      const s = c.stateCode ?? "Unknown";
      stateMap.set(s, (stateMap.get(s) ?? 0) + 1);
      const t = c.threatCategory ?? "Other";
      catMap.set(t, (catMap.get(t) ?? 0) + 1);
    }
    item.states = [...stateMap.entries()].map(([code, count]) => ({ code, count })).sort((a, b) => b.count - a.count);
    item.categories = [...catMap.entries()].map(([label, count]) => ({ label, count })).sort((a, b) => b.count - a.count);
    byValue.set(key, item);
  }

  return [...byValue.values()]
    .sort((a, b) => b.caseCount - a.caseCount)
    .slice(0, Math.max(1, limit));
}

// ---------------------------------------------------------------------------
// Phase 12 — Investigation queue
// ---------------------------------------------------------------------------

export interface GovQueueResult {
  counts: Record<string, number>;
  priority: GovCaseView[];
  newCases: GovCaseView[];
  view: "NEW" | "TRIAGED" | "PRIORITY";
  total: number;
}

export async function govQueue(
  scope: GovScopeFilter,
  view: "NEW" | "TRIAGED" | "PRIORITY",
  pageSize = 25,
): Promise<GovQueueResult> {
  if (isScopeEmpty(scope)) {
    return { counts: {}, priority: [], newCases: [], view, total: 0 };
  }

  const sb = getSupabaseServer();
  let q = sb.from("cases").select(GOV_CASE_VIEW_FIELDS, { count: "exact", head: false });
  q = applyGovScopeFilter(q, scope);
  q = q.order("created_at", { ascending: false }).range(0, pageSize * 3 - 1);
  const { data, error, count } = await q;
  throwIfError(error, "Failed to load investigation queue.");

  const raw = ((data ?? []) as RawGovCaseRow[]).map(toGovCaseView);
  const officerIdsToFetch = raw.map((r) => r.assignedOfficer?.officerId).filter((x): x is string => Boolean(x));
  const rows = await attachAssignments(raw, await officerNameMap([...new Set(officerIdsToFetch)]));

  const counts: Record<string, number> = {};
  for (const row of rows) counts[row.govStatus] = (counts[row.govStatus] ?? 0) + 1;

  const byPriority = [...rows].sort((a, b) => riskRank(b.riskLevel) - riskRank(a.riskLevel));
  const priority = (view === "PRIORITY" ? byPriority : rows).filter(
    (r) => r.govStatus !== "RESOLVED" && r.govStatus !== "CLOSED",
  );
  const newCases = rows.filter((r) => r.govStatus === "NEW" || r.govStatus === "TRIAGED");

  return { counts, priority: priority.slice(0, pageSize), newCases: newCases.slice(0, pageSize), view, total: count ?? 0 };
}

function riskRank(level: string | null): number {
  switch (level) {
    case "CRITICAL":
      return 4;
    case "HIGH":
      return 3;
    case "MEDIUM":
      return 2;
    case "LOW":
      return 1;
    default:
      return 0;
  }
}

// ---------------------------------------------------------------------------
// Phase 5 — Dashboard metrics
// ---------------------------------------------------------------------------

export interface GovDashboardTimeWindow {
  /** "today" | "7d" | "30d" | "90d" | "custom" */
  label: string;
  from: string | null;
  to: string | null;
}

export interface GovDashboardMetrics {
  generatedAt: string;
  window: GovDashboardTimeWindow;
  filters: { stateCode: string | null; districtCode: string | null };
  metrics: {
    total: number;
    new: number;
    highRisk: number;
    underInvestigation: number;
    resolved: number;
    open: number;
  };
  threatDistribution: Array<{ label: string; count: number }>;
  riskDistribution: Array<{ label: string; count: number }>;
  statusDistribution: Array<{ label: string; count: number }>;
}

export interface GovDashboardFilterInput {
  window?: GovDashboardTimeWindow;
  stateCode?: string | null;
  districtCode?: string | null;
}

/** Build a time window from a range label; null bounds mean "no bound". */
export function govDashboardWindow(range: string, from?: string, to?: string): GovDashboardTimeWindow {
  const now = new Date();
  const daysAgo = (n: number) => new Date(now.getTime() - n * 24 * 60 * 60 * 1000).toISOString();
  switch (range) {
    case "today": {
      const start = new Date(now.getFullYear(), now.getMonth(), now.getDate()).toISOString();
      return { label: "today", from: start, to: now.toISOString() };
    }
    case "30d":
      return { label: "30d", from: daysAgo(30), to: now.toISOString() };
    case "90d":
      return { label: "90d", from: daysAgo(90), to: now.toISOString() };
    case "custom":
      return { label: "custom", from: (from && !isNaN(Date.parse(from)) ? new Date(from).toISOString() : null), to: (to && !isNaN(Date.parse(to)) ? new Date(to).toISOString() : null) };
    case "7d":
    default:
      return { label: "7d", from: daysAgo(7), to: now.toISOString() };
  }
}

/**
 * Real dashboard aggregates, always bounded by the officer's scope plus any
 * state/district refinements the officer is allowed to apply. All figures
 * come from the cases table in the current window — never generated values.
 */
export async function govDashboardMetrics(
  scope: GovScopeFilter,
  input: GovDashboardFilterInput = {},
): Promise<GovDashboardMetrics> {
  const empty: GovDashboardMetrics = {
    generatedAt: new Date().toISOString(),
    window: input.window ?? { label: "7d", from: null, to: null },
    filters: { stateCode: input.stateCode ?? null, districtCode: input.districtCode ?? null },
    metrics: { total: 0, new: 0, highRisk: 0, underInvestigation: 0, resolved: 0, open: 0 },
    threatDistribution: [],
    riskDistribution: [],
    statusDistribution: [],
  };
  if (isScopeEmpty(scope)) return empty;

  const window = input.window ?? { label: "7d", from: null, to: null };
  const sb = getSupabaseServer();

  let q = sb
    .from("cases")
    .select("threat_category,risk_level,gov_status,created_at", { count: "exact", head: false })
    .order("created_at", { ascending: false });
  q = applyGovScopeFilter(q, scope);
  if (input.stateCode) q = q.eq("state_code", input.stateCode);
  if (input.districtCode) q = q.eq("district_code", input.districtCode);
  if (window.from) q = q.gte("created_at", window.from);
  if (window.to) q = q.lte("created_at", window.to);
  q = q.range(0, 99999);

  const { data, error, count } = await q;
  throwIfError(error, "Failed to aggregate dashboard metrics.");

  const rows = (data ?? []) as Array<{
    threat_category: string | null;
    risk_level: string | null;
    gov_status: string;
    created_at: string;
  }>;

  const metrics = {
    total: count ?? rows.length,
    new: rows.length,
    highRisk: 0,
    underInvestigation: 0,
    resolved: 0,
    open: 0,
  };
  const tc = new Map<string, number>();
  const rc = new Map<string, number>();
  const sc = new Map<string, number>();
  for (const row of rows) {
    if (row.risk_level === "HIGH" || row.risk_level === "CRITICAL") metrics.highRisk += 1;
    if (row.gov_status === "UNDER_INVESTIGATION") metrics.underInvestigation += 1;
    if (row.gov_status === "RESOLVED") metrics.resolved += 1;
    if (row.gov_status !== "RESOLVED" && row.gov_status !== "CLOSED") metrics.open += 1;
    const t = row.threat_category ?? "Other";
    tc.set(t, (tc.get(t) ?? 0) + 1);
    const r = row.risk_level ?? "Unset";
    rc.set(r, (rc.get(r) ?? 0) + 1);
    const s = govStatusLabel(row.gov_status);
    sc.set(s, (sc.get(s) ?? 0) + 1);
  }

  const sortDesc = (m: Map<string, number>) =>
    [...m.entries()].map(([label, count]) => ({ label, count })).sort((a, b) => b.count - a.count);

  return {
    generatedAt: new Date().toISOString(),
    window,
    filters: { stateCode: input.stateCode ?? null, districtCode: input.districtCode ?? null },
    metrics,
    threatDistribution: sortDesc(tc),
    riskDistribution: sortDesc(rc),
    statusDistribution: sortDesc(sc),
  };
}

/**
 * Distinct state/district values actually present in the scoped cases table,
 * used to build honest filter selectors (never a hard-coded region list).
 * Returns districts only for the requested state when one is given.
 */
export async function govDashboardFilterOptions(
  scope: GovScopeFilter,
  stateCode?: string | null,
): Promise<{ states: string[]; districts: string[] }> {
  if (isScopeEmpty(scope)) return { states: [], districts: [] };
  const sb = getSupabaseServer();

  const states: string[] = [];
  {
    let q = sb.from("cases").select("state_code").not("state_code", "is", null).order("state_code", { ascending: true });
    q = applyGovScopeFilter(q, scope).limit(5000);
    const { data, error } = await q;
    throwIfError(error, "Failed to load state options.");
    for (const r of (data ?? []) as Array<{ state_code: string | null }>) {
      if (r.state_code && !states.includes(r.state_code)) states.push(r.state_code);
    }
  }

  const districts: string[] = [];
  {
    let q = sb.from("cases").select("district_code").not("district_code", "is", null).order("district_code", { ascending: true });
    q = applyGovScopeFilter(q, scope);
    if (stateCode) q = q.eq("state_code", stateCode);
    q = q.limit(5000);
    const { data, error } = await q;
    throwIfError(error, "Failed to load district options.");
    for (const r of (data ?? []) as Array<{ district_code: string | null }>) {
      if (r.district_code && !districts.includes(r.district_code)) districts.push(r.district_code);
    }
  }

  return { states, districts };
}

// ---------------------------------------------------------------------------
// Phase 13 — Trends
// ---------------------------------------------------------------------------

export interface GovTrendsResult {
  rangeLabel: string;
  casesOverTime: Array<{ day: string; count: number }>;
  byStatus: Array<{ label: string; count: number }>;
  byRisk: Array<{ label: string; count: number }>;
  byThreat: Array<{ label: string; count: number }>;
  byState: Array<{ label: string; count: number }>;
  indicatorRecurrence: Array<{ value: string; type: string; cases: number; firstSeen: string | null; lastSeen: string | null }>;
  totals: { total: number; prevPeriod: number; changePct: number | null };
}

export async function govTrends(
  scope: GovScopeFilter,
  from: string,
  to: string,
  prevFrom: string,
  prevTo: string,
): Promise<GovTrendsResult> {
  if (isScopeEmpty(scope)) {
    return {
      rangeLabel: "—",
      casesOverTime: [],
      byStatus: [],
      byRisk: [],
      byThreat: [],
      byState: [],
      indicatorRecurrence: [],
      totals: { total: 0, prevPeriod: 0, changePct: null },
    };
  }

  const sb = getSupabaseServer();
  let base = sb
    .from("cases")
    .select("id,created_at,gov_status,risk_level,threat_category,state_code");
  base = applyGovScopeFilter(base, scope);
  const { data, error } = await base;
  throwIfError(error, "Failed to load trends data.");

  const rowsVec = (data ?? []) as Array<{
    id: string;
    created_at: string;
    gov_status: string;
    risk_level: string | null;
    threat_category: string | null;
    state_code: string | null;
  }>;

  const inCurrent = rowsVec.filter((r) => r.created_at >= from && r.created_at <= to);
  const inPrev = rowsVec.filter((r) => r.created_at >= prevFrom && r.created_at <= prevTo);

  const dayMap = new Map<string, number>();
  for (const r of inCurrent) {
    const day = r.created_at.slice(0, 10);
    dayMap.set(day, (dayMap.get(day) ?? 0) + 1);
  }
  const casesOverTime = [...dayMap.entries()]
    .map(([day, count]) => ({ day, count }))
    .sort((a, b) => (a.day < b.day ? -1 : 1));

  const groupOf = <K extends string>(rows: typeof rowsVec, pick: (r: (typeof rowsVec)[number]) => K) => {
    const m = new Map<K, number>();
    for (const r of rows) {
      const k = pick(r);
      m.set(k, (m.get(k) ?? 0) + 1);
    }
    return [...m.entries()].map(([label, count]) => ({ label, count })).sort((a, b) => b.count - a.count);
  };

  const prevTotal = inPrev.length;
  const changePct =
    prevTotal === 0 ? null : Math.round(((inCurrent.length - prevTotal) / prevTotal) * 100);

  // Indicator recurrence across cases in the window.
  let indicatorRecurrence: GovTrendsResult["indicatorRecurrence"] = [];
  {
    const inIds = new Set(inCurrent.map((r) => r.id));
    if (inIds.size > 0) {
      const { data: inds, error: ierr } = await sb
        .from("indicators")
        .select("value,type,case_id,created_at")
        .in("case_id", [...inIds]);
      if (!ierr) {
        const m = new Map<string, { value: string; type: string; cases: Set<string>; firstSeen: string | null; lastSeen: string | null }>();
        for (const i of (inds ?? []) as Array<{ value: string; type: string; case_id: string | null; created_at: string }>) {
          if (!i.case_id) continue;
          const key = `${i.type}|${i.value}`;
          const rec = m.get(key) ?? { value: i.value, type: i.type, cases: new Set<string>(), firstSeen: i.created_at, lastSeen: i.created_at };
          rec.cases.add(i.case_id);
          if (i.created_at < rec.firstSeen!) rec.firstSeen = i.created_at;
          if (i.created_at > rec.lastSeen!) rec.lastSeen = i.created_at;
          m.set(key, rec);
        }
        indicatorRecurrence = [...m.values()]
          .map((rec) => ({ value: rec.value, type: rec.type, cases: rec.cases.size, firstSeen: rec.firstSeen, lastSeen: rec.lastSeen }))
          .filter((rec) => rec.cases > 1)
          .sort((a, b) => b.cases - a.cases)
          .slice(0, 12);
      }
    }
  }

  return {
    rangeLabel: `${from} → ${to}`,
    casesOverTime,
    byStatus: groupOf(inCurrent, (r) => govStatusLabel(r.gov_status)),
    byRisk: groupOf(inCurrent, (r) => r.risk_level ?? "Unset"),
    byThreat: groupOf(inCurrent, (r) => r.threat_category ?? "Other"),
    byState: groupOf(inCurrent, (r) => r.state_code ?? "Unknown"),
    indicatorRecurrence,
    totals: {
      total: inCurrent.length,
      prevPeriod: prevTotal,
      changePct,
    },
  };
}

// ---------------------------------------------------------------------------
// Phase 14 — Report dataset + export record
// ---------------------------------------------------------------------------

export interface GovReportFilters {
  state?: string | null;
  district?: string | null;
  threatCategory?: string | null;
  riskLevel?: string | null;
  govStatus?: string | null;
  from?: string | null;
  to?: string | null;
}

export interface GovReportDataset {
  generatedAt: string;
  filters: GovReportFilters;
  rows: Array<{
    caseNumber: string;
    createdAt: string;
    state: string | null;
    district: string | null;
    threatCategory: string | null;
    riskLevel: string | null;
    govStatus: string;
    caseSource: string | null;
    assignedOfficer: string | null;
  }>;
  total: number;
}

export async function govReportDataset(
  scope: GovScopeFilter,
  filters: GovReportFilters,
  limit = 5000,
): Promise<GovReportDataset> {
  if (isScopeEmpty(scope)) {
    return { generatedAt: new Date().toISOString(), filters, rows: [], total: 0 };
  }
  const sb = getSupabaseServer();
  let base = sb.from("cases").select(GOV_CASE_VIEW_FIELDS, { count: "exact", head: false });
  base = applyGovScopeFilter(base, scope);
  let q = base;
  if (filters.state) q = q.eq("state_code", filters.state);
  if (filters.district) q = q.eq("district_code", filters.district);
  if (filters.threatCategory) q = q.eq("threat_category", filters.threatCategory);
  if (filters.riskLevel) q = q.eq("risk_level", filters.riskLevel);
  if (filters.govStatus) q = q.eq("gov_status", filters.govStatus);
  if (filters.from) q = q.gte("created_at", filters.from);
  if (filters.to) q = q.lte("created_at", filters.to);
  q = q.order("created_at", { ascending: false }).limit(Math.max(1, Math.min(20000, limit)));

  const { data, error, count } = await q;
  throwIfError(error, "Failed to generate report dataset.");

  const rows = ((data ?? []) as RawGovCaseRow[]).map(toGovCaseView);
  const officerIds = rows.map((r) => r.assignedOfficer?.officerId).filter((x): x is string => Boolean(x));
  const withNames = await attachAssignments(rows, await officerNameMap([...new Set(officerIds)]));

  return {
    generatedAt: new Date().toISOString(),
    filters,
    rows: withNames.map((r) => ({
      caseNumber: r.caseNumber,
      createdAt: r.createdAt,
      state: r.stateCode,
      district: r.districtCode,
      threatCategory: r.threatCategory,
      riskLevel: r.riskLevel,
      govStatus: r.govStatus,
      caseSource: r.caseSource,
      assignedOfficer: r.assignedOfficer
        ? `${r.assignedOfficer.fullName ?? ""} (${r.assignedOfficer.officerCode ?? ""})`.trim()
        : null,
    })),
    total: count ?? 0,
  };
}

export interface GovExportRecordInput {
  officerId: string;
  reportType: string;
  format: "CSV" | "PDF";
  filters: GovReportFilters;
  scopedState: string | null;
  scopedDistrict: string | null;
  rowCount: number;
  fileName: string;
  checksum: string;
}

/** Persist an export trail row in gov_report_exports (audit side-record). */
export async function recordGovExport(input: GovExportRecordInput): Promise<void> {
  const { error } = await getSupabaseServer().from("gov_report_exports").insert({
    officer_id: input.officerId,
    report_type: input.reportType,
    format: input.format,
    filters: input.filters,
    scope_snapshot: { state: input.scopedState, district: input.scopedDistrict },
    row_count: input.rowCount,
    file_name: input.fileName,
    checksum: input.checksum,
    status: "ready",
  });
  throwIfError(error, "Failed to record export.");
}

// ---------------------------------------------------------------------------
// Phase 15 — Audit log viewer
// ---------------------------------------------------------------------------

export interface GovAuditLogFilters {
  officerId?: string | null;
  action?: string | null;
  caseId?: string | null;
  from?: string | null;
  to?: string | null;
  outcome?: string | null;
  page: number;
  pageSize: number;
}

export interface GovAuditLogRow {
  id: string;
  createdAt: string;
  action: string;
  actorType: string | null;
  actorGovId: string | null;
  officerCode: string | null;
  officerRole: string | null;
  caseId: string | null;
  evidenceId: string | null;
  outcome: string | null;
  denialReason: string | null;
  permission: string | null;
  correlationId: string | null;
}

export interface GovAuditLogResult {
  rows: GovAuditLogRow[];
  total: number;
  page: number;
  pageSize: number;
}

export async function govAuditLogs(filters: GovAuditLogFilters): Promise<GovAuditLogResult> {
  const sb = getSupabaseServer();
  const page = Math.max(1, filters.page);
  const pageSize = Math.min(100, Math.max(1, filters.pageSize));

  let q = sb.from("audit_logs").select("id,created_at,action,actor_type,actor_gov_id,actor_role,actor_snapshot,case_id,resource_id,outcome,denial_reason,permission,correlation_id", { count: "exact", head: false });
  q = q.in("actor_type", ["gov_officer", "system"]);
  if (filters.officerId) q = q.eq("actor_gov_id", filters.officerId);
  if (filters.action) q = q.eq("action", filters.action);
  if (filters.caseId) q = q.eq("case_id", filters.caseId);
  if (filters.outcome) q = q.eq("outcome", filters.outcome);
  if (filters.from) q = q.gte("created_at", filters.from);
  if (filters.to) q = q.lte("created_at", filters.to);
  q = q.order("created_at", { ascending: false });
  q = q.range((page - 1) * pageSize, page * pageSize - 1);

  const { data, error, count } = await q;
  throwIfError(error, "Failed to load audit log.");

  const rows = ((data ?? []) as Array<{
    id: string;
    created_at: string;
    action: string;
    actor_type: string | null;
    actor_gov_id: string | null;
    actor_role: string | null;
    actor_snapshot: unknown;
    case_id: string | null;
    resource_id: string | null;
    outcome: string | null;
    denial_reason: string | null;
    permission: string | null;
    correlation_id: string | null;
  }>).map((r) => {
    const snap = (r.actor_snapshot ?? {}) as { officerCode?: string | null };
    return {
      id: r.id,
      createdAt: r.created_at,
      action: r.action,
      actorType: r.actor_type,
      actorGovId: r.actor_gov_id,
      officerCode: snap.officerCode ?? null,
      officerRole: r.actor_role,
      caseId: r.case_id,
      evidenceId: r.resource_id,
      outcome: r.outcome,
      denialReason: r.denial_reason,
      permission: r.permission,
      correlationId: r.correlation_id,
    };
  });

  return { rows, total: count ?? 0, page, pageSize };
}

// ---------------------------------------------------------------------------
// Officer candidates (assignment selector)
// ---------------------------------------------------------------------------

export interface GovOfficerCandidate {
  id: string;
  officerCode: string;
  fullName: string;
  role: string;
  scope: string;
  stateCode: string | null;
  districtCode: string | null;
  department: string | null;
  status: string;
}

export async function govOfficerCandidates(
  actingOfficer: Pick<GovOfficerRow, "id" | "scope" | "state_code" | "district_code">,
): Promise<GovOfficerCandidate[]> {
  const { data, error } = await getSupabaseServer()
    .from("gov_officers")
    .select("id,officer_code,full_name,role,scope,state_code,district_code,department,status")
    .eq("status", "ACTIVE")
    .order("officer_code", { ascending: true });
  throwIfError(error, "Failed to load officer candidates.");

  const candidates = ((data ?? []) as Array<{
    id: string;
    officer_code: string;
    full_name: string | null;
    role: string;
    scope: string;
    state_code: string | null;
    district_code: string | null;
    department: string | null;
    status: string;
  }>).map((o) => ({
    id: o.id,
    officerCode: o.officer_code,
    fullName: o.full_name ?? "",
    role: o.role,
    scope: o.scope,
    stateCode: o.state_code,
    districtCode: o.district_code,
    department: o.department,
    status: o.status,
  }));

  // An assigner may only assign to officers whose jurisdiction the assigner's
  // own scope covers (or to same-jurisdiction officers).
  return candidates.filter((c) => {
    switch (actingOfficer.scope) {
      case "ALL_INDIA":
        return true;
      case "STATE":
        return c.stateCode === actingOfficer.state_code;
      case "DISTRICT":
        return c.stateCode === actingOfficer.state_code && c.districtCode === actingOfficer.district_code;
      case "ASSIGNED_CASES":
        return c.id === actingOfficer.id;
    }
  });
}

// ---------------------------------------------------------------------------
// Shared audit helper
// ---------------------------------------------------------------------------

export function govOfficerAuditActor(officer: GovOfficerRow): GovAuditActor {
  return {
    kind: "gov_officer",
    officerId: officer.id,
    officerCode: officer.officer_code,
    role: officer.role,
    scope: officer.scope,
    stateCode: officer.state_code,
    districtCode: officer.district_code,
  };
}