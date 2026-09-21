/**
 * Alert generation policy for a completed email forensic analysis.
 *
 * Alerts are derived, transparent decision objects: a rule id, a severity, a
 * human-readable justification, and a suggested delivery channel. Nothing is
 * sent anywhere from this module — delivery is the caller's (notification
 * service) responsibility.
 */

import type { EmailAnalysisResult } from "./emailTypes";

export type AlertSeverity = "LOW" | "MEDIUM" | "HIGH" | "CRITICAL";
export type AlertChannel = "in-app" | "email" | "sms";

export interface Alert {
  id: string;
  ruleId: string;
  severity: AlertSeverity;
  title: string;
  detail: string;
  channel: AlertChannel;
}

export interface AlertPolicy {
  /** Minimum derived score to emit an alert at all. 0..100, default 40. */
  minScore: number;
  capTo: number;
  enableSms?: boolean;
}

export interface AlertRuleContext {
  score: number;
  level: EmailAnalysisResult["threatLevel"];
  spoofing: EmailAnalysisResult["spoofing"];
  auth: EmailAnalysisResult["authentication"];
  dnsAuth: EmailAnalysisResult["dnsAuth"];
  threatIntel: EmailAnalysisResult["threatIntel"];
  bec: EmailAnalysisResult["bec"];
  ml: EmailAnalysisResult["ml"];
  harassmentLevel: EmailAnalysisResult["threatLevel"];
  urlSuspiciousCount: number;
  attachmentFlags: number;
  attribution?: EmailAnalysisResult["attribution"];
}

function rules(ctx: AlertRuleContext, smsOk: boolean): Alert[] {
  const alerts: Alert[] = [];
  const n = () => alerts.length;

  if (
    ctx.harassmentLevel === "HIGH" ||
    ctx.harassmentLevel === "CRITICAL"
  ) {
    alerts.push({
      id: `AL-${n()}-HR`,
      ruleId: "HR-01",
      severity: "CRITICAL",
      title: "Credible harassment / threat content in email",
      detail:
        "The content (or its threat engine score) indicates credible harassment. This overrides every other alert.",
      channel: smsOk ? "sms" : "email",
    });
  }

  if (ctx.score >= 65 || ctx.level === "CRITICAL" || ctx.level === "HIGH") {
    alerts.push({
      id: `AL-${n()}-SC`,
      ruleId: "SC-02",
      severity: ctx.score >= 65 ? "CRITICAL" : "HIGH",
      title: `High threat score (${ctx.score}/100)`,
      detail: "Multiple independent signals correlate. Possible fraud or phishing.",
      channel: smsOk ? "sms" : "email",
    });
  }

  if (ctx.spoofing?.detected) {
    const critical = ctx.auth.spf?.status === "fail" || ctx.auth.dkim?.status === "fail";
    alerts.push({
      id: `AL-${n()}-SF`,
      ruleId: "SF-03",
      severity: critical ? "CRITICAL" : "HIGH",
      title: "Sender identity likely forged",
      detail: `Spoofing signals: ${ctx.spoofing.signals.join(", ")}.`,
      channel: "email",
    });
  }

  if (ctx.dnsAuth && (ctx.dnsAuth.spf.headerVerdictMismatch || ctx.dnsAuth.dmarc.headerVerdictMismatch)) {
    alerts.push({
      id: `AL-${n()}-DX`,
      ruleId: "DX-04",
      severity: "HIGH",
      title: "Authentication-Results contradicts published DNS policy",
      detail:
        "The header claim does not match the domain's actual SPF/DMARC records — the auth chain is not trustworthy.",
      channel: "email",
    });
  }

  if (ctx.threatIntel && (ctx.threatIntel.ip?.listed || ctx.threatIntel.domain?.listed)) {
    alerts.push({
      id: `AL-${n()}-TI`,
      ruleId: "TI-05",
      severity: "HIGH",
      title: "Sender infrastructure on DNS blocklists",
      detail:
        "The originating IP or sender domain appears in Spamhaus/SURBL listings used by mail servers.",
      channel: "in-app",
    });
  }

  if (ctx.bec?.detected) {
    alerts.push({
      id: `AL-${n()}-BC`,
      ruleId: "BC-06",
      severity: "HIGH",
      title: "Business Email Compromise behavioural profile",
      detail: ctx.bec.summary,
      channel: "email",
    });
  }

  if (ctx.ml?.available && ctx.ml.label && ctx.ml.label !== "legitimate") {
    const prop = ctx.ml.confidence ?? 0;
    if (prop >= 0.85) {
      alerts.push({
        id: `AL-${n()}-ML`,
        ruleId: "ML-07",
        severity: ctx.ml.label === "phishing" || ctx.ml.label === "impersonated" ? "HIGH" : "MEDIUM",
        title: `Trained classifier: "${ctx.ml.label}" (${Math.round(prop * 100)}%)`,
        detail:
          "Model probability above 85%. Statistical, so still corroborate with header/routing evidence.",
        channel: "in-app",
      });
    }
  }

  if (ctx.urlSuspiciousCount > 0 && ctx.attachmentFlags > 0) {
    alerts.push({
      id: `AL-${n()}-UA`,
      ruleId: "UA-08",
      severity: "MEDIUM",
      title: "Suspicious links and attachments together",
      detail: `${ctx.urlSuspiciousCount} suspicious link(s) and ${ctx.attachmentFlags} flagged attachment(s).`,
      channel: "in-app",
    });
  }

  return alerts;
}

const SEVERITY_ORDER: Record<AlertSeverity, number> = { LOW: 0, MEDIUM: 1, HIGH: 2, CRITICAL: 3 };

export function generateAlerts(
  r: EmailAnalysisResult,
  policy: AlertPolicy = { minScore: 40, capTo: 8 },
  harassment: { threatLevel?: string; score?: number } | null | undefined = null
): Alert[] {
  const urlSuspiciousCount = (r.urlRisk ?? []).filter(
    (u) => u.severity === "HIGH" || u.severity === "MEDIUM"
  ).length;
  const attachmentFlags = (r.attachments ?? []).filter((a) => a.suspicious).length;

  const ctx: AlertRuleContext = {
    score: r.threatScore,
    level: r.threatLevel,
    spoofing: r.spoofing,
    auth: r.authentication,
    dnsAuth: r.dnsAuth,
    threatIntel: r.threatIntel,
    bec: r.bec,
    ml: r.ml,
    harassmentLevel: (harassment?.threatLevel ?? r.threatLevel) as AlertRuleContext["harassmentLevel"],
    urlSuspiciousCount,
    attachmentFlags,
    attribution: r.attribution,
  };

  let alerts = rules(ctx, policy.enableSms ?? false);

  if (r.threatScore < policy.minScore) {
    alerts = alerts.filter((a) => a.ruleId === "HR-01"); // harassment always fires
  }

  alerts.sort((a, b) => SEVERITY_ORDER[b.severity] - SEVERITY_ORDER[a.severity]);
  return alerts.slice(0, policy.capTo);
}