import { createHmac } from "crypto";
import type { IndicatorType } from "./constants";

/* ------------------------------------------------------------------ *
 * Keyed fingerprints — SERVER ONLY.
 *
 * Why not plain SHA-256: there are only ~10^10 Indian mobile numbers, so
 * an unkeyed hash of one can be reversed by hashing every number, which
 * takes minutes on a laptop. The same holds for common UPI handles.
 * HMAC with a secret that never leaves the server means a leaked table
 * of fingerprints cannot be turned back into phone numbers without also
 * stealing the key.
 *
 * Every fingerprint is domain-separated by its type, so a phone number
 * and a handle that happen to share characters can never collide.
 * ------------------------------------------------------------------ */

const DEV_FALLBACK_PEPPER =
  "cyber-sakhi-dev-only-pepper-never-use-this-outside-a-local-machine";

let warned = false;

function pepper(): string {
  const configured = process.env.OFFENDER_NETWORK_PEPPER;
  if (configured && configured.length >= 32) return configured;

  if (process.env.NODE_ENV === "production") {
    throw new Error(
      "OFFENDER_NETWORK_PEPPER must be set to a secret of at least 32 characters in production."
    );
  }

  if (!warned) {
    warned = true;
    console.warn(
      "[Sakhi Network] OFFENDER_NETWORK_PEPPER is not set; using a development-only key."
    );
  }
  return DEV_FALLBACK_PEPPER;
}

function hmac(input: string): string {
  return createHmac("sha256", pepper()).update(input, "utf8").digest("hex");
}

export function hashIndicator(type: IndicatorType, normalizedValue: string): string {
  return hmac(`indicator:${type}:${normalizedValue}`);
}

/** Lets reports be counted per account without storing who the account is. */
export function hashReporter(reporterId: string): string {
  return hmac(`reporter:${reporterId}`);
}
