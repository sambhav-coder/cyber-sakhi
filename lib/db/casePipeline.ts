import type { EmailAnalysisResult } from "@/lib/emailTypes";
import { createCase, getCaseForUser } from "@/lib/db/cases";
import {
  attachInvestigationToCase,
  createEmailInvestigation,
  getEmailInvestigationForUser,
  getInvestigationByExternalMessage,
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

/**
 * Government-console attribution derived from a finished email analysis.
 * Pure (no I/O) so the derivation is unit-testable without a database.
 *
 * Honesty rules (deliberate, matching lib/gov/govThreatCategories.ts):
 * - risk_level mirrors the analysis threatLevel 1:1. SAFE has no gov risk
 *   equivalent, so it stays NULL ("Unset") rather than inventing LOW.
 * - threat_category is PHISHING only when classifyThreatType yields
 *   EMAIL_PHISHING (auth failure or proven spoofing). EMAIL_FRAUD does not
 *   reliably denote financial fraud (reachable via the harassment engine
 *   alone), so it stays NULL ("Unclassified") instead of guessing.
 * - gov_status is always NEW: triage has not happened yet at creation.
 * - case_source records the workflow that produced the case.
 */
export function buildGovCaseFields(result: EmailAnalysisResult): {
  govStatus: string;
  riskLevel: string | null;
  threatCategory: string | null;
  caseSource: string;
} {
  const RISK_MAP: Record<string, string> = {
    CRITICAL: "CRITICAL",
    HIGH: "HIGH",
    MEDIUM: "MEDIUM",
    LOW: "LOW",
  };
  const threatType = classifyThreatType(result);
  return {
    govStatus: "NEW",
    riskLevel: RISK_MAP[result.threatLevel] ?? null,
    threatCategory: threatType === "EMAIL_PHISHING" ? "PHISHING" : null,
    caseSource: "email_forensics",
  };
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
  const gov = buildGovCaseFields(result);
  const createdCase = await createCase({
    userId: input.userId,
    title: buildCaseTitle(result),
    description: buildCaseDescription(result, source),
    threatType: classifyThreatType(result),
    status: "open",
    severity: result.threatLevel,
    govStatus: gov.govStatus,
    riskLevel: gov.riskLevel,
    threatCategory: gov.threatCategory,
    caseSource: gov.caseSource,
  });

  await attachInvestigationToCase(input.historyId, input.userId, createdCase.id);
  return createdCase;
}

export type IndicatorSaveState = "saved" | "partial" | "failed" | "skipped";

export interface PersistCaseResult {
  createdCase: CaseRow | null;
  caseSaveError?: string;
  indicatorSaveState: IndicatorSaveState;
  reusedExisting: boolean;
}

/**
 * One-shot persistence for flows (demo mailbox, Gmail) that analyze and
 * create a case together: investigation row + indicators + case, linked.
 * Idempotent per (user, source, externalMessageId): re-analyzing the same
 * message reuses the existing case instead of duplicating it. Indicator
 * persistence is best-effort and reported via indicatorSaveState — a
 * failed indicator write never fails the case itself.
 */
export async function persistCaseFromAnalysis(input: {
  userId: string;
  result: EmailAnalysisResult;
  source?: string;
  externalMessageId?: string | null;
}): Promise<PersistCaseResult> {
  const source = input.source ?? "pasted_headers";

  if (input.externalMessageId) {
    try {
      const prior = await getInvestigationByExternalMessage(input.userId, source, input.externalMessageId);
      if (prior?.case_id) {
        const existing = await getCaseForUser(prior.case_id, input.userId);
        if (existing) {
          return { createdCase: existing, indicatorSaveState: "skipped", reusedExisting: true };
        }
      }
    } catch {
      /* dedup lookup is best-effort; fall through to fresh persistence */
    }
  }

  let historyId: string;
  try {
    const investigation = await createEmailInvestigation({
      userId: input.userId,
      result: input.result,
      source,
      externalMessageId: input.externalMessageId ?? null,
    });
    historyId = investigation.id;
  } catch (error) {
    return {
      createdCase: null,
      caseSaveError: error instanceof Error ? error.message : "unknown error",
      indicatorSaveState: "skipped",
      reusedExisting: false,
    };
  }

  let indicatorSaveState: IndicatorSaveState = "saved";
  const indicators = input.result.indicators ?? [];
  if (indicators.length === 0) {
    indicatorSaveState = "skipped";
  } else {
    try {
      await createIndicators({ investigationId: historyId, indicators });
    } catch {
      indicatorSaveState = "failed";
    }
  }

  const gov = buildGovCaseFields(input.result);
  let createdCase: CaseRow;
  try {
    createdCase = await createCase({
      userId: input.userId,
      title: buildCaseTitle(input.result),
      description: buildCaseDescription(input.result, source),
      threatType: classifyThreatType(input.result),
      status: "open",
      severity: input.result.threatLevel,
      govStatus: gov.govStatus,
      riskLevel: gov.riskLevel,
      threatCategory: gov.threatCategory,
      caseSource: source === "pasted_headers" ? gov.caseSource : source,
    });
  } catch (error) {
    return {
      createdCase: null,
      caseSaveError: error instanceof Error ? error.message : "unknown error",
      indicatorSaveState,
      reusedExisting: false,
    };
  }

  try {
    await attachInvestigationToCase(historyId, input.userId, createdCase.id);
  } catch {
    /* linkage is best-effort; case + investigation both exist */
  }

  return { createdCase, indicatorSaveState, reusedExisting: false };
}
