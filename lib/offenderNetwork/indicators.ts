import type { IndicatorType } from "./constants";
import { MAX_INDICATORS_PER_REQUEST } from "./constants";

/* ------------------------------------------------------------------ *
 * Indicator extraction.
 *
 * Pure and dependency-free so it runs in the browser: the message text
 * is parsed locally and only the identifiers found in it are sent to the
 * server. The message itself never leaves the device.
 *
 * Extraction runs in a fixed order and blanks out each match, so a
 * digit run inside a UPI ID or a URL is never re-read as a phone number.
 * ------------------------------------------------------------------ */

export interface ExtractedIndicator {
  type: IndicatorType;
  /** Canonical form. Fingerprinted server-side; never stored raw. */
  value: string;
  /** Masked form, safe for the UI and for screenshots. */
  display: string;
}

/* Where the account on the platform is the indicator, not the domain. */
const PLATFORM_HOSTS = new Set([
  "instagram.com",
  "facebook.com",
  "m.facebook.com",
  "fb.com",
  "t.me",
  "telegram.me",
  "twitter.com",
  "x.com",
  "snapchat.com",
  "youtube.com",
  "linkedin.com",
  "threads.net",
]);

/* Path segments that are not usernames. */
const RESERVED_SEGMENTS = new Set([
  "p",
  "reel",
  "reels",
  "stories",
  "explore",
  "watch",
  "shorts",
  "share",
  "sharer",
  "sharer.php",
  "in",
  "add",
  "u",
  "groups",
  "events",
  "hashtag",
  "status",
  "i",
  "home",
  "login",
  "accounts",
  "profile.php",
]);

/* Linking to these proves nothing about the sender. */
const BENIGN_HOSTS = new Set([
  "google.com",
  "gmail.com",
  "youtu.be",
  "wikipedia.org",
  "en.wikipedia.org",
  "microsoft.com",
  "apple.com",
  "whatsapp.com",
  "outlook.com",
  "yahoo.com",
]);
const BENIGN_SUFFIXES = [".gov.in", ".nic.in"];

const EMAIL_RE = /[a-z0-9._%+-]+@[a-z0-9-]+(?:\.[a-z0-9-]+)*\.[a-z]{2,}/gi;
const URL_RE = /\bhttps?:\/\/[^\s<>"')\]]+/gi;
/* name@handle with no dot after the handle — that is what separates a
 * UPI VPA (rahul.pay@ybl) from an email address (rahul@gmail.com). */
const UPI_RE = /\b[a-z0-9][a-z0-9._-]{1,63}@[a-z]{2,20}\b(?![.\w])/gi;
const HANDLE_RE = /(^|[\s(,;:])@([a-z0-9._]{3,30})\b/gi;
const BARE_DOMAIN_RE =
  /\b(?:[a-z0-9-]+\.)+(?:com|in|net|org|info|xyz|top|tk|ml|ga|cf|gq|link|click|online|site|live|app|io|co|me|shop|club|vip|buzz|icu)\b(?:\/[^\s<>"')\]]*)?/gi;
/* Indian mobile: optional +91 / 91 / 0, then 10 digits starting 6-9,
 * tolerating spaces or dashes between digits. */
const PHONE_RE = /(?:\+?91[\s-]?|\b0)?[6-9](?:[\s-]?\d){9}\b/g;

/* ---------------------------- normalisation --------------------------- */

function isBenignHost(host: string): boolean {
  return BENIGN_HOSTS.has(host) || BENIGN_SUFFIXES.some((s) => host.endsWith(s));
}

/**
 * Canonicalises a raw identifier, or returns null when it is not a valid
 * instance of its type. Used on both sides: the browser to extract, and the
 * server to re-validate, since the server must never trust client input.
 */
export function normalizeIndicator(type: IndicatorType, raw: string): string | null {
  const input = String(raw ?? "").trim();
  if (!input || input.length > 320) return null;

  switch (type) {
    case "phone": {
      let digits = input.replace(/\D/g, "");
      if (digits.length > 10) digits = digits.slice(-10);
      return /^[6-9]\d{9}$/.test(digits) ? digits : null;
    }
    case "upi": {
      const v = input.toLowerCase();
      return /^[a-z0-9][a-z0-9._-]{1,63}@[a-z]{2,20}$/.test(v) ? v : null;
    }
    case "email": {
      const v = input.toLowerCase();
      return /^[a-z0-9._%+-]+@[a-z0-9-]+(\.[a-z0-9-]+)*\.[a-z]{2,}$/.test(v) ? v : null;
    }
    case "domain": {
      const v = input.toLowerCase().replace(/^www\./, "").replace(/\.$/, "");
      if (!/^([a-z0-9-]+\.)+[a-z]{2,}$/.test(v)) return null;
      return isBenignHost(v) ? null : v;
    }
    case "handle": {
      const v = input.replace(/^@/, "").toLowerCase();
      return /^[a-z0-9._]{3,30}$/.test(v) ? v : null;
    }
    default:
      return null;
  }
}

function mask(s: string, keepStart: number, keepEnd: number): string {
  if (s.length <= keepStart + keepEnd) {
    return s.charAt(0) + "•".repeat(Math.max(1, s.length - 1));
  }
  const hidden = Math.min(5, s.length - keepStart - keepEnd);
  return s.slice(0, keepStart) + "•".repeat(hidden) + s.slice(s.length - keepEnd);
}

export function displayIndicator(type: IndicatorType, value: string): string {
  switch (type) {
    case "phone":
      return mask(value, 2, 3);
    case "upi":
    case "email": {
      const at = value.lastIndexOf("@");
      return `${mask(value.slice(0, at), 2, 0)}${value.slice(at)}`;
    }
    case "handle":
      return `@${mask(value, 2, 2)}`;
    case "domain":
    default:
      // Domains are public infrastructure; masking them hides nothing.
      return value;
  }
}

function make(type: IndicatorType, raw: string): ExtractedIndicator | null {
  const value = normalizeIndicator(type, raw);
  return value ? { type, value, display: displayIndicator(type, value) } : null;
}

function fromUrl(raw: string): ExtractedIndicator | null {
  let url: URL;
  try {
    url = new URL(raw.replace(/[.,;:!?]+$/, ""));
  } catch {
    return null;
  }
  const host = url.hostname.toLowerCase().replace(/^www\./, "");

  // WhatsApp click-to-chat links are phone numbers in disguise.
  if (host === "wa.me") return make("phone", url.pathname);
  if (host === "api.whatsapp.com") return make("phone", url.searchParams.get("phone") ?? "");

  if (PLATFORM_HOSTS.has(host)) {
    const segments = url.pathname
      .split("/")
      .filter(Boolean)
      .map((s) => s.replace(/^@/, ""));
    if (segments.length === 0) return null;
    const first = segments[0].toLowerCase();

    // /in/<name>, /add/<name>, /u/<name>, /stories/<name>/…: the username
    // is the NEXT segment.
    const USERNAME_FOLLOWS = new Set(["in", "add", "u", "stories"]);
    if (USERNAME_FOLLOWS.has(first)) {
      const next = segments[1];
      return next && !RESERVED_SEGMENTS.has(next.toLowerCase()) ? make("handle", next) : null;
    }

    // /p/<id>, /reel/<id>, /watch?v=…: a link to content, not to an
    // account, so there is no username in it to report.
    if (RESERVED_SEGMENTS.has(first)) return null;

    return make("handle", segments[0]);
  }

  return make("domain", host);
}

/* ------------------------------ extraction ---------------------------- */

export function extractIndicators(text: string): ExtractedIndicator[] {
  const found: ExtractedIndicator[] = [];
  const seen = new Set<string>();
  const push = (ind: ExtractedIndicator | null) => {
    if (!ind) return;
    const key = `${ind.type}:${ind.value}`;
    if (seen.has(key)) return;
    seen.add(key);
    found.push(ind);
  };
  const blank = (m: string) => " ".repeat(m.length);

  let work = String(text ?? "").slice(0, 10_000);

  work = work.replace(EMAIL_RE, (m) => {
    push(make("email", m));
    return blank(m);
  });
  work = work.replace(URL_RE, (m) => {
    push(fromUrl(m));
    return blank(m);
  });
  work = work.replace(UPI_RE, (m) => {
    push(make("upi", m));
    return blank(m);
  });
  work = work.replace(HANDLE_RE, (m, lead: string, name: string) => {
    push(make("handle", name));
    return lead + blank(m.slice(lead.length));
  });
  work = work.replace(BARE_DOMAIN_RE, (m) => {
    push(fromUrl(`http://${m}`));
    return blank(m);
  });
  work.replace(PHONE_RE, (m) => {
    push(make("phone", m));
    return blank(m);
  });

  return found.slice(0, MAX_INDICATORS_PER_REQUEST);
}
