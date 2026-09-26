/**
 * Deterministic URL risk rules, v1 (rule-based enrichment baseline).
 *
 * Dependency-free and erasable-syntax-only so the SAME module runs in the
 * browser/panel bundle (via bundler) and in the Node ingestion script (via
 * --experimental-strip-types). Feature definitions here are mirrored by the
 * statistical model trainer (scripts/gov-datasets/train-url-risk-model.py);
 * keep both in sync and bump URL_RISK_RULES_VERSION on any change.
 *
 * Output is a triage suggestion, never a verdict: { score, band, signals }.
 * Bands: 0-1 LOW, 2-3 MEDIUM, >=4 HIGH.
 */

export const URL_RISK_RULES_VERSION = "url-risk-rules-v1";

export interface UrlRiskSignal {
  code: string;
  points: number;
  detail: string;
}

export interface UrlRiskResult {
  score: number;
  band: "LOW" | "MEDIUM" | "HIGH";
  signals: UrlRiskSignal[];
  version: string;
}

const SUSPICIOUS_EXT = new Set([
  "exe", "msi", "bat", "cmd", "ps1", "vbs", "vbe", "js", "jse", "jar",
  "bin", "sh", "dll", "scr", "msc", "hta", "cpl", "gadget", "apk", "com", "pif",
]);

const SHORTENER_HOSTS = new Set([
  "bit.ly", "tinyurl.com", "t.co", "goo.gl", "ow.ly", "is.gd", "buff.ly",
  "adf.ly", "cutt.ly", "tiny.cc", "rebrand.ly", "shorturl.at",
]);

const WATCH_TLDS = new Set([
  "top", "xyz", "lol", "cfd", "live", "info", "online", "space", "life",
  "buzz", "monster", "click", "rest", "sbs", "quest", "vip", "gift",
  "gdn", "bid", "win", "date", "loan", "ooo", "tk", "ml", "ga", "cf", "gq",
]);

function safeParse(raw: string): URL | null {
  const v = raw.trim();
  if (!v) return null;
  try {
    const u = new URL(v.includes("://") ? v : `http://${v}`);
    if (u.protocol !== "http:" && u.protocol !== "https:") return null;
    return u;
  } catch {
    return null;
  }
}

export function scoreUrlRisk(raw: string): UrlRiskResult {
  const signals: UrlRiskSignal[] = [];
  const add = (code: string, points: number, detail: string) => {
    signals.push({ code, points, detail });
  };

  const u = safeParse(raw);
  if (!u) {
    return { score: 0, band: "LOW", signals: [{ code: "UNPARSEABLE", points: 0, detail: "Value is not a parseable URL; no signals evaluated." }], version: URL_RISK_RULES_VERSION };
  }

  const host = u.hostname.toLowerCase();
  const path = u.pathname + u.search;
  const isIp = /^\d{1,3}(\.\d{1,3}){3}$/.test(host) || host.includes(":");
  if (isIp) add("IP_LITERAL_HOST", 3, "Host is a literal IP address, not a domain name.");
  if (raw.includes("@")) add("AT_SYMBOL", 2, "URL contains '@', a classic credential-phishing obfuscation.");
  if (host.includes("xn--")) add("PUNYCODE", 2, "Internationalized (punycode) host can visually spoof brands.");
  if (u.port && u.port !== "80" && u.port !== "443") add("NONSTANDARD_PORT", 1, `Non-standard port ${u.port}.`);

  const labels = host.split(".").filter(Boolean);
  const depth = isIp ? 0 : Math.max(0, labels.length - 2);
  if (depth >= 3) add("DEEP_SUBDOMAINS", 2, `${depth} subdomain levels below the registrable domain.`);
  else if (depth === 2) add("MANY_SUBDOMAINS", 1, "Two subdomain levels below the registrable domain.");

  const segments = u.pathname.split("/").filter(Boolean);
  if (segments.length > 4) add("DEEP_PATH", 1, `${segments.length} path segments.`);

  if (raw.length > 200) add("VERY_LONG_URL", 2, `URL length ${raw.length} chars.`);
  else if (raw.length > 120) add("LONG_URL", 1, `URL length ${raw.length} chars.`);

  const ext = (segments.length > 0 ? segments[segments.length - 1].split(".").pop() ?? "" : "").toLowerCase().split(/[^a-z0-9]/)[0];
  if (ext && SUSPICIOUS_EXT.has(ext)) add("EXECUTABLE_EXTENSION", 2, `Path ends with .${ext}, a directly executable type.`);

  if (SHORTENER_HOSTS.has(host)) add("SHORTENER_HOST", 1, "URL-shortener host hides the final destination.");
  const tld = labels.length > 0 ? labels[labels.length - 1] : "";
  if (tld && WATCH_TLDS.has(tld)) add("WATCHLIST_TLD", 1, `Top-level domain .${tld} is frequently abused.`);

  const digits = (host.match(/[0-9]/g) ?? []).length;
  if (!isIp && host.length > 0 && digits / host.length > 0.3) {
    add("DIGIT_HEAVY_HOST", 1, "Unusually digit-heavy hostname (often auto-generated).");
  }

  if (u.protocol === "https:") add("USES_HTTPS", -1, "HTTPS is expected for legitimate sites but proves nothing alone.");

  const score = Math.max(0, signals.reduce((s, x) => s + x.points, 0));
  const band = score >= 4 ? "HIGH" : score >= 2 ? "MEDIUM" : "LOW";
  return { score, band, signals, version: URL_RISK_RULES_VERSION };
}

/** Feature schema shared with the statistical trainer (same names/semantics). */
export const URL_RISK_FEATURE_SCHEMA = [
  "url_len", "host_len", "path_len", "dots", "hyphens", "digits_ratio",
  "subdomain_depth", "is_ip", "has_at", "has_punycode", "nonstandard_port",
  "deep_path", "exec_ext", "shortener", "watch_tld", "is_https",
] as const;
