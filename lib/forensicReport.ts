import type {
  CaseRow,
  EmailInvestigationRow,
  EvidenceRow,
  IndicatorRow,
  ReportRow,
} from "./db/types";
import { CATEGORY_LABELS, severityRank } from "./advancedForensics";
import type {
  AttachmentAnalysis,
  ExtractedEntity,
  ForensicFinding,
  ForensicVerdict,
  ScoreBreakdown,
  SMTPAnomaly,
  SpoofingComposite,
} from "./emailTypes";

export interface ReportEnvelope {
  title: string;
  content: string;
  caseNumber: string;
  generatedAt: string;
}

export function buildForensicReport(input: {
  caseRow: CaseRow;
  investigations: EmailInvestigationRow[];
  indicators: IndicatorRow[];
  previousReports: ReportRow[];
  evidence?: EvidenceRow[];
}): ReportEnvelope {
  const { caseRow, investigations, indicators } = input;
  const caseNumber = caseRow.case_number || caseRow.id;
  const generatedAt = new Date().toISOString();
  const investigation = investigations[0] as
    | (EmailInvestigationRow & {
        analysis?: Record<string, any> & {
          authentication?: {
            spf?: { status?: string; details?: string };
            dkim?: { status?: string; details?: string };
            dmarc?: { status?: string; details?: string };
          };
          senderDomain?: string;
          senderSpoofingDetected?: boolean;
          smtpPath?: Array<{
            from?: string;
            by?: string;
            ip?: string;
            timestamp?: string;
          }>;
          originatingIP?: string;
          ipIntelligence?: {
            ip?: string;
            country?: string;
            region?: string;
            city?: string;
            isp?: string;
            organization?: string;
            asn?: string;
          };
          domainIntelligence?: {
            domain?: string;
            mx?: string[];
            ns?: string[];
            suspicious?: boolean;
          };
          threatScore?: number;
          threatLevel?: string;
          findings?: string[];
          recommendations?: string[];
          structuredFindings?: ForensicFinding[];
          spoofing?: SpoofingComposite;
          smtpAnomalies?: SMTPAnomaly[];
          attachments?: AttachmentAnalysis[];
          entities?: ExtractedEntity[];
          scoreBreakdown?: ScoreBreakdown;
          verdict?: ForensicVerdict;
        };
      })
    | undefined;

  const analysis = investigation?.analysis || null;
  const verdict = analysis?.verdict;

  const lines: string[] = [
    "CYBER SAKHI — FORENSIC INVESTIGATION REPORT",
    "=============================================",
    `Case Number      : ${caseNumber}`,
    `Generated At     : ${generatedAt}`,
    `Case Status      : ${caseRow.status || "open"}`,
    `Investigation    : ${caseRow.threat_type || "EMAIL_SECURITY"}`,
    `Severity         : ${caseRow.severity || "unknown"}`,
    "",
    "NOTE: This report contains only technical forensic findings and the",
    "indicators extracted by Cyber Sakhi. Preserve the original raw email",
    "separately in the Evidence Locker. The Case Number above is the",
    "reference to include when reporting on cybercrime.gov.in.",
    "",
  ];

  if (analysis) {
    lines.push(
      "1. EXECUTIVE SUMMARY",
      "--------------------",
      verdict?.summary ||
        `Threat level assessed as ${
          analysis.threatLevel || "UNKNOWN"
        } with score ${analysis.threatScore ?? "N/A"}/100.`,
    );

    if (verdict && verdict.contributingSignals.length > 0) {
      lines.push("Contributing evidence (grouped signals):");
      for (const signal of verdict.contributingSignals) {
        lines.push(`  * ${signal}`);
      }
    }
    if (verdict) {
      lines.push(
        `Analysis confidence : ${Math.round(verdict.confidence * 100)}%`,
        `Verdict level      : ${verdict.level}`
      );
    }
    lines.push("");

    lines.push(
      "2. THREAT ASSESSMENT & RISK BREAKDOWN",
      "--------------------------------------",
      `Threat Level     : ${analysis.threatLevel || "UNKNOWN"}`,
      `Threat Score     : ${analysis.threatScore != null ? `${analysis.threatScore}/100` : "N/A"}`,
      `Sender Domain    : ${analysis.senderDomain || "N/A"}`,
      `Spoofing         : ${analysis.senderSpoofingDetected ? "DETECTED" : "Not detected"}`,
      `Originating IP   : ${analysis.originatingIP || "N/A"}`,
      "",
    );

    if (analysis.scoreBreakdown && analysis.scoreBreakdown.groups.length > 0) {
      lines.push("Score contributions (deterministic, explainable):");
      for (const g of analysis.scoreBreakdown.groups) {
        lines.push(`  +${g.points}  ${g.group} — ${g.reason}`);
      }
      lines.push("");
    }

    lines.push(
      "3. AUTHENTICATION",
      "-----------------",
      `SPF   : ${analysis.authentication?.spf?.status || "none"} ${analysis.authentication?.spf?.details || ""}`.trimEnd(),
      `DKIM  : ${analysis.authentication?.dkim?.status || "none"} ${analysis.authentication?.dkim?.details || ""}`.trimEnd(),
      `DMARC : ${analysis.authentication?.dmarc?.status || "none"} ${analysis.authentication?.dmarc?.details || ""}`.trimEnd(),
      "",
    );

    if (analysis.spoofing && analysis.spoofing.signals.length > 0) {
      lines.push("4. SENDER SPOOFING ANALYSIS");
      lines.push("----------------------------");
      lines.push(`Spoofing signals (${analysis.spoofing.signals.length}):`);
      for (const signal of analysis.spoofing.signals) {
        lines.push(`  - ${signal}`);
      }
      if (analysis.spoofing.lookalikeDetected) {
        lines.push("Lookalike / typosquatting domains detected against trusted brands.");
      }
      if (analysis.spoofing.punycodeDetected) {
        lines.push("Internationalized (punycode/IDN) domain used to mimic a trusted host.");
      }
      if (analysis.spoofing.homoglyphDetected) {
        lines.push("Confusable (homoglyph) characters detected that visually mimic Latin letters.");
      }
      if (analysis.spoofing.brandsLikelyImpersonated.length > 0) {
        lines.push(
          `Brands likely impersonated: ${analysis.spoofing.brandsLikelyImpersonated.join(", ")}`
        );
      }
      lines.push("");
    }

    lines.push(
      "5. SMTP RELAY PATH",
      "------------------",
    );

    const hopCount = analysis.smtpPath?.length ?? 0;
    if (hopCount === 0) {
      lines.push("No Received headers could be reconstructed.");
    } else {
      lines.push(`Relay hops reconstructed: ${hopCount} (chronological, origin first)`);
      const hops = [...(analysis.smtpPath || [])].reverse();
      hops.forEach((hop, index) => {
        lines.push(
          `  ${index + 1}. ${hop.from || "?"} -> ${hop.by || "?"}` +
            (hop.ip ? ` [IP ${hop.ip}]` : "") +
            (hop.timestamp ? ` (${hop.timestamp})` : "")
        );
      });
    }

    if (analysis.smtpAnomalies && analysis.smtpAnomalies.length > 0) {
      lines.push("Relay anomalies detected:");
      for (const a of analysis.smtpAnomalies) {
        if (a.severity === "SAFE") continue;
        lines.push(`  [${a.severity}] ${a.type.replace(/_/g, " ")} — ${a.description}`);
      }
    }
    lines.push("");

    if (analysis.domainIntelligence) {
      lines.push("6. DOMAIN INTELLIGENCE");
      lines.push("----------------------");
      lines.push(`Domain  : ${analysis.domainIntelligence.domain || "N/A"}`);
      lines.push(`MX      : ${analysis.domainIntelligence.mx?.join(", ") || "unavailable"}`);
      lines.push(`NS      : ${analysis.domainIntelligence.ns?.join(", ") || "unavailable"}`);
      lines.push(
        `Vetting : ${analysis.domainIntelligence.suspicious ? "SUSPICIOUS (unusual TLD/structure)" : "no heuristic flags raised"}`
      );
      lines.push(
        "Note: MX/NS were resolved via dns.google when reachable. No WHOIS, registrar,",
        "or paid reputation feed is integrated; domain age is UNAVAILABLE here."
      );
      lines.push("");
    }

    if (analysis.ipIntelligence) {
      lines.push("7. IP INTELLIGENCE");
      lines.push("------------------");
      const ip = analysis.ipIntelligence;
      lines.push(`IP         : ${ip.ip || "N/A"}`);
      lines.push(`Country    : ${ip.country || "unavailable"}`);
      lines.push(`Region     : ${ip.region || "unavailable"}`);
      lines.push(`City       : ${ip.city || "unavailable"}`);
      lines.push(`ISP/Org    : ${ip.isp || ip.organization || "unavailable"}`);
      lines.push(`ASN        : ${ip.asn || "unavailable"}`);
      lines.push(
        "Note: geolocation/ISP data from ipapi.co when reachable. IP reputation and",
        "proxy/VPN classification are UNAVAILABLE (no reputation provider integrated)."
      );
      lines.push("");
    }

    if (analysis.attachments && analysis.attachments.length > 0) {
      lines.push("8. ATTACHMENT ANALYSIS");
      lines.push("----------------------");
      for (const a of analysis.attachments) {
        lines.push(
          `  ${a.filename} (${a.extension || "no ext"}, mime=${a.mimeType || "n/a"}, est ${a.sizeEstimateBytes ?? "?"}B) ` +
            `doubleExtension=${a.doubleExtension} executable=${a.executable} script=${a.scriptLike} ` +
            `archive=${a.archive} macro=${a.macroHint} flagged=${a.suspicious}`
        );
      }
      lines.push("Note: attachments are analyzed structurally only. No content is ever executed or decoded.");
      lines.push("");
    }

    if (analysis.entities && analysis.entities.length > 0) {
      lines.push("9. SOCIAL ENGINEERING / ENTITY EXTRACTION");
      lines.push("-------------------------------------------");
      for (const e of analysis.entities) {
        lines.push(`  [${e.type.toUpperCase()}] ${e.value}`);
      }
      lines.push(
        "Note: entity extraction is pattern-based. It flags content types; it does not",
        "confirm whether any referenced organization/phone actually sent this email."
      );
      lines.push("");
    }

    if (analysis.structuredFindings && analysis.structuredFindings.length > 0) {
      lines.push("10. EVIDENCE-BACKED FINDINGS");
      lines.push("-----------------------------");
      const sorted = [...analysis.structuredFindings].sort(
        (a, b) => severityRank(b.severity) - severityRank(a.severity)
      );
      for (const f of sorted) {
        if (f.severity === "SAFE") continue;
        lines.push(`  [${f.severity}] ${CATEGORY_LABELS[f.category] || f.category}: ${f.description}`);
        lines.push(`      Confidence ${Math.round(f.confidence * 100)}% — ${f.humanExplanation}`);
      }
      lines.push("");
    }

    lines.push(
      "11. RECOMMENDATIONS",
      "--------------------",
      ...((analysis.findings?.length ?? 0) > 0
        ? analysis.findings!.map((f) => `- ${f}`)
        : ["No explicit findings."]),
      ...((analysis.recommendations?.length ?? 0) > 0
        ? analysis.recommendations!.map((r) => `- ${r}`)
        : [])
    );
  } else {
    lines.push("Analysis payload was not persisted for this case.");
  }

  if (input.evidence && input.evidence.length > 0) {
    lines.push(
      "",
      "12. LINKED EVIDENCE (EVIDENCE LOCKER)",
      "--------------------------------------",
    );
    for (const ev of input.evidence) {
      lines.push(
        `- ${ev.title || "unnamed evidence"} | code=${ev.evidence_code || "n/a"} | ` +
          `sha256=${ev.sha256 || "n/a"} | mime=${ev.mime_type || "n/a"} | at ${ev.created_at}`
      );
    }
    lines.push(
      "",
      "Chain-of-custody: reviewable inside the Evidence Locker for each item above.",
    );
  } else {
    lines.push(
      "",
      "12. LINKED EVIDENCE (EVIDENCE LOCKER)",
      "--------------------------------------",
      "No evidence is linked to this case yet. Save the raw email and this report",
      "to the Evidence Locker and re-run this report to print integrity hashes.",
    );
  }

  lines.push(
    "",
    "INDICATORS OF COMPROMISE",
    "------------------------",
  );

  if (indicators.length === 0) {
    lines.push("No indicators were extracted.");
  } else {
    for (const ind of indicators) {
      lines.push(
        `- [${ind.type.toUpperCase()}] ${ind.value}` +
          (ind.malicious ? " (SUSPICIOUS)" : "") +
          (ind.source ? ` — ${ind.source}` : "")
      );
    }
  }

  lines.push(
    "",
    "REPORTING RECOMMENDATIONS",
    "-------------------------",
    "1. Preserve the original raw email (do not delete, reply, or forward).",
    "2. Save this report and the email to the Cyber Sakhi Evidence Locker",
    "   to generate a SHA-256 integrity certificate.",
    "3. File a complaint at https://cybercrime.gov.in and quote the Case",
    `   Number ${caseNumber}.`,
    "4. For financial fraud, call the National Cyber Crime Helpline 1930",
    "   within the first hours of a transfer.",
    "",
    "This report was generated by Cyber Sakhi on " + generatedAt + ".",
    "Cyber Sakhi is not a law enforcement agency; this report is technical",
    "guidance to support victims of cyber crime.",
  );

  if (input.previousReports.length > 0) {
    lines.push(
      "",
      "PRIOR REPORTS FOR THIS CASE",
      "---------------------------",
      ...input.previousReports.map(
        (r) => `- ${r.id} (${r.report_type || "forensic"}) — ${r.created_at}`
      )
    );
  }

  return {
    title: `Forensic Report — ${caseNumber}`,
    content: lines.join("\n"),
    caseNumber,
    generatedAt,
  };
}