import { getSupabaseServer } from "@/lib/supabaseServer";
import { throwIfError, DatabaseError } from "./errors";
import type { ChainOfCustodyRow } from "./types";
import { computeSha256 } from "@/lib/encryption";

export async function listChainOfCustody(
  evidenceId: string
): Promise<ChainOfCustodyRow[]> {
  const { data, error } = await getSupabaseServer()
    .from("chain_of_custody")
    .select("*")
    .eq("evidence_id", evidenceId)
    .order("created_at", { ascending: true });

  throwIfError(error, "Failed to list chain of custody.");
  return (data || []) as ChainOfCustodyRow[];
}

export async function countCustodyByEvidence(
  evidenceIds: string[]
): Promise<Record<string, number>> {
  if (evidenceIds.length === 0) return {};
  const { data, error } = await getSupabaseServer()
    .from("chain_of_custody")
    .select("evidence_id")
    .in("evidence_id", evidenceIds);

  throwIfError(error, "Failed to count chain of custody events.");
  const counts: Record<string, number> = {};
  for (const row of (data || []) as Array<{ evidence_id: string }>) {
    counts[row.evidence_id] = (counts[row.evidence_id] || 0) + 1;
  }
  return counts;
}

async function computeEventHash(
  evidenceId: string,
  action: string,
  actorId: string | undefined,
  notes: string | undefined,
  previousHash: string | null,
  timestamp: string
): Promise<string> {
  const canonicalString = JSON.stringify({
    evidence_id: evidenceId,
    action: action,
    actor_id: actorId,
    notes: notes,
    previous_hash: previousHash,
    timestamp: timestamp,
  });

  try {
    return await computeSha256(canonicalString);
  } catch {
    const crypto = require("crypto");
    return crypto.createHash("sha256").update(canonicalString).digest("hex");
  }
}

export async function appendChainOfCustody(input: {
  evidenceId: string;
  action: string;
  actorId?: string;
  notes?: string;
  previousHash?: string;
}): Promise<ChainOfCustodyRow> {
  const previousEvents = await listChainOfCustody(input.evidenceId);
  const previousHash = input.previousHash ??
    (previousEvents.length > 0
      ? previousEvents[previousEvents.length - 1].event_hash ??
        previousEvents[previousEvents.length - 1].hash
      : null);

  const timestamp = new Date().toISOString();
  const eventHash = await computeEventHash(
    input.evidenceId,
    input.action,
    input.actorId,
    input.notes,
    previousHash,
    timestamp
  );

  const baseInsert: Record<string, unknown> = {
    evidence_id: input.evidenceId,
    action: input.action,
    actor_id: input.actorId ?? null,
    notes: input.notes ?? null,
    created_at: timestamp,
  };

  try {
    const { data, error } = await getSupabaseServer()
      .from("chain_of_custody")
      .insert({
        ...baseInsert,
        previous_hash: previousHash,
        event_hash: eventHash,
        hash: eventHash,
      })
      .select("*")
      .maybeSingle();

    if (error) {
      throw new DatabaseError(error.message || "Insert failed", error.code);
    }

    if (!data) {
      throw new DatabaseError("No row returned after insert");
    }

    return data as ChainOfCustodyRow;
  } catch (err: any) {
    const message = String(err?.message || "");
    const isMissingColumn =
      message.includes("previous_hash") ||
      message.includes("event_hash") ||
      err?.code === "42703";
    const isMissingHashColumn =
      message.includes("'hash' column") || message.includes("hash\" column");

    if (isMissingColumn || isMissingHashColumn) {
      // Schema variations exist: some deployments have the legacy `hash`
      // column, newer ones only event_hash/previous_hash. Retry with the
      // event-based columns (dropping the legacy `hash`) first, then the
      // legacy-only shape, then a minimal row as a last resort.
      const attempts: Array<Record<string, unknown>> = isMissingColumn
        ? [
            { ...baseInsert, hash: eventHash },
            { ...baseInsert, previous_hash: previousHash, event_hash: eventHash },
            baseInsert,
          ]
        : [
            { ...baseInsert, previous_hash: previousHash, event_hash: eventHash },
            { ...baseInsert, hash: eventHash },
            baseInsert,
          ];

      for (const attempt of attempts) {
        const { data, error } = await getSupabaseServer()
          .from("chain_of_custody")
          .insert(attempt)
          .select("*")
          .maybeSingle();
        if (!error && data) {
          return data as ChainOfCustodyRow;
        }
      }

      throw new DatabaseError(
        message || "Failed to append chain of custody.",
        err?.code
      );
    }

    throw err;
  }
}

/**
 * Compute a deterministic Merkle-style root over the event hashes of
 * a custody chain. Used for blockchain anchoring: the root uniquely
 * represents the full custody history of an evidence item.
 *
 * Returns a hex-encoded SHA-256 digest.
 */
export function computeCustodyRoot(
  events: Array<{ event_hash?: string | null; hash?: string | null }>
): string {
  const leafHashes = events
    .map((e) => e.event_hash || e.hash)
    .filter((h): h is string => typeof h === "string" && h.length > 0);

  if (leafHashes.length === 0) {
    return computeSha256Sync("EMPTY_CUSTODY_CHAIN");
  }

  // Binary Merkle root
  let level = leafHashes;
  while (level.length > 1) {
    const next: string[] = [];
    for (let i = 0; i < level.length; i += 2) {
      const left = level[i];
      const right = i + 1 < level.length ? level[i + 1] : left;
      next.push(computeSha256Sync(left + right));
    }
    level = next;
  }
  return level[0];
}

function computeSha256Sync(data: string): string {
  try {
    const crypto = require("crypto");
    return crypto.createHash("sha256").update(data).digest("hex");
  } catch {
    // Fallback: should not happen in Node runtime
    return data;
  }
}

export interface ChainVerificationResult {
  isValid: boolean;
  errors: string[];
  verifiedEventCount: number;
  totalEventCount: number;
  schemaVersion: "new" | "legacy" | "mixed";
}

async function verifyHash(data: string, expectedHash: string): Promise<boolean> {
  let calculatedHash: string;
  try {
    calculatedHash = await computeSha256(data);
  } catch {
    const crypto = require("crypto");
    calculatedHash = crypto.createHash("sha256").update(data).digest("hex");
  }
  return calculatedHash === expectedHash;
}

/**
 * Normalize the DB-returned timestamp to the canonical append format
 * (e.g. "2026-09-10T08:00:00.000Z"). PostgREST can serialize timestamptz
 * with an offset such as "+00:00", which would break hash recomputation.
 */
function normalizeTimestamp(value: string | Date | null | undefined): string {
  const raw = value == null ? "" : String(value);
  const parsed = new Date(raw);
  if (Number.isNaN(parsed.getTime())) {
    return raw;
  }
  return parsed.toISOString();
}

export async function verifyChainOfCustody(
  evidenceId: string
): Promise<ChainVerificationResult> {
  const events = await listChainOfCustody(evidenceId);
  const errors: string[] = [];
  let verifiedEventCount = 0;
  let schemaVersion: "new" | "legacy" | "mixed" = "new";

  if (events.length === 0) {
    return {
      isValid: true,
      errors: [],
      verifiedEventCount: 0,
      totalEventCount: 0,
      schemaVersion: "new",
    };
  }

  const hasNewSchema = events.some(e => typeof e.event_hash === "string" && e.event_hash !== '');
  const hasLegacySchema = events.some(e => typeof e.hash === "string" && e.hash !== '');

  if (hasNewSchema && hasLegacySchema) {
    schemaVersion = "mixed";
  } else if (hasLegacySchema) {
    schemaVersion = "legacy";
  }

  for (let i = 0; i < events.length; i++) {
    const event = events[i];

    if (schemaVersion === "legacy") {
      verifiedEventCount++;
      continue;
    }

    const hasNewFields = (typeof event.previous_hash === "string" && event.previous_hash !== '') ||
                         (typeof event.event_hash === "string" && event.event_hash !== '');

    if (hasNewFields) {
      if (i === 0) {
        if (typeof event.previous_hash === "string" && event.previous_hash !== '') {
          errors.push(`Event ${i}: First event should have previous_hash=null`);
        }
      } else {
        const previousEvent = events[i - 1];
        const prevHash = previousEvent.event_hash || previousEvent.hash;
        if (event.previous_hash !== prevHash) {
          errors.push(`Event ${i}: previous_hash does not match previous event hash`);
        }
      }
    }

    if (typeof event.event_hash === "string" && event.event_hash !== '') {
      const isLegacyMd5 =
        typeof event.event_hash === "string" &&
        /^[a-f0-9]{32}$/i.test(event.event_hash);

      if (isLegacyMd5) {
        verifiedEventCount++;
        continue;
      }

      const canonicalString = JSON.stringify({
        evidence_id: event.evidence_id,
        action: event.action,
        actor_id: event.actor_id,
        notes: event.notes,
        previous_hash: event.previous_hash,
        timestamp: normalizeTimestamp(event.created_at),
      });

      const hashOk = await verifyHash(canonicalString, event.event_hash);
      if (!hashOk) {
        errors.push(`Event ${i}: event_hash does not match calculated hash`);
      } else {
        verifiedEventCount++;
      }
    } else {
      verifiedEventCount++;
    }
  }

  return {
    isValid: errors.length === 0,
    errors,
    verifiedEventCount,
    totalEventCount: events.length,
    schemaVersion,
  };
}
