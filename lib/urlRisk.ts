import type { ThreatIndicator, UrlRiskAnalysis } from "./emailTypes";

/**
 * STRUCTURED URL RISK (Stage C — URL analysis depth)
 * --------------------------------------------------
 * Static, deterministic flagging of URLs extracted from the message body.
 * It does NOT open, follow, or dereference any URL. It only inspects shape
 * and spelling. It never claims reputation/VT/takedown status.
 */

const SUSPICIOUS_TLD_RE =
  /\.(xyz|top|tk|ml|ga|cf|gq|pw|cc|bid|review|loan|win|stream|rest|cyou|icu|buzz|click|one|online|site|club|live|support|help)$/i;

const CREDENTIAL_PATH_RE =
  /(?:login|signin|sign-in|verify|kyc|otp|reset|confirm|secure|auth|account|payment|update|renew|claim|refund)\d{0,3}\b/i;

const SHORTENER_RE = /bit\.ly|tinyurl|t\.co|ow\.ly|is\.gd|buff\.ly|goo\.gl|rb\.gy|shorturl\.at/i;

const IP_URL_RE = /https?:\/\/\d{1,3}(\.\d{1,3}){3}(:\d+)?(\/|$)/i;

function hostOf(url: string): { host: string; labels: string[] } | null {
  const m = url.match(/^https?:\/\/([^/\s?#]+)/i);
  if (!m) return null;
  let host = m[1];
  if (host.startsWith("www.")) host = host.slice(4);
  if (host.endsWith(".")) host = host.slice(0, -1);
  const labels = host.split(".").filter(Boolean);
  return { host, labels };
}

export function analyzeUrlRisk(
  urlIndicators: ThreatIndicator[],
  trustedDisplayDomains: string[] = []
): UrlRiskAnalysis[] {
  const urls = urlIndicators
    .filter((i) => i.type === "url" && typeof i.value === "string")
    .map((i) => i.value)
    .filter(Boolean);

  const results: UrlRiskAnalysis[] = [];

  for (const url of urls.slice(0, 20)) {
    const flags: string[] = [];
    let severity = "LOW" as UrlRiskAnalysis["severity"];

    const hostInfo = hostOf(url);

    if (IP_URL_RE.test(url)) {
      flags.push("IP address used as host (no domain name)");
      severity = "MEDIUM";
    }

    if (hostInfo) {
      const { host, labels } = hostInfo;

      if (/^xn--/i.test(labels[0] || "")) {
        flags.push("Punycode (IDN) domain — may visually mimic a trusted name");
        severity = severity === "LOW" ? "MEDIUM" : "HIGH";
      }

      if (labels.length >= 4) {
        flags.push("Excessive subdomain depth (impersonation stagers often deep-nest)");
        severity = severity === "LOW" ? "MEDIUM" : severity;
      }

      if (SUSPICIOUS_TLD_RE.test(host)) {
        flags.push("TLD frequently observed in phishing/malware campaigns");
        severity = "HIGH";
      }

      if (!/^https:\/\//i.test(url)) {
        flags.push("Cleartext HTTP link — page content is not transport-secured");
        severity = severity === "LOW" ? "MEDIUM" : severity;
      }

      const displayedOk = trustedDisplayDomains.some((d) => {
        const dHost = hostOf("https://" + d);
        return dHost?.host === host || host.endsWith("." + dHost?.host);
      });
      if (!displayedOk && trustedDisplayDomains.length > 0) {
        // Implicit: not on the message-banner's trusted list. Only noted when
        // a brand-like name appears inside the URL for a different host.
        const looksLikeTrusted = trustedDisplayDomains.some((d) =>
          d.split(".")[0] && host.includes(d.split(".")[0])
        );
        if (looksLikeTrusted) {
          flags.push("URL host embeds a trusted brand name but is not that brand's domain");
          severity = "HIGH";
        }
      }
    }

    const pathMatch = url.match(/[?#].{0,200}$/i);
    const lowerUrl = url.toLowerCase();
    if (CREDENTIAL_PATH_RE.test(lowerUrl)) {
      flags.push("Path targets a credential/verification flow");
      severity = severity === "LOW" ? "MEDIUM" : severity;
    }

    if (SHORTENER_RE.test(url)) {
      flags.push("URL shortener — destination is hidden");
      severity = severity === "LOW" ? "MEDIUM" : severity;
    }

    if (pathMatch) {
      const longToken = pathMatch[0].match(/[a-z0-9]{20,}/i);
      if (longToken) {
        flags.push("Long opaque token in path (can be a per-campaign tracker)");
        severity = severity === "LOW" ? "LOW" : severity;
      }
    }

    const scoreForConfidence =
      flags.length +
      (severity === "HIGH" ? 3 : severity === "MEDIUM" ? 2 : 0);

    results.push({
      url,
      flags: [...new Set(flags)],
      severity,
      confidence: Math.min(0.95, 0.55 + (scoreForConfidence - 1) * 0.12),
      evidence: flags.length > 0 ? flags.join("; ") : "No heuristic flags raised",
    });
  }

  return results;
}