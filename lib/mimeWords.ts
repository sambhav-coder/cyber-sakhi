// ---------------------------------------------------------------------------
// RFC 2047 encoded-words: =?charset?B|Q?text?=
// Non-ASCII subjects and display names (Hindi, emoji, accented names) arrive
// in this form and must be decoded before they are shown or classified.
// ---------------------------------------------------------------------------

const ENCODED_WORD = /=\?([^?\s*]+)(?:\*[^?\s]*)?\?([BbQq])\?([^?\s]*)\?=/g;

function base64ToBytes(text: string): number[] {
  const clean = text.replace(/[^A-Za-z0-9+/]/g, "");
  const padded = clean + "=".repeat((4 - (clean.length % 4)) % 4);
  const binary =
    typeof atob === "function"
      ? atob(padded)
      : Buffer.from(padded, "base64").toString("latin1");
  return Array.from(binary, (c) => c.charCodeAt(0));
}

function qToBytes(text: string): number[] {
  const bytes: number[] = [];
  for (let i = 0; i < text.length; i++) {
    const ch = text[i];
    if (ch === "_") {
      bytes.push(0x20);
    } else if (ch === "=" && /^[0-9A-Fa-f]{2}$/.test(text.slice(i + 1, i + 3))) {
      bytes.push(parseInt(text.slice(i + 1, i + 3), 16));
      i += 2;
    } else {
      bytes.push(ch.charCodeAt(0) & 0xff);
    }
  }
  return bytes;
}

function bytesToString(bytes: number[], charset: string): string {
  const data = new Uint8Array(bytes);
  try {
    return new TextDecoder(charset.toLowerCase()).decode(data);
  } catch {
    // Unknown charset label: fall back to latin1 rather than dropping text.
    return new TextDecoder("latin1").decode(data);
  }
}

/**
 * Decodes RFC 2047 encoded-words in a header value. Adjacent encoded-words
 * are joined without the whitespace between them (as the RFC requires), and
 * consecutive words in the same charset are decoded as one byte run so a
 * multi-byte character split across two words still comes out intact.
 */
export function decodeMimeWords(value?: string): string | undefined {
  if (value === undefined || !value.includes("=?")) return value;

  let out = "";
  let pendingBytes: number[] = [];
  let pendingCharset = "";
  let last = 0;

  const flush = () => {
    if (pendingBytes.length) out += bytesToString(pendingBytes, pendingCharset);
    pendingBytes = [];
    pendingCharset = "";
  };

  for (const match of value.matchAll(ENCODED_WORD)) {
    const [word, charset, encoding, text] = match;
    const start = match.index ?? 0;
    const between = value.slice(last, start);

    // Whitespace between two encoded-words is not part of the text.
    const joinsPrevious = last > 0 && pendingBytes.length > 0 && /^\s*$/.test(between);
    if (!joinsPrevious || charset.toLowerCase() !== pendingCharset.toLowerCase()) {
      flush();
      if (!joinsPrevious) out += between;
    }

    try {
      pendingBytes.push(
        ...(encoding.toUpperCase() === "B" ? base64ToBytes(text) : qToBytes(text))
      );
      pendingCharset = charset;
    } catch {
      flush();
      out += word;
    }
    last = start + word.length;
  }

  flush();
  out += value.slice(last);
  return out;
}
