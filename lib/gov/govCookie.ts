/**
 * Government session cookie contract (Unit 3).
 *
 * Approved architecture: cookie `__Secure-gov-session`, `Path=/gov`,
 * government APIs under `/gov/api/*` so the browser delivers the cookie to
 * every government endpoint and to no public endpoint.
 *
 * Pure string builders only: no dependency on next/headers, so the contract
 * is unit-testable and usable from any route handler via
 * `NextResponse.cookies.set(name, value, attributes)`.
 *
 * Security contract (all normative):
 * - `Secure` is ALWAYS true, including local development. The `__Secure-`
 *   prefix is rejected by browsers without it, so `Secure=false` is never
 *   emitted and no fallback cookie name exists. Local development uses
 *   http://localhost, where Secure cookies are accepted.
 * - HttpOnly, SameSite=Lax, no Domain attribute, Path exactly `/gov`.
 * - Raw session IDs never appear in URLs, request bodies, logs, or responses
 *   other than the single Set-Cookie header.
 */

export const GOV_SESSION_COOKIE_NAME = "__Secure-gov-session";
export const GOV_SESSION_COOKIE_PATH = "/gov";
export const GOV_SESSION_COOKIE_SAME_SITE = "lax" as const;

export interface GovSessionCookieAttributes {
  readonly name: string;
  readonly path: string;
  readonly httpOnly: boolean;
  readonly secure: boolean;
  readonly sameSite: "lax";
  /** Max age in seconds; capped at the absolute session TTL. */
  readonly maxAge: number;
}

/** Absolute session TTL in seconds (12 hours). */
export const GOV_SESSION_MAX_AGE_SECONDS = 12 * 60 * 60;

/** Canonical cookie attributes for setting the government session cookie. */
export function govSessionCookieAttributes(): GovSessionCookieAttributes {
  return {
    name: GOV_SESSION_COOKIE_NAME,
    path: GOV_SESSION_COOKIE_PATH,
    httpOnly: true,
    secure: true,
    sameSite: GOV_SESSION_COOKIE_SAME_SITE,
    maxAge: GOV_SESSION_MAX_AGE_SECONDS,
  };
}

/** Header value fragment validator: non-empty token without cookie delimiters. */
export function isValidGovSessionCookieValue(value: string): boolean {
  return value.length > 0 && !/[;\s,]/.test(value);
}

/**
 * Read the government session token from a raw `Cookie` request header.
 * Returns the token when exactly one well-formed `__Secure-gov-session`
 * value is present, otherwise null. Pure: no I/O, no trust beyond the
 * returned string, which callers must validate via hash lookup.
 */
export function parseGovSessionCookieHeader(header: string | null | undefined): string | null {
  if (!header) return null;
  let found: string | null = null;
  for (const part of header.split(";")) {
    const index = part.indexOf("=");
    if (index < 0) continue;
    const name = part.slice(0, index).trim();
    if (name !== GOV_SESSION_COOKIE_NAME) continue;
    const value = part.slice(index + 1).trim();
    if (!isValidGovSessionCookieValue(value)) return null;
    if (found !== null) return null;
    found = value;
  }
  return found;
}

/** Attributes for clearing the cookie on logout/revocation (same path!). */
export function govSessionClearCookieAttributes(): GovSessionCookieAttributes {
  return { ...govSessionCookieAttributes(), maxAge: 0 };
}
