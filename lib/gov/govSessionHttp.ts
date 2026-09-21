/**
 * Extract and validate a government session from an incoming Request.
 * Shared by every /gov/api/* route handler; full permission and scope
 * enforcement is layered on top by lib/gov/govAuthorization in Phase 3.
 */

import { parseGovSessionCookieHeader } from "./govCookie";
import {
  validateGovSessionToken,
  type GovSessionEvaluation,
} from "./govSession";

export interface GovRequestAuth {
  /** The raw opaque token, present on the request only after validation. */
  token: string | null;
  evaluation: GovSessionEvaluation;
}

/**
 * Read the __Secure-gov-session cookie and validate it fully (hash lookup,
 * revocation, expiry, idle timeout, officer status, session_version).
 * An absent or malformed cookie yields an invalid evaluation, never throws.
 */
export async function getGovRequestAuth(
  req: Request,
  nowMs: number = Date.now(),
): Promise<GovRequestAuth> {
  const token = parseGovSessionCookieHeader(req.headers.get("cookie"));
  if (!token) {
    return { token: null, evaluation: { valid: false, reason: "not_found" } };
  }
  const evaluation = await validateGovSessionToken(token, nowMs);
  return { token, evaluation };
}