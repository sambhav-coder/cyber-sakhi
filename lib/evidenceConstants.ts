/**
 * Evidence Locker policy constants, shared by the server API and the
 * client so the vault enforces one consistent set of limits.
 */

/** Maximum original (plaintext) file size accepted by the Evidence Locker. */
export const MAX_EVIDENCE_BYTES = 25 * 1024 * 1024;

/**
 * Base64 inflates ciphertext by ~4/3 plus padding, so a 25 MB original
 * never requires more than ~35 MB of encoded characters. Enforce an
 * explicit encoded cap server-side to keep payloads bounded.
 */
export const MAX_ENCRYPTED_CONTENT_CHARS = 36_000_000;

/** Evidence categories surfaced in the vault. */
export const EVIDENCE_CATEGORIES = [
  "HARASSMENT",
  "BLACKMAIL",
  "SCAM",
  "STALKING",
  "THREAT",
  "OTHER",
] as const;

export type EvidenceCategory = (typeof EVIDENCE_CATEGORIES)[number];

/** Canonical file-type set the vault accepts. */
export const SUPPORTED_EVIDENCE_TYPES = [
  "application/pdf",
  "application/msword",
  "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
  "text/plain",
  "text/csv",
  "application/vnd.ms-excel",
  "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
  "application/vnd.ms-powerpoint",
  "application/vnd.openxmlformats-officedocument.presentationml.presentation",
  "image/jpeg",
  "image/png",
  "image/webp",
  "image/gif",
  "application/zip",
  "application/json",
  "application/xml",
  "message/rfc822",
  "application/octet-stream",
] as const;

/** Extension patterns accepted by the file picker (defensive best-fit). */
export const ACCEPT_ATTRIBUTE = [
  ".pdf",
  ".doc",
  ".docx",
  ".txt",
  ".csv",
  ".xls",
  ".xlsx",
  ".ppt",
  ".pptx",
  ".jpg",
  ".jpeg",
  ".png",
  ".webp",
  ".gif",
  ".zip",
  ".json",
  ".xml",
  ".eml",
  ".msg",
].join(",");

export function isSupportedMimeType(value: string): boolean {
  return (SUPPORTED_EVIDENCE_TYPES as readonly string[]).includes(value);
}