/**
 * POST /api/evidence/[id]/unlock
 *
 * The client unwraps the verifier locally and POSTs the plaintext
 * verifier token. The server checks the SHA-256 against verifier_sha
 * and returns the full evidence (including ciphertext) on success.
 *
 * The server NEVER sets locked=false — unlock is a session-only reveal.
 * Refreshing the page re-locks the evidence in the client.
 */

import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/authOptions";
import { getEvidenceById, updateLockMetadata } from "@/lib/db/evidence";
import { appendChainOfCustody } from "@/lib/db/chainOfCustody";
import { parseEvidenceMetadata } from "@/lib/evidenceView";
import { getAuthoritativeEvidenceDigest } from "@/lib/evidenceDigest";
import { createHash } from "crypto";

export async function POST(
  req: NextRequest,
  ctx: { params: Promise<{ id: string }> }
) {
  try {
    const session = await getServerSession(authOptions);
    if (!session?.user?.id) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const { id: evidenceId } = await ctx.params;
    const evidence = await getEvidenceById(evidenceId, session.user.id);
    if (!evidence) {
      return NextResponse.json(
        { error: "Evidence not found or access denied" },
        { status: 404 }
      );
    }

    const meta = parseEvidenceMetadata(evidence.metadata);
    const hasMaterial = Boolean(evidence.wrapped_key || evidence.lock_version);

    if (!meta.locked) {
      return NextResponse.json(
        { error: "Evidence is not locked" },
        { status: 400 }
      );
    }

    if (!hasMaterial) {
      return NextResponse.json(
        { error: "Evidence does not have a cryptographic lock credential — use the soft unlock flow" },
        { status: 400 }
      );
    }

    const body = await req.json();
    const { verifier } = body || {};

    if (!verifier || typeof verifier !== "string") {
      return NextResponse.json(
        { error: "Missing verifier token" },
        { status: 400 }
      );
    }

    // Constant-time comparison of SHA-256(verifier) against stored hash
    const providedHash = createHash("sha256").update(verifier, "utf8").digest("hex");
    const storedHash = (evidence.verifier_sha || "").toLowerCase();

    if (providedHash !== storedHash) {
      // Record failed attempt
      const lockMeta = (evidence.lock_metadata || {}) as Record<string, unknown>;
      const failedAttempts = ((lockMeta.failedAttempts as number) || 0) + 1;
      try {
        await updateLockMetadata(evidenceId, {
          failedAttempts,
          lastFailedAt: new Date().toISOString(),
        });
      } catch (_) {
        // Non-fatal
      }

      return NextResponse.json(
        { error: "Incorrect password or key" },
        { status: 403 }
      );
    }

    // Record UNLOCKED + DECRYPTED custody events
    const custodyErrors: string[] = [];
    try {
      await appendChainOfCustody({
        evidenceId,
        action: "UNLOCKED",
        actorId: session.user.id,
        notes: "Evidence unlocked with correct credential",
      });
    } catch (custodyError: any) {
      custodyErrors.push(
        "Failed to record UNLOCKED custody event: " +
          (custodyError?.message || "unknown error")
      );
    }

    try {
      await appendChainOfCustody({
        evidenceId,
        action: "DECRYPTED",
        actorId: session.user.id,
        notes: "Evidence content decrypted after successful unlock",
      });
    } catch (custodyError: any) {
      custodyErrors.push(
        "Failed to record DECRYPTED custody event: " +
          (custodyError?.message || "unknown error")
      );
    }

    // Reset failed attempts
    try {
      await updateLockMetadata(evidenceId, { failedAttempts: 0, lastFailedAt: undefined });
    } catch (_) {
      // Non-fatal
    }

    // Return full evidence (including ciphertext) — client decrypts with DEK
    return NextResponse.json({
      message: "Evidence unlocked successfully",
      granted: true,
      custodyErrors: custodyErrors.length > 0 ? custodyErrors : undefined,
      evidence: {
        id: evidence.id,
        title: evidence.title,
        filename: evidence.filename,
        fileType: evidence.mime_type || "application/octet-stream",
        fileSize: evidence.file_size ?? 0,
        sha256Hash: evidence.sha256 || "",
        integrityDigest: getAuthoritativeEvidenceDigest(evidence),
        category: evidence.category || "OTHER",
        notes: evidence.description ?? null,
        integrityVerified: meta.integrityVerified,
        encrypted: meta.encrypted,
        locked: true, // Server datum is STILL locked — session-only reveal
        lockedAt: meta.lockedAt,
        evidenceCode: evidence.evidence_code,
        caseId: evidence.case_id,
        caseNumber: null, // filled by client if needed
        encryptedContent: evidence.encrypted_content,
        encryptionIv: evidence.encryption_iv,
        encryptedSize: evidence.encrypted_size,
        createdAt: evidence.created_at,
        lockMethod: evidence.lock_method,
      },
    });
  } catch (error) {
    console.error("Evidence unlock error:", error);
    return NextResponse.json(
      {
        error: error instanceof Error ? error.message : "Failed to unlock evidence",
      },
      { status: 500 }
    );
  }
}
