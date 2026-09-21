/**
 * Shared HTTP helpers for the government API surface (under /gov/api/*).
 *
 * Response envelope: every error is
 *   { "error": { "code": <MACHINE_CODE>, "message": <human string> } }
 * Codes are stable so client logic can branch; messages are what users read.
 */

import { NextResponse } from "next/server";

export interface GovApiErrorBody {
  error: { code: string; message: string };
}

export function govJsonOk<T>(data: T): NextResponse {
  return NextResponse.json(data);
}

export function govJsonError(status: number, code: string, message: string): NextResponse {
  return NextResponse.json({ error: { code, message } } satisfies GovApiErrorBody, {
    status,
  });
}

export function govUnauthorized(
  code = "UNAUTHORIZED",
  message = "Unauthorized.",
): NextResponse {
  return govJsonError(401, code, message);
}

export function govForbidden(
  code = "FORBIDDEN",
  message = "Access denied.",
): NextResponse {
  return govJsonError(403, code, message);
}

/**
 * Client IP from proxy headers: first `x-forwarded-for` hop, else
 * `x-real-ip`, else null. Values are sanity-filtered (IPv4/IPv6-ish charset
 * only) so attacker-controlled headers cannot smuggle newlines or abuse the
 * audit sink's character expectations.
 */
export function getClientIp(req: Request): string | null {
  const forwardHeader = req.headers.get("x-forwarded-for");
  if (forwardHeader) {
    const first = forwardHeader.split(",")[0]?.trim();
    if (first && /^[A-Za-z0-9:.%[\]\-]+$/.test(first)) return first;
    return null;
  }
  const realHeader = req.headers.get("x-real-ip");
  if (realHeader) {
    const trimmed = realHeader.trim();
    if (/^[A-Za-z0-9:.%[\]\-]+$/.test(trimmed)) return trimmed;
  }
  return null;
}

/** User-Agent, capped for storage in gov_sessions/audit_logs. */
export function getUserAgent(req: Request): string | null {
  const ua = req.headers.get("user-agent");
  return ua ? ua.slice(0, 300) : null;
}

/**
 * CSRF posture for state-changing endpoints. The gov session cookie is
 * SameSite=Lax, so cross-site POSTs carry no cookie and are already blocked.
 * Defense-in-depth: refuse a request whose Origin header is present but does
 * not match the request Host. Requests with no Origin header (CLI, first-
 * party GET-style navigations) are accepted; browsers send Origin on POST.
 */
export function isCrossOriginRequest(req: Request): boolean {
  const origin = req.headers.get("origin");
  if (!origin) return false;
  // The Host header is authoritative on the wire; when a runtime does not
  // expose it (undici synthesizes the host from the request URL instead),
  // fall back to the request URL so same-origin checks behave identically.
  const host = req.headers.get("host") ?? new URL(req.url).host;
  try {
    return new URL(origin).host !== host;
  } catch {
    return true;
  }
}