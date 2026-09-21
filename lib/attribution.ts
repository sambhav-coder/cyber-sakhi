/**
 * Attribution / origin assessment.
 *
 * Cyber Sakhi does NOT and cannot name a real person or a named threat group:
 * email headers are trivially spoofed and an IP is a router, not an identity.
 * What this module CAN do, with permissive low confidence and an explicit
 * caveat, is map *behavioral and technical fingerprints* to:
 *   1. a coarse origin region (from IP geo, TLD habits, language markers), and
 *   2. a scam *family* (advance-fee, BEC, credential-phishing, sextortion).
 *
 * Every output is transparently derived from signals already in the analysis
 * and is bounded so it can never read as proof of identity.
 */

import type {
  EmailAnalysisResult,
  IPIntelligence,
} from "./emailTypes";

export interface AttributionRegion {
  region: string;
  /** 0..100 — transparent derivation of matched signals, see rationale. */
  score: number;
  rationale: string;
}

export type ScamFamily =
  | "advance-fee"
  | "business-email-compromise"
  | "credential-phishing"
  | "sextortion"
  | "other"
  | null;

export interface AttributionAnalysis {
  originRegions: AttributionRegion[];
  scamFamily: ScamFamily;
  confidence: number; // always <= 0.5 by construction
  caveat: string;
}

const ADVANCE_FEE_HITS =
  /\b(winning|lottery|lucky draw|inherit|inheritance|next of kin|fund transfer|bank of .*|western union|westernunion|money gram|49 million|gold bars|leave a claim|charity donation|my late husband|my late father)\b/i;

function countryToRegions(ipGeo: IPIntelligence | undefined): AttributionRegion[] {
  const country = (ipGeo?.country ?? "").toLowerCase();
  const region = (ipGeo?.region ?? "").toLowerCase();
  const out: AttributionRegion[] = [];

  if (/\b(nigeria|ghana|benin|togo|cameroon)\b/.test(country) || /lagos|accra/.test(region)) {
    out.push({
      region: "West Africa",
      score: 60,
      rationale: `Sender IP is geolocated to ${ipGeo?.country ?? "unknown"} (${region}). Advance-fee fraud has historically high prevalence in this corridor; this is a weak prior only.`,
    });
  } else if (/\b(india|pakistan|bangladesh|sri lanka|nepal)\b/.test(country)) {
    out.push({
      region: "South Asia",
      score: 45,
      rationale: `Sender IP is geolocated to ${ipGeo?.country ?? "unknown"}. KYC/credential and OTP-scam content often originates here; weak prior only.`,
    });
  } else if (/\b(russia|ukraine|belarus)\b/.test(country)) {
    out.push({
      region: "Eastern Europe",
      score: 40,
      rationale: `Sender IP is geolocated to ${ipGeo?.country ?? "unknown"}. Coordinated credential-phishing campaigns are frequently hosted there; weak prior only.`,
    });
  } else if (country) {
    out.push({
      region: `Other (${ipGeo?.country})`,
      score: 25,
      rationale: `Sender IP geolocation is ${ipGeo?.country ?? "unknown"}; no dominant regional fraud profile applies.`,
    });
  }

  return out;
}

function familyHits(r: {
  bec?: EmailAnalysisResult["bec"];
  nlp?: EmailAnalysisResult["nlp"];
  urlRisk?: EmailAnalysisResult["urlRisk"];
  headers: EmailAnalysisResult["headers"];
  text: string;
}): ScamFamily {
  const content = [
    r.headers.subject ?? "",
    r.nlp?.detail?.map((d) => d.phrase).join(" ") ?? "",
    r.text,
    ...(r.urlRisk ?? []).map((u) => u.url),
  ].join(" ");

  if (r.bec?.detected) return "business-email-compromise";

  if (
    /(webcam|deleted. (pictures|photos)|screenshots|blackmail|paid. enough money|recorded you|md5|hash of your|your browser history)/i.test(content)
  ) {
    return "sextortion";
  }

  if (ADVANCE_FEE_HITS.test(content)) {
    return "advance-fee";
  }

  if (
    /(login|password|otp|verify your|update your account|24 hours|cookies|credential)/i.test(content) ||
    (r.urlRisk ?? []).some((u) => u.flags.includes("login") || u.flags.includes("credential"))
  ) {
    return "credential-phishing";
  }

  return "other";
}

/**
 * Attribution assessment. Pure over `EmailAnalysisResult` (plus the raw body
 * text when available for language markers). Low confidence always.
 */
export function assessAttribution(
  r: EmailAnalysisResult,
  bodyText: string | null | undefined = null
): AttributionAnalysis {
  const regions = countryToRegions(r.ipIntelligence);

  // TLD habit contributes a small correction factor.
  const senderDomain = r.senderDomain ?? "";
  const tld = senderDomain.split(".").pop() ?? "";
  if (/^(ng|gh|net|cc|biz|ru|tk|ml|ga)$/i.test(tld) && regions.length > 0) {
    regions[0] = {
      ...regions[0],
      score: Math.min(95, regions[0].score + 10),
      rationale: regions[0].rationale + ` Sender TLD ".${tld}" is common in fraud registrations.`,
    };
  }

  // Language fingerprint from the body (advance-fee phrasing etc.)
  const text = `${r.headers.subject ?? ""} ${bodyText ?? ""}`;
  if (ADVANCE_FEE_HITS.test(text) && regions.length > 0) {
    regions[0] = {
      ...regions[0],
      score: Math.min(95, regions[0].score + 12),
      rationale: regions[0].rationale + " Advance-fee phrasing present in the message body.",
    };
  }

  const sorted = [...regions].sort((a, b) => b.score - a.score);

  const scamFamily = familyHits({
    bec: r.bec,
    nlp: r.nlp,
    urlRisk: r.urlRisk,
    headers: r.headers,
    text,
  });

  // Explicitly bounded: even a perfect signal match can never exceed 0.5.
  const confidence =
    sorted.length > 0
      ? Math.min(0.5, Math.round((0.3 + (sorted[0].score / 100) * 0.2) * 100) / 100)
      : 0.1;

  return {
    originRegions: sorted,
    scamFamily,
    confidence,
    caveat:
      "Attribution is heuristic and deliberately low-confidence: IP geolocation describes a router/region, not a person; headers are trivially spoofed. Cyber Sakhi will never tag a specific individual or named threat group. Treat every region/family claim as a line-of-inquiry for a human investigator, not as evidence of identity.",
  };
}