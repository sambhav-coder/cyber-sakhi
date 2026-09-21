import {
  EmailHeaderAnalysis,
  SMTPHop,
} from "./emailTypes";
import { extractValidatedIps } from "./ip";
import { decodeMimeWords } from "./mimeWords";

export { decodeMimeWords };

function escapeRegex(text: string): string {
  return text.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

/** Matches one header (with folded continuation lines). `[ \t]*` rather than
 *  `\s*` so an empty header never swallows the header on the next line. */
function headerPattern(headerName: string, flags: string): RegExp {
  return new RegExp(
    `^${escapeRegex(headerName)}:[ \\t]*(.*(?:\\r?\\n[ \\t].*)*)$`,
    flags
  );
}

function unfold(value: string): string {
  return value.replace(/\r?\n[ \t]+/g, " ").trim();
}

export function getHeaderValue(rawHeaders: string, headerName: string): string | undefined {
  const match = rawHeaders.match(headerPattern(headerName, "im"));
  if (!match) return undefined;
  const value = unfold(match[1]);
  return value || undefined;
}

function getHeaderValues(rawHeaders: string, headerName: string): string[] {
  const results: string[] = [];
  for (const match of rawHeaders.matchAll(headerPattern(headerName, "gim"))) {
    const value = unfold(match[1]);
    if (value) results.push(value);
  }
  return results;
}

function getReceivedHeaders(rawHeaders: string): string[] {
  return getHeaderValues(rawHeaders, "Received");
}

export function extractHeaders(rawEmail: string): EmailHeaderAnalysis {
  // Pasted emails often start with blank lines; without this the header /
  // body split lands at position 0 and every header goes missing.
  const email = rawEmail.replace(/^(?:[ \t]*\r?\n)+/, "");
  const headerEnd = email.search(/\r?\n[ \t]*\r?\n/);

  const rawHeaders =
    headerEnd === -1 ? email.trim() : email.slice(0, headerEnd).trim();

  return {
    from: decodeMimeWords(getHeaderValue(rawHeaders, "From")),
    to: decodeMimeWords(getHeaderValue(rawHeaders, "To")),
    cc: decodeMimeWords(getHeaderValue(rawHeaders, "Cc")),
    replyTo: decodeMimeWords(getHeaderValue(rawHeaders, "Reply-To")),
    returnPath: getHeaderValue(rawHeaders, "Return-Path"),
    subject: decodeMimeWords(getHeaderValue(rawHeaders, "Subject")),
    date: getHeaderValue(rawHeaders, "Date"),
    messageId: getHeaderValue(rawHeaders, "Message-ID"),
    authenticationResults: getHeaderValue(
      rawHeaders,
      "Authentication-Results"
    ),
    received: getReceivedHeaders(rawHeaders),
    rawHeaders,
    sender: decodeMimeWords(getHeaderValue(rawHeaders, "Sender")),
    contentType: getHeaderValue(rawHeaders, "Content-Type"),
    xOriginatingIp: getHeaderValue(rawHeaders, "X-Originating-IP"),
    xMailer: getHeaderValue(rawHeaders, "X-Mailer"),
    userAgent: getHeaderValue(rawHeaders, "User-Agent"),
    dkimSignature: getHeaderValue(rawHeaders, "DKIM-Signature"),
    arcHeaders: getHeaderValues(rawHeaders, "ARC-Authentication-Results"),
  };
}

// ---------------------------------------------------------------------------
// MIME attachment discovery (structural only — never decodes or executes files)
// ---------------------------------------------------------------------------

export interface RawAttachmentMeta {
  filename: string;
  mimeType?: string;
  sizeEstimateBytes?: number;
  rawDisposition?: string;
}

export function extractMimeAttachments(rawEmail: string): RawAttachmentMeta[] {
  const attachments: RawAttachmentMeta[] = [];
  const seen = new Set<string>();

  const partitions = rawEmail.split(/--[^\r\n]+/g);

  for (const part of partitions) {
    const dispMatch = part.match(/^Content-Disposition:\s*([^;\r\n]+)/im);
    if (!dispMatch) continue;

    const disposition = dispMatch[1]?.trim().toLowerCase();
    if (disposition !== "attachment" && disposition !== "inline") continue;

    const filenameMatch = part.match(/filename\s*=\s*"?([^";\r\n]+)"?/i);
    const typeMatch = part.match(/^Content-Type:\s*([^;\r\n]+)/im);
    const filename = filenameMatch?.[1]?.trim();

    if (!filename) continue;

    const key = filename.toLowerCase();
    if (seen.has(key)) continue;
    seen.add(key);

    attachments.push({
      filename,
      mimeType: typeMatch?.[1]?.trim().toLowerCase(),
      sizeEstimateBytes: estimatePartSize(part),
      rawDisposition: disposition,
    });
  }

  return attachments;
}

function estimatePartSize(part: string): number | undefined {
  try {
    const bytes = Buffer.byteLength(part, "utf8");
    return bytes > 0 ? bytes : undefined;
  } catch {
    return undefined;
  }
}

function parseDateIso(timestamp: string | undefined): {
  iso?: string;
  timezone?: string;
} | null {
  if (!timestamp) return null;
  const tzMatch = timestamp.match(/(\([A-Z]{2,5}\))|([A-Z]{3,5})$|\+\d{2}:?\d{2}|-\d{2}:?\d{2}/);
  const tz = tzMatch?.[1] || tzMatch?.[2] || tzMatch?.[0] || undefined;

  // Normalize "Tue, 10 Sep 2026 09:13:00 +0530" and "Tue, 10 Sep 2026 09:13:55 +0000 (UTC)"
  const cleaned = timestamp.replace(/\([A-Z]{2,5}\)$/, "").trim();
  const parsed = Date.parse(cleaned);
  if (Number.isNaN(parsed)) return { timezone: tz };

  return {
    iso: new Date(parsed).toISOString(),
    timezone: tz,
  };
}

/**
 * Extract a validated IP address from header text.
 *
 * Only strings that pass strict IPv4/IPv6 validation are returned: a
 * timestamp such as "07:08:55" or a malformed quad like "09.17.02.11" is
 * NEVER an IP. Returns the first valid address found, or undefined.
 */
function extractIp(value: string): string | undefined {
  return extractValidatedIps(value)[0];
}

export function reconstructSMTPPath(
  receivedHeaders: string[]
): SMTPHop[] {
  return receivedHeaders.map((header) => {
    const fromMatch = header.match(
      /\bfrom\s+(.+?)(?=\s+by\s+|\s+\(|;|$)/i
    );

    const byMatch = header.match(
      /\bby\s+(.+?)(?=\s+with\s+|\s+id\s+|\s+\(|;|$)/i
    );

    const ip = extractIp(header);

    const timestampMatch = header.match(
      /;\s*(.+)$/
    );

    const timestamp = timestampMatch?.[1]?.trim();
    const dateParsed = parseDateIso(timestamp);

    return {
      from: fromMatch?.[1]?.trim(),
      by: byMatch?.[1]?.trim(),
      ip,
      timestamp,
      timestampIso: dateParsed?.iso,
      timezone: dateParsed?.timezone,
      raw: header,
    };
  });
}