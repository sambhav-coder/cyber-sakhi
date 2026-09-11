import type { EvidenceRow } from "@/lib/db/types";

/**
 * Safe evidence metadata for Sakhi chat context / UI pickers.
 *
 * Strictly metadata only:
 *  - The public EV-XXXX-XXXXXXXX code is always shown.
 *  - Titles/hashes of crypto-locked items are NEVER exposed (matching the
 *    Step 3 lock model) and encrypted content is never referenced.
 */

export interface EvidenceBrief {
  evidenceCode: string;
  title: string | null;
  mimeType: string | null;
  fileSize: number | null;
  sha256: string | null;
  isLocked: boolean;
  protectedNote: string | null;
}

export function evidenceToBrief(row: EvidenceRow): EvidenceBrief {
  const meta = (row.metadata || {}) as Record<string, unknown>;
  const lockMeta = (row.lock_metadata || {}) as Record<string, unknown>;
  const isLocked =
    lockMeta.locked === true ||
    meta.locked === true ||
    Boolean(row.wrapped_key) ||
    Boolean(row.lock_method);

  return {
    evidenceCode: row.evidence_code || "EV-UNKNOWN",
    title: isLocked ? null : row.title,
    mimeType: row.mime_type,
    fileSize: row.file_size,
    sha256: isLocked ? null : row.sha256,
    isLocked,
    protectedNote: isLocked
      ? "Locked — title and contents are protected. Unlock it in the Evidence Locker before attaching details."
      : null,
  };
}

/** One-line human-readable brief for the chat engine's context. */
export function evidenceBriefText(brief: EvidenceBrief): string {
  const title = brief.title ? `"${brief.title}"` : (brief.isLocked ? "protected item" : "item");
  const size = brief.fileSize ? ` (${formatSize(brief.fileSize)})` : "";
  const hash = brief.sha256 ? `, sha256 ${brief.sha256.slice(0, 16)}…` : "";
  const state = brief.isLocked ? "LOCKED" : "unlocked";
  return `${brief.evidenceCode} — ${title}${size}, ${state}${hash}`;
}

export function formatSize(bytes: number): string {
  if (bytes >= 1048576) return (bytes / 1048576).toFixed(1) + " MB";
  if (bytes >= 1024) return (bytes / 1024).toFixed(1) + " KB";
  return bytes + " B";
}