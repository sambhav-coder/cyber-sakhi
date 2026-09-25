export function decodeGmailRaw(raw: string): string {
  if (!raw) {
    throw new Error("Gmail raw message is empty.");
  }

  const normalized = raw
    .replace(/-/g, "+")
    .replace(/_/g, "/");

  const padded =
    normalized + "=".repeat((4 - (normalized.length % 4)) % 4);

  return Buffer.from(padded, "base64").toString("utf-8");
}

export interface GmailPart {
  mimeType?: string;
  headers?: { name: string; value: string }[];
  body?: { data?: string };
  parts?: GmailPart[];
}

function safeDecode(data?: string): string {
  if (!data) return "";
  try {
    return decodeGmailRaw(data);
  } catch {
    return "";
  }
}

/** Walks the MIME tree collecting text parts. Attachments carry no inline
 *  data in format=full, so they are never downloaded. */
function collectText(part: GmailPart | undefined, plain: string[], html: string[]) {
  if (!part) return;
  const type = (part.mimeType || "").toLowerCase();
  if (type === "text/plain") plain.push(safeDecode(part.body?.data));
  else if (type === "text/html") html.push(safeDecode(part.body?.data));
  for (const child of part.parts || []) collectText(child, plain, html);
}

function stripHtml(html: string): string {
  return html
    .replace(/<(script|style)[\s\S]*?<\/\1>/gi, " ")
    .replace(/<br\s*\/?>/gi, "\n")
    .replace(/<[^>]+>/g, " ")
    .replace(/&nbsp;/gi, " ")
    .replace(/&amp;/gi, "&")
    .replace(/[ \t]+/g, " ")
    .trim();
}

/** Rebuilds an approximate RFC 822 source (all headers + text body) from a
 *  Gmail format=full payload. Used when format=raw is unavailable. */
export function rebuildEmailFromFull(
  payload: GmailPart | undefined,
  maxBodyChars = Infinity
): string {
  const headers = (payload?.headers || [])
    .map((h) => `${h.name}: ${h.value}`)
    .join("\r\n");

  const plain: string[] = [];
  const html: string[] = [];
  collectText(payload, plain, html);
  const text = (plain.join("\n").trim() || stripHtml(html.join("\n")))
    .slice(0, maxBodyChars);

  return `${headers}\r\n\r\n${text}`;
}
