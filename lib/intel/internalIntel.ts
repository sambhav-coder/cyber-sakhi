/**
 * Internal Cyber-Sakhi intelligence (Phase 8): the application's own
 * database as a first-class source.
 *
 * For an indicator, searches the caller's OWN prior indicators
 * (user-scoped: created_by = userId) plus linked case references, and
 * reports: previously observed, case count, first/last observed, related
 * case ids, source context. Never a maliciousness verdict on its own —
 * recurrence is correlation context.
 *
 * Role semantics are explicit: sender/recipient/reporter/victim/email
 * addresses are matched as CONTACT context, never auto-malicious. An
 * email address appearing in many cases is evidence of contact, not of
 * guilt; verdict stays UNKNOWN unless a stored malicious flag says so.
 */

import { getSupabaseServer } from "@/lib/supabaseServer";
import {
  emptyIntel,
  type IndicatorQuery,
  type NormalizedThreatIntel,
  type ProviderHealth,
} from "./providers";

export const INTERNAL_PROVIDER = "Cyber-Sakhi DB";

export interface InternalIntelDetail {
  previouslyObserved: boolean;
  caseCount: number;
  investigationCount: number;
  firstObserved: string | null;
  lastObserved: string | null;
  relatedCaseIds: string[];
  storedMalicious: boolean | null;
  roleContext: string;
}

function roleContextFor(type: string, source: string | null): string {
  const s = (source ?? "").toLowerCase();
  if (type === "email") {
    if (s.includes("sender") || s.includes("from")) return "sender";
    if (s.includes("recipient") || s.includes("to")) return "recipient";
    if (s.includes("reply")) return "reply-to";
    return "contact";
  }
  if (type === "ip" && s.includes("received")) return "smtp-relay";
  return "ioc";
}

/**
 * Search the user's own intelligence history for this indicator value.
 * userId scopes the query: users only ever see their own cases. Never
 * throws — DB failure becomes UPSTREAM_ERROR, never "not seen".
 */
export async function lookupInternalIntel(
  query: IndicatorQuery,
  userId: string | null,
): Promise<NormalizedThreatIntel & { internal?: InternalIntelDetail }> {
  if (!userId) {
    return emptyIntel(INTERNAL_PROVIDER, "INTERNAL_DB", query, "NOT_CONFIGURED", "No user scope for internal lookup.");
  }

  let rows: Array<{
    case_id: string | null;
    investigation_id: string | null;
    malicious: boolean | null;
    source: string | null;
    created_at: string;
  }>;
  try {
    const db = getSupabaseServer();
    // Ownership lives on the parents (indicators carry no created_by):
    // collect the caller's investigation + case ids first, then match
    // indicators strictly inside them. Capped — history beyond the cap is
    // reported as CONNECTED_EMPTY for the tail, never another user's rows.
    const SCOPE_CAP = 2000;
    const [invRes, caseRes] = await Promise.all([
      db.from("email_investigations").select("id").eq("created_by", userId).order("created_at", { ascending: false }).limit(SCOPE_CAP),
      db.from("cases").select("id").eq("created_by", userId).order("created_at", { ascending: false }).limit(SCOPE_CAP),
    ]);
    if (invRes.error || caseRes.error) {
      return emptyIntel(INTERNAL_PROVIDER, "INTERNAL_DB", query, "UPSTREAM_ERROR", "Internal intelligence store unavailable.");
    }
    const invIds = ((invRes.data ?? []) as Array<{ id: string }>).map((r) => r.id);
    const caseIds = ((caseRes.data ?? []) as Array<{ id: string }>).map((r) => r.id);
    if (invIds.length === 0 && caseIds.length === 0) {
      return {
        ...emptyIntel(INTERNAL_PROVIDER, "INTERNAL_DB", query, "CONNECTED_EMPTY", "No prior history to compare against."),
        internal: {
          previouslyObserved: false,
          caseCount: 0,
          investigationCount: 0,
          firstObserved: null,
          lastObserved: null,
          relatedCaseIds: [],
          storedMalicious: null,
          roleContext: roleContextFor(query.indicatorType, null),
        },
      };
    }
    let q = db
      .from("indicators")
      .select("case_id,investigation_id,malicious,source,created_at")
      .eq("type", query.indicatorType)
      .ilike("value", query.indicator)
      .order("created_at", { ascending: true })
      .limit(100);
    // Scope predicate: inside the caller's investigations OR cases.
    // (uuid columns: PostgREST in-lists take bare UUIDs.)
    const clauses: string[] = [];
    if (invIds.length > 0) clauses.push(`investigation_id.in.(${invIds.join(",")})`);
    if (caseIds.length > 0) clauses.push(`case_id.in.(${caseIds.join(",")})`);
    q = q.or(clauses.join(","));
    const { data, error } = await q;
    if (error) {
      return emptyIntel(INTERNAL_PROVIDER, "INTERNAL_DB", query, "UPSTREAM_ERROR", "Internal intelligence store unavailable.");
    }
    rows = (data ?? []) as typeof rows;
  } catch {
    return emptyIntel(INTERNAL_PROVIDER, "INTERNAL_DB", query, "UPSTREAM_ERROR", "Internal intelligence lookup failed.");
  }

  if (rows.length === 0) {
    return {
      ...emptyIntel(INTERNAL_PROVIDER, "INTERNAL_DB", query, "CONNECTED_EMPTY", "Not previously observed in your history."),
      internal: {
        previouslyObserved: false,
        caseCount: 0,
        investigationCount: 0,
        firstObserved: null,
        lastObserved: null,
        relatedCaseIds: [],
        storedMalicious: null,
        roleContext: roleContextFor(query.indicatorType, null),
      },
    };
  }

  const caseIds = [...new Set(rows.map((r) => r.case_id).filter((c): c is string => Boolean(c)))];
  const invIds = [...new Set(rows.map((r) => r.investigation_id).filter((c): c is string => Boolean(c)))];
  const maliciousFlags = rows.map((r) => r.malicious).filter((m): m is boolean => m !== null);
  const storedMalicious = maliciousFlags.length > 0 ? maliciousFlags.some(Boolean) : null;
  const detail: InternalIntelDetail = {
    previouslyObserved: true,
    caseCount: caseIds.length,
    investigationCount: invIds.length,
    firstObserved: rows[0]?.created_at ?? null,
    lastObserved: rows[rows.length - 1]?.created_at ?? null,
    relatedCaseIds: caseIds,
    storedMalicious,
    roleContext: roleContextFor(query.indicatorType, rows[0]?.source ?? null),
  };

  return {
    indicator: query.indicator,
    indicatorType: query.indicatorType,
    provider: INTERNAL_PROVIDER,
    sourceKind: "INTERNAL_DB",
    status: "CONNECTED_DATA",
    // Recurrence is context. Only an explicit stored malicious flag from a
    // prior analyst verdict carries over — mere frequency never does.
    verdict: storedMalicious === true ? "MALICIOUS" : "UNKNOWN",
    confidence: null,
    threatType: null,
    malwareFamily: null,
    firstSeen: detail.firstObserved,
    lastSeen: detail.lastObserved,
    reference: null,
    rawSourceId: null,
    sourceUrl: null,
    fetchedAt: new Date().toISOString(),
    detail: `Seen before in ${caseIds.length} case(s), ${invIds.length} investigation(s) as ${detail.roleContext}; frequency is contact context, not a verdict.`,
    internal: detail,
  };
}

/** Health: can we reach the indicators table at all (no rows read). */
export async function internalIntelHealth(userId: string | null): Promise<ProviderHealth> {
  const started = Date.now();
  if (!userId) {
    return {
      name: INTERNAL_PROVIDER,
      configured: true,
      status: "NOT_CONFIGURED",
      lastCheckedAt: new Date().toISOString(),
      latencyMs: null,
      detail: "No user scope for health check.",
    };
  }
  try {
    const { error } = await getSupabaseServer().from("indicators").select("id", { count: "exact", head: true }).limit(1);
    if (error) throw error;
    return {
      name: INTERNAL_PROVIDER,
      configured: true,
      status: "CONNECTED_EMPTY",
      lastCheckedAt: new Date().toISOString(),
      latencyMs: Date.now() - started,
      detail: "Internal store reachable.",
    };
  } catch {
    return {
      name: INTERNAL_PROVIDER,
      configured: true,
      status: "UPSTREAM_ERROR",
      lastCheckedAt: new Date().toISOString(),
      latencyMs: Date.now() - started,
      detail: "Internal intelligence store unavailable.",
    };
  }
}
