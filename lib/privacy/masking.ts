/**
 * PII masking + retention policy for forensic artifacts.
 *
 * Masking is deterministic string surgery over personal data shapes (email,
 * phone, PAN, Aadhaar, account numbers, OTPs). The result keeps just enough
 * structure to be useful in an investigation ("***@example.com",
 * "+91 •••• ••44") while removing the raw PII from anything that gets
 * displayed or persisted.
 *
 * Retention policy is a pure decision helper. Raw email is treated as
 * evidence-grade data: it is retained only inside the evidence locker under
 * its chain-of-custody record, and auto-staged for deletion after the window.
 */

export type MaskMode = "partial" | "full";

export interface Redaction {
  type: "email" | "phone" | "pan" | "aadhaar" | "account" | "otp" | "url-credential";
  count: number;
}

export interface PrivacyRedaction {
  maskedSubject: string;
  maskedBodyPreview: string;
  redactions: Redaction[];
  retentionStage: RetentionStage["stage"];
  retentionExpiresAt: string | null;
}

const EMAIL_RE = /\b[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}\b/gi;
const PHONE_RE = /(?<!\d)(?:\+?91[ -]?)?[6-9]\d{9}(?!\d)/g;
// PAN: 5 letters + 4 digits + 1 letter
const PAN_RE = /\b[A-Z]{5}[0-9]{4}[A-Z]\b/g;
// Aadhaar: 12 consecutive digits (optionally space separated 4-4-4)
// Must have either space-separated format (4-4-4) or Aadhaar context
const AADHAAR_RE = /(?:aadhaar\s*:?\s*)?\b\d{4}[ ]\d{4}[ ]\d{4}\b|(?:aadhaar\s*:?\s*)\b\d{12}\b/gi;
// Bank account: 9..18 consecutive digits (heuristic, low precision)
const ACCOUNT_RE = /\b\d{11,15}\b/g;
// OTP: 4-6 digits shortly after an OTP-style keyword (bounded connector so it
// cannot reach across sentences).
const OTP_RE = /\b(otp|ocp|one[- ]?time[- ]?password)\b.{0,10}?\b(\d{4,6})\b/gi;

function maskEmail(value: string): string {
  const at = value.indexOf("@");
  if (at <= 0) return "[redacted]";
  const [user, domain] = [value.slice(0, at), value.slice(at + 1)];
  const star = user.length <= 2 ? "*".repeat(user.length) : user.slice(0, 2) + "*".repeat(Math.max(1, user.length - 2));
  return `${star}@${domain}`;
}

function maskPhone(value: string): string {
  const digits = value.replace(/\D/g, "");
  if (digits.length < 10) return "[redacted]";
  const last4 = digits.slice(-4);
  return `+91 •••••• ${last4}`;
}

export function maskPii(input: string, mode: MaskMode = "partial"): {
  text: string;
  redactions: Redaction[];
} {
  let text = input;
  const counter = new Map<Redaction["type"], number>();
  const bump = (t: Redaction["type"]) => counter.set(t, (counter.get(t) ?? 0) + 1);

  // Emails (full mode removes even the domain pattern)
  text = text.replace(EMAIL_RE, (m) => {
    bump("email");
    return mode === "full" ? "[redacted-email]" : maskEmail(m.toLowerCase());
  });

  // Phones
  text = text.replace(PHONE_RE, (m) => {
    bump("phone");
    return mode === "full" ? "[redacted-phone]" : maskPhone(m);
  });

  // PAN — six matches fully redacted (PAN is identity-grade PII)
  text = text.replace(PAN_RE, () => {
    bump("pan");
    return mode === "full" ? "[redacted-pan]" : "[redacted-pan]";
  });

  // Aadhaar — same treatment
  text = text.replace(AADHAAR_RE, () => {
    bump("aadhaar");
    return mode === "full" ? "[redacted-aadhaar]" : "[redacted-aadhaar]";
  });

  // OTP preceded by keyword
  text = text.replace(OTP_RE, (_m, key: string, digits: string) => {
    bump("otp");
    return `${key}:${mode === "full" ? " ••••" : " ••••"}`;
  });

  // Account-like runs — keep last 4 in partial mode
  text = text.replace(ACCOUNT_RE, (m) => {
    bump("account");
    return mode === "full" ? "[redacted-account]" : `•••• ${m.slice(-4)}`;
  });

  return {
    text,
    redactions: Array.from(counter.entries()).map(([type, count]) => ({ type, count })),
  };
}

export interface RetentionStage {
  stage: "active" | "review" | "expiring" | "expired";
  expiresAt: string | null;
  daysRemaining: number | null;
}

export interface RetentionPolicy {
  /** Evidence / raw artifact retention in days (default 365). */
  evidenceDays: number;
  /** Case metadata retention in days (default 730). */
  caseMetadataDays: number;
}

const DEFAULT_POLICY: RetentionPolicy = { evidenceDays: 365, caseMetadataDays: 730 };

export function retentionStageFor(
  createdAt: string,
  kind: "evidence" | "case-metadata",
  policy: RetentionPolicy = DEFAULT_POLICY
): RetentionStage {
  const created = new Date(createdAt).getTime();
  if (Number.isNaN(created)) {
    return { stage: "active", expiresAt: null, daysRemaining: null };
  }
  const days = kind === "evidence" ? policy.evidenceDays : policy.caseMetadataDays;
  const expiresAtMs = created + days * 86_400_000;
  const remaining = (expiresAtMs - Date.now()) / 86_400_000;

  if (remaining <= 0) return { stage: "expired", expiresAt: new Date(expiresAtMs).toISOString(), daysRemaining: 0 };
  if (remaining <= 30) return { stage: "expiring", expiresAt: new Date(expiresAtMs).toISOString(), daysRemaining: Math.ceil(remaining) };
  if (remaining <= 120) return { stage: "review", expiresAt: new Date(expiresAtMs).toISOString(), daysRemaining: Math.floor(remaining) };
  return { stage: "active", expiresAt: new Date(expiresAtMs).toISOString(), daysRemaining: Math.floor(remaining) };
}

export const defaultRetentionPolicy = DEFAULT_POLICY;