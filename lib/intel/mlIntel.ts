/**
 * ML URL-risk provider wrapper (Phase 9).
 *
 * Integrates the existing trained model (lib/gov/ml/urlRiskModel.ts,
 * url-risk-lr-v1) as a MODEL_DERIVED source — strictly separated from
 * EXTERNAL_PROVIDER verdicts. The experimental status, uncalibrated
 * score semantics, and analyst-review contract are preserved verbatim:
 * model output is a suggestion, never confirmed threat intelligence.
 */

import {
  emptyIntel,
  type IndicatorQuery,
  type NormalizedThreatIntel,
  type ProviderHealth,
} from "./providers";
import { modelVersion, scoreUrlModel } from "@/lib/gov/ml/urlRiskModel";
import trainingMetadata from "@/docs/ml/url-risk-v1/training-metadata.json";

export const ML_URL_RISK_PROVIDER = "URL risk model (ML)";

function modelStatus(): string {
  const status = (trainingMetadata as { status?: string }).status;
  return typeof status === "string" ? status : "UNKNOWN";
}

/** Score one URL with the trained model. Pure + synchronous; never throws. */
export function lookupMlUrlRisk(query: IndicatorQuery): NormalizedThreatIntel {
  if (query.indicatorType !== "url") {
    return emptyIntel(ML_URL_RISK_PROVIDER, "MODEL_DERIVED", query, "BAD_REQUEST", "The URL risk model scores URLs only.");
  }
  let scored: ReturnType<typeof scoreUrlModel>;
  try {
    scored = scoreUrlModel(query.indicator);
  } catch {
    return emptyIntel(ML_URL_RISK_PROVIDER, "MODEL_DERIVED", query, "UPSTREAM_ERROR", "Model scoring failed.");
  }
  if (!scored) {
    return emptyIntel(ML_URL_RISK_PROVIDER, "MODEL_DERIVED", query, "BAD_REQUEST", "URL could not be featurized by the model.");
  }
  const status = modelStatus();
  return {
    indicator: query.indicator,
    indicatorType: query.indicatorType,
    provider: ML_URL_RISK_PROVIDER,
    sourceKind: "MODEL_DERIVED",
    status: "CONNECTED_DATA",
    // Model suggestion mapped conservatively: above-threshold is
    // SUSPICIOUS (needs analyst review), never MALICIOUS-by-model.
    verdict: scored.aboveThreshold ? "SUSPICIOUS" : "UNKNOWN",
    // Uncalibrated model output: surfaced as the raw score in confidence
    // position is misleading, so confidence stays null and the score goes
    // in detail. Never invent a probability.
    confidence: null,
    threatType: null,
    malwareFamily: null,
    firstSeen: null,
    lastSeen: null,
    reference: null,
    rawSourceId: null,
    sourceUrl: null,
    fetchedAt: new Date().toISOString(),
    detail: `model=${scored.version} status=${status} score=${scored.score.toFixed(4)} (uncalibrated) suggestion=${scored.aboveThreshold ? "MALICIOUS" : "LEGITIMATE"} review=${scored.reviewState}`,
  };
}

/** Health: is the model artifact loadable (no inference cost). */
export function mlUrlRiskHealth(): ProviderHealth {
  const started = Date.now();
  try {
    const version = modelVersion();
    return {
      name: ML_URL_RISK_PROVIDER,
      configured: true,
      status: "CONNECTED_DATA",
      lastCheckedAt: new Date().toISOString(),
      latencyMs: Date.now() - started,
      detail: `model=${version} status=${modelStatus()}; suggestions only, analyst review required`,
    };
  } catch {
    return {
      name: ML_URL_RISK_PROVIDER,
      configured: false,
      status: "NOT_CONFIGURED",
      lastCheckedAt: new Date().toISOString(),
      latencyMs: Date.now() - started,
      detail: "Model artifact unavailable.",
    };
  }
}
