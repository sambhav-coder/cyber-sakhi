import crypto from "node:crypto";
import { getSupabaseServer } from "@/lib/supabaseServer";
import { throwIfError } from "@/lib/db/errors";

export const URLHAUS_SOURCE_ID = "urlhaus";
const URLHAUS_EXPORT = "https://urlhaus-api.abuse.ch/v2/files/exports";
const MAX_RECORDS = 10_000;

type UrlhausRow = {
  id?: string | number; url?: string; urlhaus_reference?: string; date_added?: string;
  dateadded?: string; url_status?: string; threat?: string; tags?: unknown;
};

function maskUrl(value: string): string {
  try {
    const u = new URL(value);
    return `${u.protocol}//${u.hostname}${u.pathname.length > 1 ? "/…" : ""}`;
  } catch { return "[invalid external URL]"; }
}
function sourceStatus(value: unknown): "ACTIVE" | "INACTIVE" | "UNKNOWN" {
  const v = String(value ?? "").toLowerCase();
  if (v === "online" || v === "active") return "ACTIVE";
  if (v === "offline" || v === "inactive") return "INACTIVE";
  return "UNKNOWN";
}

/** Fetches metadata only; it never downloads a payload or creates a case. */
export async function syncUrlhaus(initiatedBy: string | null): Promise<{ fetched: number; upserted: number }> {
  // Both names are accepted: URLHAUS_AUTH_KEY is the server-side name, while
  // the documented environment provides URLHAUS_API_KEY. Previously only the
  // former was read, so a correctly configured deployment always failed sync
  // with "not configured".
  const authKey = process.env.URLHAUS_AUTH_KEY || process.env.URLHAUS_API_KEY;
  if (!authKey) throw new Error("URLHAUS_AUTH_KEY (or URLHAUS_API_KEY) is not configured.");
  const db = getSupabaseServer();
  const now = new Date().toISOString();
  const { error: sourceError } = await db.from("gov_external_intel_sources").upsert({
    id: URLHAUS_SOURCE_ID, display_name: "URLhaus", classification: "EXTERNAL_INTELLIGENCE",
    enabled: true, last_attempt_at: now, last_error: null, updated_at: now,
  }, { onConflict: "id" });
  throwIfError(sourceError, "Unable to update external-source health.");
  const { data: log, error: logError } = await db.from("gov_external_intel_ingestions").insert({
    source_id: URLHAUS_SOURCE_ID, started_at: now, status: "RUNNING", initiated_by: initiatedBy,
  }).select("id").single();
  throwIfError(logError, "Unable to start external-intelligence ingestion.");
  if (!log?.id) throw new Error("Unable to start external-intelligence ingestion.");
  const ingestionId = log.id;
  try {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), 20_000);
    const res = await fetch(`${URLHAUS_EXPORT}/${encodeURIComponent(authKey)}/recent.json`, {
      headers: { Accept: "application/json", "User-Agent": "Cyber-Sakhi-Intel/1.0" }, signal: controller.signal, cache: "no-store",
    }).finally(() => clearTimeout(timer));
    if (!res.ok) throw new Error(`URLhaus returned HTTP ${res.status}.`);
    const raw = await res.json() as unknown;
    const rows = (Array.isArray(raw) ? raw : (raw as { urls?: unknown }).urls) as UrlhausRow[] | undefined;
    if (!Array.isArray(rows)) throw new Error("URLhaus response format was not recognized.");
    const normalized = rows.slice(0, MAX_RECORDS).flatMap((row) => {
      const value = typeof row.url === "string" ? row.url.trim() : "";
      const id = row.id === undefined ? "" : String(row.id);
      if (!value || !id || value.length > 4096) return [];
      const observed = row.date_added ?? row.dateadded ?? null;
      const observedAt = observed && !Number.isNaN(Date.parse(observed)) ? new Date(observed).toISOString() : null;
      return [{ source_id: URLHAUS_SOURCE_ID, source_record_id: id, indicator_type: "URL", indicator_value: value,
        indicator_sha256: crypto.createHash("sha256").update(value).digest("hex"), masked_value: maskUrl(value), observed_at: observedAt,
        fetched_at: now, status: sourceStatus(row.url_status), confidence: null, source_reference: row.urlhaus_reference ?? `https://urlhaus.abuse.ch/url/${id}/`,
        provenance: { provider: "URLhaus", threat: row.threat ?? null, tags: Array.isArray(row.tags) ? row.tags.slice(0, 30) : [] } }];
    });
    if (normalized.length) {
      const { error } = await db.from("gov_external_indicators").upsert(normalized, { onConflict: "source_id,source_record_id" });
      throwIfError(error, "Unable to persist external indicators.");
    }
    const finishedAt = new Date().toISOString();
    const { error } = await db.from("gov_external_intel_ingestions").update({ status: "SUCCEEDED", finished_at: finishedAt, fetched_count: rows.length, upserted_count: normalized.length }).eq("id", ingestionId);
    throwIfError(error, "Unable to finalize ingestion log.");
    await db.from("gov_external_intel_sources").update({ last_success_at: finishedAt, last_error: null, updated_at: finishedAt }).eq("id", URLHAUS_SOURCE_ID);
    return { fetched: rows.length, upserted: normalized.length };
  } catch (cause) {
    const message = cause instanceof Error ? cause.message.slice(0, 500) : "Unknown ingestion failure.";
    await db.from("gov_external_intel_ingestions").update({ status: "FAILED", finished_at: new Date().toISOString(), error_code: "URLHAUS_SYNC_FAILED", error_detail: message }).eq("id", ingestionId);
    await db.from("gov_external_intel_sources").update({ last_error: message, updated_at: new Date().toISOString() }).eq("id", URLHAUS_SOURCE_ID);
    throw cause;
  }
}

export async function externalIntelSummary() {
  const db = getSupabaseServer();
  const { data, error } = await db.from("gov_external_intel_sources").select("id,display_name,enabled,last_success_at,last_attempt_at,last_error").order("display_name");
  throwIfError(error, "External-intelligence store unavailable. Apply gov_external_intelligence.sql first.");
  return { classification: "EXTERNAL_INTELLIGENCE", notCases: true, sources: data ?? [] };
}

/** Curated, masked analyst view. Raw URLs remain server-side for correlation only. */
export async function listExternalIndicators(limit = 50) {
  const db = getSupabaseServer();
  const { data, error } = await db.from("gov_external_indicators")
    .select("id,source_id,source_record_id,indicator_type,masked_value,observed_at,fetched_at,status,confidence,source_reference")
    .order("fetched_at", { ascending: false }).limit(Math.min(100, Math.max(1, limit)));
  throwIfError(error, "External-intelligence store unavailable. Apply gov_external_intelligence.sql first.");
  return { classification: "EXTERNAL_INTELLIGENCE", notCases: true, indicators: data ?? [] };
}
