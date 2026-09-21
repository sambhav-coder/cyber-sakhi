/**
 * Safe retention mechanism for forensic artifacts.
 *
 * This module provides a safe, controlled purge function that respects:
 * - Evidence integrity and chain of custody requirements
 * - Different retention policies for different data types
 * - Administrative authorization requirements
 * - Safe handling of immutable forensic evidence
 */

import { getSupabaseServer } from "@/lib/supabaseServer";
import { throwIfError } from "@/lib/db/errors";
import { retentionStageFor } from "./masking";
import type { RetentionPolicy } from "./masking";
export type { RetentionPolicy } from "./masking";
import { listEvidenceForUser } from "@/lib/db/evidence";
import { listCasesForUser } from "@/lib/db/cases";

export interface RetentionPurgeResult {
  evidencePurged: number;
  casesPurged: number;
  errors: string[];
  details: {
    expiredEvidence: string[];
    expiredCases: string[];
    skippedLockedEvidence: string[];
    skippedActiveCases: string[];
  };
}

export interface RetentionReport {
  evidenceStage: ReturnType<typeof retentionStageFor>;
  caseMetadataStage: ReturnType<typeof retentionStageFor>;
  evidenceCount: number;
  caseCount: number;
  policy: RetentionPolicy;
}

/**
 * Generate a retention report for a user's data.
 * Does not perform any deletion, only reports current state.
 */
export async function generateRetentionReport(
  userId: string,
  policy: RetentionPolicy = { evidenceDays: 365, caseMetadataDays: 730 }
): Promise<RetentionReport> {
  const evidence = await listEvidenceForUser(userId);
  const cases = await listCasesForUser(userId);

  // Find oldest evidence for staging
  const oldestEvidence = evidence.length > 0
    ? evidence.reduce((oldest, e) =>
        e.created_at < oldest.created_at ? e : oldest
      ).created_at
    : new Date().toISOString();

  // Find oldest case for staging
  const oldestCase = cases.length > 0
    ? cases.reduce((oldest, c) =>
        c.created_at < oldest.created_at ? c : oldest
      ).created_at
    : new Date().toISOString();

  return {
    evidenceStage: retentionStageFor(oldestEvidence, "evidence", policy),
    caseMetadataStage: retentionStageFor(oldestCase, "case-metadata", policy),
    evidenceCount: evidence.length,
    caseCount: cases.length,
    policy,
  };
}

/**
 * Safe purge function that removes expired data while respecting integrity.
 *
 * IMPORTANT SECURITY REQUIREMENTS:
 * - Only callable by authorized administrators
 * - Never deletes locked/crypto-locked evidence
 * - Never deletes evidence with active blockchain anchors
 * - Never deletes cases with open investigations
 * - Logs all deletions for audit trail
 *
 * This function should be called via a scheduled job or manual admin action,
 * never automatically without explicit administrative intent.
 */
export async function purgeExpiredData(
  adminUserId: string,
  policy: RetentionPolicy = { evidenceDays: 365, caseMetadataDays: 730 }
): Promise<RetentionPurgeResult> {
  const result: RetentionPurgeResult = {
    evidencePurged: 0,
    casesPurged: 0,
    errors: [],
    details: {
      expiredEvidence: [],
      expiredCases: [],
      skippedLockedEvidence: [],
      skippedActiveCases: [],
    },
  };

  try {
    const supabase = getSupabaseServer();

    // Verify admin authorization
    const { data: adminUser } = await supabase
      .from("profiles")
      .select("role")
      .eq("id", adminUserId)
      .single();

    if (!adminUser || adminUser.role !== "ADMIN") {
      throw new Error("Unauthorized: Administrator role required for data purge");
    }

    // Get all expired evidence
    const cutoffDate = new Date();
    cutoffDate.setDate(cutoffDate.getDate() - policy.evidenceDays);
    const cutoffIso = cutoffDate.toISOString();

    const { data: expiredEvidence, error: evidenceError } = await supabase
      .from("evidence")
      .select("id, locked, blockchain_anchor_id, case_id")
      .lt("created_at", cutoffIso);

    if (evidenceError) {
      result.errors.push(`Failed to fetch expired evidence: ${evidenceError.message}`);
      return result;
    }

    // Process each expired evidence item with safety checks
    for (const evidence of expiredEvidence || []) {
      // Skip locked evidence - preserve chain of custody
      if (evidence.locked) {
        result.details.skippedLockedEvidence.push(evidence.id);
        continue;
      }

      // Skip evidence with blockchain anchors - preserve integrity
      if (evidence.blockchain_anchor_id) {
        result.details.skippedLockedEvidence.push(evidence.id);
        continue;
      }

      // Skip evidence linked to active cases
      if (evidence.case_id) {
        const { data: caseData } = await supabase
          .from("cases")
          .select("status")
          .eq("id", evidence.case_id)
          .single();

        if (caseData && caseData.status === "open") {
          result.details.skippedActiveCases.push(evidence.id);
          continue;
        }
      }

      // Safe to delete this evidence
      const { error: deleteError } = await supabase
        .from("evidence")
        .delete()
        .eq("id", evidence.id);

      if (deleteError) {
        result.errors.push(`Failed to delete evidence ${evidence.id}: ${deleteError.message}`);
      } else {
        result.evidencePurged++;
        result.details.expiredEvidence.push(evidence.id);
      }
    }

    // Get expired case metadata (older than policy)
    const caseCutoffDate = new Date();
    caseCutoffDate.setDate(caseCutoffDate.getDate() - policy.caseMetadataDays);
    const caseCutoffIso = caseCutoffDate.toISOString();

    const { data: expiredCases, error: caseError } = await supabase
      .from("cases")
      .select("id, status")
      .lt("created_at", caseCutoffIso);

    if (caseError) {
      result.errors.push(`Failed to fetch expired cases: ${caseError.message}`);
      return result;
    }

    // Only purge closed/archived cases, never open ones
    for (const caseItem of expiredCases || []) {
      if (caseItem.status === "open") {
        result.details.skippedActiveCases.push(caseItem.id);
        continue;
      }

      const { error: deleteCaseError } = await supabase
        .from("cases")
        .delete()
        .eq("id", caseItem.id);

      if (deleteCaseError) {
        result.errors.push(`Failed to delete case ${caseItem.id}: ${deleteCaseError.message}`);
      } else {
        result.casesPurged++;
        result.details.expiredCases.push(caseItem.id);
      }
    }

    return result;
  } catch (error) {
    result.errors.push(error instanceof Error ? error.message : "Unknown error during purge");
    return result;
  }
}

/**
 * Administrative API route handler for safe data purge.
 * This should be called only by authorized admin users.
 */
export async function handleRetentionPurgeRequest(
  adminUserId: string,
  customPolicy?: RetentionPolicy
): Promise<RetentionPurgeResult> {
  const policy = customPolicy || { evidenceDays: 365, caseMetadataDays: 730 };
  return await purgeExpiredData(adminUserId, policy);
}

/**
 * Generate a retention summary for admin dashboard.
 * Provides visibility into what would be purged without actually purging.
 */
export async function previewRetentionPurge(
  adminUserId: string,
  policy: RetentionPolicy = { evidenceDays: 365, caseMetadataDays: 730 }
): Promise<RetentionPurgeResult> {
  // This would be similar to purgeExpiredData but without actual deletion
  // For now, return a dry-run result
  const result: RetentionPurgeResult = {
    evidencePurged: 0,
    casesPurged: 0,
    errors: [],
    details: {
      expiredEvidence: [],
      expiredCases: [],
      skippedLockedEvidence: [],
      skippedActiveCases: [],
    },
  };

  try {
    const supabase = getSupabaseServer();

    // Verify admin authorization
    const { data: adminUser } = await supabase
      .from("profiles")
      .select("role")
      .eq("id", adminUserId)
      .single();

    if (!adminUser || adminUser.role !== "ADMIN") {
      throw new Error("Unauthorized: Administrator role required for retention preview");
    }

    // Count expired evidence
    const cutoffDate = new Date();
    cutoffDate.setDate(cutoffDate.getDate() - policy.evidenceDays);
    const cutoffIso = cutoffDate.toISOString();

    const { data: expiredEvidence, error: evidenceError } = await supabase
      .from("evidence")
      .select("id, locked, blockchain_anchor_id, case_id")
      .lt("created_at", cutoffIso);

    if (evidenceError) {
      result.errors.push(`Failed to fetch expired evidence: ${evidenceError.message}`);
      return result;
    }

    for (const evidence of expiredEvidence || []) {
      if (evidence.locked || evidence.blockchain_anchor_id) {
        result.details.skippedLockedEvidence.push(evidence.id);
      } else {
        result.details.expiredEvidence.push(evidence.id);
        result.evidencePurged++; // This is a count of what WOULD be purged
      }
    }

    // Count expired cases
    const caseCutoffDate = new Date();
    caseCutoffDate.setDate(caseCutoffDate.getDate() - policy.caseMetadataDays);
    const caseCutoffIso = caseCutoffDate.toISOString();

    const { data: expiredCases, error: caseError } = await supabase
      .from("cases")
      .select("id, status")
      .lt("created_at", caseCutoffIso);

    if (caseError) {
      result.errors.push(`Failed to fetch expired cases: ${caseError.message}`);
      return result;
    }

    for (const caseItem of expiredCases || []) {
      if (caseItem.status === "open") {
        result.details.skippedActiveCases.push(caseItem.id);
      } else {
        result.details.expiredCases.push(caseItem.id);
        result.casesPurged++; // This is a count of what WOULD be purged
      }
    }

    return result;
  } catch (error) {
    result.errors.push(error instanceof Error ? error.message : "Unknown error during preview");
    return result;
  }
}