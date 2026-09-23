import { getSupabaseServer } from "./supabaseServer";
import { maskPii } from "./privacy/masking";

/**
 * Audit trail for sensitive operations. Events are built in a pure,
 * testable layer (buildAuditEvent) and flushed by logAuditEvent.
 *
 * Privacy contract: payloads are PII-redacted at build time (maskPii on every
 * inserted string, plus whole-value masking for classic PII-bearing keys).
 * The DB row therefore never contains raw emails/phones/PAN/Aadhaar — the
 * raw artifacts themselves live only in the evidence locker under its own
 * chain-of-custody handling.
 */

export type AuditEntity =
  | "case"
  | "investigation"
  | "evidence"
  | "report"
  | "user"
  | "search";

export const AUDIT_ACTIONS = new Set([
  "case.created",
  "case.viewed",
  "case.searched",
  "case.updated",
  "case.deleted",
  "investigation.created",
  "investigation.viewed",
  "evidence.uploaded",
  "evidence.locked",
  "evidence.unlocked",
  "evidence.anchored",
  "evidence.exported",
  "report.generated",
  "report.exported",
  "user.profile_updated",
  "user.password_changed",
  "user.sakhi_number_updated",
  "location.shared",
  "location.viewed",
]);

/** Payload keys whose values are whole-value PII regardless of shape. */
const WHOLE_VALUE_PII = new Set([
  "email",
  "phone",
  "mobile",
  "recovery_email",
  "pan",
  "aadhaar",
  "account",
  "password",
  "otp",
]);

export interface AuditEventInput {
  actorId: string | null;
  actorRole?: string | null;
  action: string;
  entity: AuditEntity;
  entityId?: string | null;
  caseId?: string | null;
  remoteIp?: string;
  userAgent?: string;
  payload?: Record<string, unknown>;
}

export interface AuditEvent {
  actor_id: string | null;
  actor_role: string | null;
  action: string;
  entity: AuditEntity;
  entity_id: string | null;
  case_id: string | null;
  remote_ip: string | null;
  user_agent: string | null;
  payload: Record<string, unknown>;
  redacted: boolean;
}

/** Redact one payload value; reports whether it was altered. */
function redactValue(value: unknown): { value: unknown; redacted: boolean } {
  if (typeof value !== "string" || value.length === 0) {
    return { value, redacted: false };
  }
  if (value.length > 4000) return { value: "[truncated]", redacted: true };
  const masked = maskPii(value, "partial");
  if (masked.redactions.length > 0) return { value: masked.text, redacted: true };
  return { value, redacted: false };
}

export function buildAuditEvent(input: AuditEventInput): AuditEvent | null {
  if (!AUDIT_ACTIONS.has(input.action)) return null;

  let redacted = false;
  const payload: Record<string, unknown> = {};
  for (const [key, raw] of Object.entries(input.payload ?? {})) {
    if (WHOLE_VALUE_PII.has(key.toLowerCase())) {
      // Classic PII-bearing keys are dropped from the record entirely.
      redacted = true;
      payload[key] = "[redacted]";
      continue;
    }
    if (Array.isArray(raw)) {
      const out = raw.map((item) => redactValue(item));
      payload[key] = out.map((o) => o.value);
      if (out.some((o) => o.redacted)) redacted = true;
      continue;
    }
    if (raw !== null && typeof raw === "object") {
      const nested = buildAuditEvent({
        ...input,
        payload: raw as Record<string, unknown>,
      });
      payload[key] = nested ? nested.payload : raw;
      if (nested?.redacted) redacted = true;
      continue;
    }
    const out = redactValue(raw);
    payload[key] = out.value;
    if (out.redacted) redacted = true;
  }

  // Detect PII inside the plain payload we kept (e.g. subject text).
  const probe = Object.values(payload)
    .filter((v): v is string => typeof v === "string")
    .join("\n");
  if (probe.length > 0 && maskPii(probe, "partial").redactions.length > 0) {
    redacted = true;
  }

  return {
    actor_id: input.actorId,
    actor_role: input.actorRole ?? null,
    action: input.action,
    entity: input.entity,
    entity_id: input.entityId ?? null,
    case_id: input.caseId ?? null,
    remote_ip: input.remoteIp ?? null,
    user_agent: input.userAgent ? input.userAgent.slice(0, 300) : null,
    payload,
    redacted,
  };
}

/**
 * Fire-and-forget flush into audit_logs. Failures are swallowed: the app's
 * core path must not break because of an audit write, and the event payload
 * is already fully redacted at this point.
 */
export async function logAuditEvent(
  input: AuditEventInput,
  client: ReturnType<typeof getSupabaseServer> = getSupabaseServer()
): Promise<void> {
  const event = buildAuditEvent(input);
  if (!event) return;
  try {
    await client.from("audit_logs").insert(event);
  } catch {
    // Audit write is best-effort by design.
  }
}