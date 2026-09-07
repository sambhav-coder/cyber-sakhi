import { ThreatIndicator } from "./emailTypes";

export interface IndicatorCorrelation {
  indicator: ThreatIndicator;
  relatedFindings: string[];
  risk: "LOW" | "MEDIUM" | "HIGH";
  reason: string;
}

function normalize(value: string): string {
  return value.toLowerCase().trim();
}

function getRisk(
  indicator: ThreatIndicator,
  relatedFindings: string[]
): "LOW" | "MEDIUM" | "HIGH" {
  if (indicator.malicious === true) return "HIGH";

  const text = normalize(
    `${indicator.value} ${relatedFindings.join(" ")}`
  );

  if (
    text.includes("spf fail") ||
    text.includes("dkim") ||
    text.includes("dmarc fail") ||
    text.includes("spoofing") ||
    text.includes("phishing")
  ) {
    return "HIGH";
  }

  if (
    indicator.type === "url" ||
    text.includes("suspicious") ||
    text.includes("urgency") ||
    text.includes("kyc") ||
    text.includes("credential")
  ) {
    return "MEDIUM";
  }

  return "LOW";
}

function buildReason(
  indicator: ThreatIndicator,
  relatedFindings: string[]
): string {
  if (indicator.malicious === true) {
    return "Indicator is explicitly marked malicious.";
  }

  if (relatedFindings.length > 0) {
    return `Indicator is correlated with ${relatedFindings.length} forensic finding(s).`;
  }

  return "Indicator was extracted from the email but has no direct finding correlation.";
}

export function correlateIndicators(
  indicators: ThreatIndicator[],
  findings: string[]
): IndicatorCorrelation[] {
  return indicators.map((indicator) => {
    const indicatorValue = normalize(indicator.value);

    const relatedFindings = findings.filter((finding) => {
      const findingText = normalize(finding);

      if (
        indicator.type === "ip" ||
        indicator.type === "domain" ||
        indicator.type === "email"
      ) {
        return findingText.includes(indicatorValue);
      }

      if (indicator.type === "url") {
        return (
          findingText.includes(indicatorValue) ||
          findingText.includes("url") ||
          findingText.includes("redirect")
        );
      }

      return false;
    });

    const risk = getRisk(indicator, relatedFindings);

    return {
      indicator,
      relatedFindings,
      risk,
      reason: buildReason(indicator, relatedFindings),
    };
  });
}
