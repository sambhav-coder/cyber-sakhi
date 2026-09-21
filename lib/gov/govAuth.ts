/**
 * Government login orchestration (Unit 3).
 *
 * Single generic failure message for unknown email, wrong password, locked
 * account, and inactive officer: callers (and attackers) cannot distinguish
 * them, so no email-existence oracle exists. A constant-time dummy bcrypt
 * comparison on the unknown-email path equalizes response timing.
 *
 * Store seams are injectable for unit testing; production defaults hit the
 * database via govCredentials/govSession helpers. No rate limiting beyond
 * the per-account lockout here: IP-based throttling is a future middleware
 * concern and is explicitly NOT implemented in this unit. No password-reset
 * flow exists in this unit by design.
 */

import bcrypt from "bcryptjs";
import type { GovOfficerContext } from "./govTypes";
import {
  findGovOfficerByEmail,
  getGovCredential,
  isGovAccountLocked,
  recordGovLoginFailure,
  resetGovLoginFailures,
  verifyGovPassword,
  type GovCredentialRow,
  type GovOfficerRow,
} from "./govCredentials";
import { createGovSession, toGovOfficerContext, type GovSessionRow } from "./govSession";

/** The ONLY login failure message surfaced for any credential/status cause. */
export const GOV_LOGIN_FAILED_MESSAGE = "Invalid credentials.";

/**
 * Precomputed valid bcrypt hash (cost 12) used solely for timing
 * equalization on the unknown-email path. Generated offline once with
 * `bcrypt.hash(<fixed dummy string>, 12)`; it verifies no real account and
 * its plaintext is unknown and irrelevant. Validity matters: bcryptjs
 * rejects malformed hashes in ~1ms without doing cost-12 work, which would
 * leave a measurable timing gap versus real password comparisons (~300ms).
 * Never log this constant alongside any account context.
 */
export const GOV_DUMMY_COMPARE_HASH =
  "$2b$12$ytnYj.kAzjD8qFSnb/kLVebgZyJlz.ZS13E7VslYGLifQiuB6eKJy";

/**
 * Perform the dummy comparison for timing equalization. Returns the bcrypt
 * result (always false for real inputs) and never throws: an unexpected
 * failure resolves false, which fails closed to the generic login error.
 */
export async function govDummyCompare(): Promise<boolean> {
  try {
    return await bcrypt.compare("dummy-timing-equalization", GOV_DUMMY_COMPARE_HASH);
  } catch {
    return false;
  }
}

export interface GovLoginStore {
  findOfficerByEmail(email: string): Promise<GovOfficerRow | null>;
  getCredential(officerId: string): Promise<GovCredentialRow | null>;
  verifyPassword(plain: string, hash: string): Promise<boolean>;
  dummyCompare(): Promise<void>;
  recordFailure(officerId: string): Promise<void>;
  resetFailures(officerId: string): Promise<void>;
  issueSession(officer: GovOfficerRow): Promise<{ token: string; session: GovSessionRow }>;
}

export const productionGovLoginStore: GovLoginStore = {
  findOfficerByEmail: (email) => findGovOfficerByEmail(email),
  getCredential: (officerId) => getGovCredential(officerId),
  verifyPassword: (plain, hash) => verifyGovPassword(plain, hash),
  dummyCompare: () => govDummyCompare().then(() => undefined),
  recordFailure: (officerId) => recordGovLoginFailure(officerId),
  resetFailures: (officerId) => resetGovLoginFailures(officerId),
  issueSession: (officer) => createGovSession(officer),
};

export type GovLoginResult =
  | { ok: true; token: string; officer: GovOfficerContext; session: GovSessionRow }
  | { ok: false; message: typeof GOV_LOGIN_FAILED_MESSAGE };

/**
 * Attempt a government login. Every failure path returns the identical
 * generic message; success returns the raw session token (set it into the
 * __Secure-gov-session cookie via govCookie helpers) plus a secret-free
 * officer context. Never logs or returns passwords, hashes, or tokens.
 */
export async function attemptGovLogin(
  email: string,
  password: string,
  store: GovLoginStore = productionGovLoginStore,
): Promise<GovLoginResult> {
  const fail = (): GovLoginResult => ({ ok: false, message: GOV_LOGIN_FAILED_MESSAGE });

  const officer = await store.findOfficerByEmail(email);
  if (officer === null) {
    await store.dummyCompare();
    return fail();
  }
  if (officer.status !== "ACTIVE") return fail();

  const credential = await store.getCredential(officer.id);
  if (credential === null) return fail();
  if (isGovAccountLocked(credential)) return fail();

  const valid = await store.verifyPassword(password, credential.password_hash);
  if (!valid) {
    await store.recordFailure(officer.id);
    return fail();
  }

  await store.resetFailures(officer.id);
  const { token, session } = await store.issueSession(officer);
  return { ok: true, token, officer: toGovOfficerContext(officer), session };
}
