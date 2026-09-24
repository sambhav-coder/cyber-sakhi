/**
 * Government credential helpers (Unit 3).
 *
 * Covers: officer email normalization (TEXT + lower() unique index, no
 * citext), bcrypt password hashing at cost 12 (survivor stack uses cost 10;
 * verification is cost-agnostic), and account-lockout evaluation.
 *
 * Lockout constants double as the documented rate-limit posture for login:
 * per-account failures are tracked in gov_credentials; IP-based throttling
 * remains a future middleware concern and is NOT implemented here.
 * No password-reset flow exists in this unit by design.
 */

import bcrypt from "bcryptjs";
import { getSupabaseServer } from "@/lib/supabaseServer";
import { isUniqueViolation, throwIfError } from "@/lib/db/errors";
import { normalizeGovOfficerCode } from "./govOfficerCode";
import type {
  GovOfficerStatus,
  GovRole,
  GovScope,
} from "./govTypes";

/** bcrypt cost factor for government credentials (survivor stack: 10). */
export const GOV_BCRYPT_COST = 12;

/** Failed-login attempts before lockout. */
export const GOV_MAX_FAILED_ATTEMPTS = 5;

/** Lockout duration after the attempt budget is exhausted (15 minutes). */
export const GOV_LOCKOUT_MS = 15 * 60 * 1000;

/** Database row shape for public.gov_officers (snake_case, no secrets). */
export interface GovOfficerRow {
  id: string;
  officer_code: string;
  full_name: string;
  official_email: string;
  official_phone: string | null;
  role: GovRole;
  status: GovOfficerStatus;
  department: string | null;
  scope: GovScope;
  state_code: string | null;
  district_code: string | null;
  session_version: number;
  created_at: string;
  updated_at: string;
  last_login_at: string | null;
  created_by: string | null;
  deactivated_at: string | null;
  deactivated_by: string | null;
  deactivation_reason: string | null;
}

/** Database row shape for public.gov_credentials (never sent to clients). */
export interface GovCredentialRow {
  officer_id: string;
  password_hash: string;
  password_updated_at: string;
  must_rotate: boolean;
  cred_status: "ACTIVE" | "LOCKED" | "EXPIRED" | "REVOKED";
  failed_attempts: number;
  locked_until: string | null;
  created_at: string;
  updated_at: string;
}

/** Trim + lowercase normalization applied before storage and lookup. */
export function normalizeGovEmail(email: string): string {
  return email.toLowerCase().trim();
}

/** Hash a government password at the mandated cost factor. */
export async function hashGovPassword(password: string): Promise<string> {
  return bcrypt.hash(password, GOV_BCRYPT_COST);
}

/** Constant-time (bcrypt) password verification. */
export async function verifyGovPassword(
  plainPassword: string,
  passwordHash: string,
): Promise<boolean> {
  return bcrypt.compare(plainPassword, passwordHash);
}

/**
 * Pure lockout evaluation: locked when cred_status is LOCKED/REVOKED, or
 * when failed_attempts reached the budget and locked_until is in the future.
 * Returns false for expired locks so the next attempt may proceed.
 */
export function isGovAccountLocked(
  credential: Pick<GovCredentialRow, "cred_status" | "failed_attempts" | "locked_until">,
  nowMs: number = Date.now(),
): boolean {
  if (credential.cred_status === "LOCKED" || credential.cred_status === "REVOKED") {
    return true;
  }
  if (credential.failed_attempts < GOV_MAX_FAILED_ATTEMPTS) return false;
  if (credential.locked_until === null) return false;
  return new Date(credential.locked_until).getTime() > nowMs;
}

/** Compute locked_until for a fresh lockout starting now. */
export function govLockoutUntil(nowMs: number = Date.now()): string {
  return new Date(nowMs + GOV_LOCKOUT_MS).toISOString();
}

export async function findGovOfficerByEmail(
  email: string,
): Promise<GovOfficerRow | null> {
  const { data, error } = await getSupabaseServer()
    .from("gov_officers")
    .select("*")
    .eq("official_email", normalizeGovEmail(email))
    .maybeSingle();

  if (error && error.code === "PGRST116") return null;
  throwIfError(error, "Failed to look up government officer.");
  return (data as GovOfficerRow | null) ?? null;
}

/**
 * Find an officer by Officer ID (`officer_code`). The input is normalized
 * toward canonical form first; the match is case-insensitive so legacy
 * codes issued before the canonical format keep working. Returns null for
 * unknown codes — callers must surface the single generic login failure.
 */
export async function findGovOfficerByCode(
  code: string,
): Promise<GovOfficerRow | null> {
  const normalized = normalizeGovOfficerCode(code);
  if (!normalized) return null;
  const { data, error } = await getSupabaseServer()
    .from("gov_officers")
    .select("*")
    .ilike("officer_code", normalized)
    .maybeSingle();

  if (error && error.code === "PGRST116") return null;
  throwIfError(error, "Failed to look up government officer.");
  return (data as GovOfficerRow | null) ?? null;
}

export async function getGovCredential(
  officerId: string,
): Promise<GovCredentialRow | null> {
  const { data, error } = await getSupabaseServer()
    .from("gov_credentials")
    .select("*")
    .eq("officer_id", officerId)
    .maybeSingle();

  if (error && error.code === "PGRST116") return null;
  throwIfError(error, "Failed to look up government credential.");
  return (data as GovCredentialRow | null) ?? null;
}

export interface GovFailurePatch {
  failed_attempts: number;
  locked_until: string | null;
  updated_at: string;
}

/**
 * Pure builder for the failed-login patch. Clamps non-finite or negative
 * stored counters to zero so the result can never reduce the count below
 * one failed attempt and never produces NaN/negative values. Sets
 * locked_until exactly when the budget is exhausted.
 */
export function buildGovFailurePatch(
  currentAttempts: number,
  nowMs: number = Date.now(),
): GovFailurePatch {
  const safe = Number.isFinite(currentAttempts)
    ? Math.max(0, Math.floor(currentAttempts))
    : 0;
  const attempts = safe + 1;
  return {
    failed_attempts: attempts,
    locked_until: attempts >= GOV_MAX_FAILED_ATTEMPTS ? govLockoutUntil(nowMs) : null,
    updated_at: new Date(nowMs).toISOString(),
  };
}

/**
 * Record a failed login: increment the counter and, on exhausting the
 * budget, set locked_until.
 *
 * Concurrency note (best-effort, NOT atomic): Supabase JS exposes no
 * atomic increment outside SQL/RPC, so this is read-then-write. Two
 * simultaneous failures may both read N and both write N+1, losing one
 * increment. Failure direction is safe: lockout can only trigger late,
 * never early, and the count can never decrease. IP-based throttling
 * (future middleware) is the backstop for high-rate attacks.
 */
export async function recordGovLoginFailure(officerId: string): Promise<void> {
  const client = getSupabaseServer();
  const { data: current, error: readError } = await client
    .from("gov_credentials")
    .select("failed_attempts")
    .eq("officer_id", officerId)
    .maybeSingle();

  throwIfError(readError, "Failed to read government credential.");
  const patch = buildGovFailurePatch(
    (current as { failed_attempts: number } | null)?.failed_attempts ?? 0,
  );
  const { error } = await client
    .from("gov_credentials")
    .update(patch)
    .eq("officer_id", officerId);
  throwIfError(error, "Failed to record government login failure.");
}

/** Reset failure counters after a successful login. */
export async function resetGovLoginFailures(officerId: string): Promise<void> {
  const { error } = await getSupabaseServer()
    .from("gov_credentials")
    .update({
      failed_attempts: 0,
      locked_until: null,
      updated_at: new Date().toISOString(),
    })
    .eq("officer_id", officerId);
  throwIfError(error, "Failed to reset government login failures.");
}

/** True when a duplicate key violation targeted the officer identity. */
export function isGovDuplicateOfficer(error: { code?: string } | null): boolean {
  return isUniqueViolation(error);
}
