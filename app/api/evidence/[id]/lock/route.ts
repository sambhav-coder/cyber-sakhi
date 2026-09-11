/**
 * POST /api/evidence/[id]/lock
 *
 * Apply a real cryptographic lock to evidence. The client derives a
 * KEK from the user's password via PBKDF2, wraps a per-evidence DEK
 * and a random verifier token, then POSTs the lock envelope here.
 *
 * The server stores only wrapped material — never a plaintext password
 * or raw DEK. The evidence is then re-encrypted with the per-evidence
 * DEK at the client layer (the server just stores the re-ciphertext).
 */

import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/authOptions";
import { getEvidenceById, applyEvidenceLock } from "@/lib/db/evidence";
import { appendChainOfCustody } from "@/lib/db/chainOfCustody";
import { parseEvidenceMetadata } from "@/lib/evidenceView";

function isHexString(value: string): boolean {
  return /^[0-9a-f]{64}$/i.test(value);
}

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

    if (hasMaterial) {
      return NextResponse.json(
        { error: "Evidence is already cryptographically locked" },
        { status: 409 }
      );
    }

    const body = await req.json();
    const {
      method,
      lockVersion,
      kdf,
      kdfSalt,
      kdfIterations,
      kdfParams,
      wrappedKey,
      wrappedKeyIv,
      verifierWrapped,
      verifierIv,
      verifierSha,
      reencryptedContent,
      reencryptedIv,
      reencryptedSize,
    } = body || {};

    // Validate required fields
    if (method !== "password" && method !== "security_key") {
      return NextResponse.json(
        { error: "Invalid lock method — must be 'password' or 'security_key'" },
        { status: 400 }
      );
    }
    if (lockVersion !== 1) {
      return NextResponse.json(
        { error: "Unsupported lock version" },
        { status: 400 }
      );
    }
    if (kdf !== "PBKDF2-SHA256") {
      return NextResponse.json(
        { error: "Unsupported KDF — must be PBKDF2-SHA256" },
        { status: 400 }
      );
    }
    if (!kdfSalt || !kdfIterations || !kdfParams || !wrappedKey || !wrappedKeyIv || !verifierWrapped || !verifierIv || !verifierSha) {
      return NextResponse.json(
        { error: "Missing required lock material fields" },
        { status: 400 }
      );
    }
    if (!isHexString(verifierSha)) {
      return NextResponse.json(
        { error: "Invalid verifier SHA-256 — must be 64-character hex" },
        { status: 400 }
      );
    }
    if (typeof kdfIterations !== "number" || kdfIterations < 100000) {
      return NextResponse.json(
        { error: "KDF iteration count too low — minimum 100,000" },
        { status: 400 }
      );
    }

    // Apply lock material
    const locked = await applyEvidenceLock(evidenceId, session.user.id, {
      lockMethod: method,
      lockVersion: lockVersion as number,
      kdf: kdf as string,
      kdfSalt: kdfSalt as string,
      kdfIterations: kdfIterations as number,
      kdfParams: kdfParams as Record<string, unknown>,
      wrappedKey: wrappedKey as string,
      wrappedKeyIv: wrappedKeyIv as string,
      verifierWrapped: verifierWrapped as string,
      verifierIv: verifierIv as string,
      verifierSha: verifierSha as string,
      reencryptedContent: reencryptedContent as string | undefined,
      reencryptedIv: reencryptedIv as string | undefined,
      reencryptedSize: reencryptedSize as number | undefined,
    });

    if (!locked) {
      return NextResponse.json(
        { error: "Evidence not found or access denied" },
        { status: 404 }
      );
    }

    // Record LOCKED custody event
    const custodyErrors: string[] = [];
    try {
      await appendChainOfCustody({
        evidenceId,
        action: "LOCKED",
        actorId: session.user.id,
        notes: `Evidence cryptographically locked with ${method} credential`,
      });
    } catch (custodyError: any) {
      custodyErrors.push(
        "Failed to record LOCKED custody event: " +
          (custodyError?.message || "unknown error")
      );
    }

    return NextResponse.json({
      message: "Evidence locked successfully",
      custodyErrors: custodyErrors.length > 0 ? custodyErrors : undefined,
      evidence: {
        id: locked.id,
        evidenceCode: locked.evidence_code,
        locked: true,
        lockedAt: (locked.metadata as Record<string, unknown>)?.lockedAt,
      },
    });
  } catch (error) {
    console.error("Evidence lock error:", error);
    return NextResponse.json(
      {
        error: error instanceof Error ? error.message : "Failed to lock evidence",
      },
      { status: 500 }
    );
  }
}
