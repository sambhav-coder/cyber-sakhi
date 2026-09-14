import type { EmailAnalysisResult } from "@/lib/emailTypes";
import { createCase } from "@/lib/db/cases";
import { createEmailInvestigation } from "@/lib/db/emailInvestigations";
import { createIndicators } from "@/lib/db/indicators";
import type { CaseRow } from "./types";

export function classifyThreatType(
  result: EmailAnalysisResult
): string {
  const auth = result.authentication;
  const authFail =
    auth.spf.status === "fail" ||
    auth.dkim.status === "fail" ||
    auth.dmarc.status === "fail";

  if (authFail || result.senderSpoofingDetected) return "EMAIL_PHISHING";
  if (result.threatScore >= 40) return "EMAIL_FRAUD";
  return "EMAIL_INVESTIGATION";
}

function buildCaseTitle(result: EmailAnalysisResult): string {
  return (
    result.headers.subject?.trim().slice(0, 120) ||
    `Email Investigation — ${result.senderDomain || "unknown sender"}`
  );
}

function buildCaseDescription(
  result: EmailAnalysisResult,
  source: string
): string {
  const lines = [
    `Forensic scan of an email from ${result.senderDomain || "unknown sender"}.`,
    `Findings: ${result.findings.length}. Indicators: ${result.indicators.length}.`,
    result.senderSpoofingDetected
      ? "Spoofing signals detected."
      : "No spoofing signals detected.",
  ];
  if (source === "gmail") {
    lines.push("Analyzed through the Cyber Sakhi Gmail investigation flow.");
  }
  return lines.join(" ");
}

export interface CasePipelineResult {
  createdCase: CaseRow | null;
  caseSaveError?: string;
  investigationId?: string;
  indicatorSaveState: "ok" | "failed";
}

/**
 * Persists a completed email forensic analysis as a Case with its linked
 * email investigation record and extracted indicators. All-or-nothing only
 * for the case row itself; investigation and indicator saves are best-effort
 * so a failure there never erases the successfully created case.
 */
export async function persistCaseFromAnalysis(input: {
  userId: string;
  result: EmailAnalysisResult;
  source?: string;
  externalMessageId?: string | null;
}): Promise<CasePipelineResult> {
  const source = input.source ?? "pasted_headers";

  let createdCase: CaseRow | null = null;
  let caseSaveError: string | undefined;

  try {
    createdCase = await createCase({
      userId: input.userId,
      title: buildCaseTitle(input.result),
      description: buildCaseDescription(input.result, source),
      threatType: classifyThreatType(input.result),
      status: "open",
      severity: input.result.threatLevel,
    });
  } catch (caseError) {
    return {
      createdCase: null,
      caseSaveError:
        "Analysis succeeded but the case could not be persisted: " +
        (caseError instanceof Error ? caseError.message : "unknown error"),
      indicatorSaveState: "failed",
    };
  }

  let investigationId: string | undefined;
  try {
    const investigation = await createEmailInvestigation({
      userId: input.userId,
      caseId: createdCase.id,
      result: input.result,
      source,
      externalMessageId: input.externalMessageId ?? null,
    });
    investigationId = investigation.id;
  } catch {
    investigationId = undefined;
  }

  let indicatorSaveState: "ok" | "failed" = "ok";
  if (investigationId) {
    try {
      await createIndicators({
        investigationId,
        caseId: createdCase.id,
        indicators: input.result.indicators,
      });
    } catch {
      indicatorSaveState = "failed";
    }
  }

  return { createdCase, investigationId, indicatorSaveState };
}