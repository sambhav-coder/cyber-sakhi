/**
 * Per-report seal store (server-only).
 *
 * A seal is a bcrypt hash of a report-specific password, one row per case
 * in public.gov_report_seals (see supabase/migrations/gov_report_seals.sql).
 * Plaintext passwords are never stored, logged, or returned by this module.
 *
 * Availability contract: the migration is applied out-of-band. When the
 * table does not exist yet, reads report { status: "store_unavailable" }
 * and writes throw GovSealStoreUnavailable — callers must degrade to
 * access-control-only behavior and say so, never accept a password against
 * nothing and never claim encryption that is not there.
 */

import { getSupabaseServer } from "@/lib/supabaseServer";

export interface GovReportSeal {
  caseId: string;
  passwordHash: string;
  setBy: string | null;
  createdAt: string;
  updatedAt: string;
}

export type GovSealReadResult =
  | { status: "sealed"; seal: GovReportSeal }
  | { status: "unsealed" }
  | { status: "store_unavailable" };

export class GovSealStoreUnavailable extends Error {
  constructor() {
    super("Report seal store is not provisioned.");
    this.name = "GovSealStoreUnavailable";
  }
}

/** PostgREST/Postgres codes meaning "relation does not exist (yet)". */
function isMissingTable(error: unknown): boolean {
  if (!error || typeof error !== "object") return false;
  const code = (error as { code?: unknown }).code;
  return code === "PGRST205" || code === "42P01";
}

interface SealRow {
  case_id: string;
  password_hash: string;
  set_by: string | null;
  created_at: string;
  updated_at: string;
}

function toSeal(row: SealRow): GovReportSeal {
  return {
    caseId: row.case_id,
    passwordHash: row.password_hash,
    setBy: row.set_by,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

export async function readGovReportSeal(caseId: string): Promise<GovSealReadResult> {
  const sb = getSupabaseServer();
  const { data, error } = await sb
    .from("gov_report_seals")
    .select("case_id,password_hash,set_by,created_at,updated_at")
    .eq("case_id", caseId)
    .maybeSingle();
  if (error) {
    if (isMissingTable(error)) return { status: "store_unavailable" };
    // PGRST116 (0 rows with .single()) cannot occur with maybeSingle; any
    // other error is a genuine backend failure the caller must surface.
    throw new Error("Failed to read report seal.");
  }
  if (!data) return { status: "unsealed" };
  return { status: "sealed", seal: toSeal(data as SealRow) };
}

export async function upsertGovReportSeal(
  caseId: string,
  passwordHash: string,
  setBy: string | null,
): Promise<GovReportSeal> {
  const sb = getSupabaseServer();
  const { data, error } = await sb
    .from("gov_report_seals")
    .upsert(
      {
        case_id: caseId,
        password_hash: passwordHash,
        set_by: setBy,
        updated_at: new Date().toISOString(),
      },
      { onConflict: "case_id" },
    )
    .select("case_id,password_hash,set_by,created_at,updated_at")
    .maybeSingle();
  if (error) {
    if (isMissingTable(error)) throw new GovSealStoreUnavailable();
    throw new Error("Failed to store report seal.");
  }
  if (!data) throw new Error("Failed to store report seal.");
  return toSeal(data as SealRow);
}
