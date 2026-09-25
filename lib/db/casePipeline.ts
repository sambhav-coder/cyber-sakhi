import type { EmailAnalysisResult } from "@/lib/emailTypes";
import { createCase, getCaseForUser } from "@/lib/db/cases";
import {
  attachInvestigationToCase,
  createEmailInvestigation,
  getEmailInvestigationForUser,
} from "@/lib/db/emailInvestigations";
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

export interface HistorySaveResult {
  historyId: string | null;
  historySaveError?: string;
}

/**
 * Default persistence for a manual analysis: an email investigation row (the
 * user's analysis history) plus its indicators, with no case. A case is only
 * created later if the user explicitly asks for one.
 */
export async function saveAnalysisToHistory(input: {
  userId: string;
  result: EmailAnalysisResult;
  source?: string;
  externalMessageId?: string | null;
}): Promise<HistorySaveResult> {
  let historyId: string;
  try {
    const investigation = await createEmailInvestigation({
      userId: input.userId,
      result: input.result,
      source: input.source ?? "pasted_headers",
      externalMessageId: input.externalMessageId ?? null,
    });
    historyId = investigation.id;
  } catch (error) {
    return {
      historyId: null,
      historySaveError: error instanceof Error ? error.message : "unknown error",
    };
  }

  try {
    await createIndicators({
      investigationId: historyId,
      indicators: input.result.indicators,
    });
  } catch {
    /* indicators are best-effort; the history entry itself is saved */
  }

  return { historyId };
}

/**
 * Promotes a saved history entry to a Case on request. Idempotent: if the
 * entry is already linked to a case the user owns, that case is returned.
 */
export async function createCaseFromHistory(input: {
  userId: string;
  historyId: string;
}): Promise<CaseRow | null> {
  const investigation = await getEmailInvestigationForUser(input.historyId, input.userId);
  if (!investigation) return null;

  if (investigation.case_id) {
    const existing = await getCaseForUser(investigation.case_id, input.userId);
    if (existing) return existing;
  }

  const result = investigation.analysis as EmailAnalysisResult;
  const source = investigation.source ?? "pasted_headers";
  const createdCase = await createCase({
    userId: input.userId,
    title: buildCaseTitle(result),
    description: buildCaseDescription(result, source),
    threatType: classifyThreatType(result),
    status: "open",
    severity: result.threatLevel,
  });

  await attachInvestigationToCase(input.historyId, input.userId, createdCase.id);
  return createdCase;
}
