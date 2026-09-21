/**
 * POST /api/evidence/[id]/anchor
 * GET  /api/evidence/[id]/anchor
 *
 * Real blockchain anchoring for a single evidence item.
 * - POST triggers an EVM transaction (data-carrier) when blockchain is configured.
 *   Returns honest status: not_created, unavailable, confirmed, or failed.
 * - GET returns the anchor status + optional on-chain verification.
 *
 * Security: no plaintext evidence or keys are ever written on-chain.
 * Digest is SHA-256 of the deterministic payload string.
 */

import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/authOptions";
import { getEvidenceById, setEvidenceAnchorLink } from "@/lib/db/evidence";
import { appendChainOfCustody, listChainOfCustody } from "@/lib/db/chainOfCustody";
import {
  getLatestAnchorForEvidence,
  createBlockchainAnchor,
  updateBlockchainAnchor,
} from "@/lib/db/blockchainAnchors";
import { parseEvidenceMetadata } from "@/lib/evidenceView";
import {
  buildEvidenceAnchorPayload,
  anchorEvidenceOnChain,
  verifyAnchorOnChain,
  getSafeProviderMeta,
} from "@/lib/blockchain/anchor";
import { computeCustodyRoot } from "@/lib/db/chainOfCustody";
import { getCanonicalEvidenceDigest } from "@/lib/evidenceDigest";
import { sanitizeBlockchainErrorMessage } from "@/lib/blockchain/errorSanitizer";

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

    const body = (await req.json().catch(() => ({}))) || {};
    const dryRun = body.dryRun === true;

    // Custody root — audit-only metadata on the anchor record. Deliberately NOT
    // included in the committed digest (the custody chain is mutable, so it
    // would break verification of unchanged evidence).
    const events = await listChainOfCustody(evidenceId);
    const custodyRoot = computeCustodyRoot(events);

    // The canonical evidence digest — the single commitment used by BOTH this
    // anchor path and the verify path (getCanonicalEvidenceDigest). It is a
    // pure function of the stored evidence bytes and never depends on the
    // mutable custody chain, so an unchanged evidence always reproduces the
    // same digest and verification passes for a real cryptographic match.
    const canonicalDigest = getCanonicalEvidenceDigest({
      encryptedContent: evidence.encrypted_content,
      sha256: evidence.sha256,
      metadata: evidence.metadata,
    });
    const { payload } = buildEvidenceAnchorPayload({
      evidenceCode: evidence.evidence_code || evidenceId,
      sha256Hash: canonicalDigest,
    });

    if (dryRun) {
      return NextResponse.json({
        anchor: {
          submitted: false,
          status: "not_created",
          digest: canonicalDigest,
          payloadPrefix: payload.substring(0, 80) + (payload.length > 80 ? "..." : ""),
          providerMeta: getSafeProviderMeta(),
        },
        message: "Dry run — no transaction submitted",
      });
    }

    // Idempotency: if a confirmed anchor with this exact canonical digest
    // already exists, reuse it instead of submitting a duplicate transaction
    // for logically identical evidence state.
    const existing = await getLatestAnchorForEvidence(evidenceId, "evidence");
    if (existing && existing.status === "confirmed" && existing.anchored_digest === canonicalDigest) {
      return NextResponse.json({
        message: "Evidence is already anchored with this exact digest — no new transaction created",
        anchor: {
          anchorId: existing.id,
          status: existing.status,
          submitted: false,
          txHash: existing.tx_hash,
          blockNumber: existing.block_number,
          chainId: existing.chain_id,
          networkName: existing.network_name,
          anchoredAt: existing.anchored_at,
          digest: canonicalDigest,
          reason: "An identical confirmed anchor already exists",
        },
        providerMeta: getSafeProviderMeta(),
      });
    }

    // Create anchor record (status = 'pending' initially)
    const anchorRecord = await createBlockchainAnchor({
      evidenceId,
      anchorType: "evidence",
      anchorVersion: 2,
      provider: getSafeProviderMeta().provider,
      networkName: getSafeProviderMeta().networkName,
      chainId: getSafeProviderMeta().chainId,
      payload,
      digest: canonicalDigest,
      payloadMetadata: { custodyRoot, sha256Hash: canonicalDigest },
    });

    // Attempt real EVM transaction
    const result = await anchorEvidenceOnChain({
      scope: "evidence",
      evidenceId,
      payload,
      digest: canonicalDigest,
    });

    // Update anchor record with actual tx result
    await updateBlockchainAnchor(anchorRecord.id, {
      status: result.status,
      txHash: result.txHash,
      blockNumber: result.blockNumber,
      chainId: result.chainId,
      networkName: result.networkName,
      anchoredAt: result.anchoredAt,
      transactionTimestamp: result.anchoredAt,
    });

    // Link anchor to evidence
    if (result.submitted) {
      await setEvidenceAnchorLink(evidenceId, anchorRecord.id);
    }

    // Record custody event (best-effort)
    try {
      await appendChainOfCustody({
        evidenceId,
        action: result.submitted ? "ANCHORED" : "ANCHOR_ATTEMPTED",
        actorId: session.user.id,
        notes: result.submitted
          ? `Blockchain anchor confirmed: ${result.txHash}`
          : `Anchor attempt: ${result.status} — ${result.reason || "no reason"}`,
      });
    } catch (_) {
      // Non-fatal
    }

    return NextResponse.json({
      message: result.submitted
        ? "Blockchain anchor confirmed"
        : `Anchor attempt: ${result.status}`,
      anchor: {
        anchorId: anchorRecord.id,
        status: result.status,
        submitted: result.submitted,
        txHash: result.txHash,
        blockNumber: result.blockNumber,
        chainId: result.chainId,
        networkName: result.networkName,
        anchoredAt: result.anchoredAt,
        digest: canonicalDigest,
        reason: result.reason,
      },
      providerMeta: getSafeProviderMeta(),
    });
  } catch (error) {
    console.error("Evidence anchor error:", error);
    return NextResponse.json(
      {
        error:
          error instanceof Error
            ? sanitizeBlockchainErrorMessage(error)
            : "Failed to anchor evidence",
      },
      { status: 500 }
    );
  }
}

export async function GET(
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

    // Verify against the EVIDENCE anchor for THIS evidence id, never against a
    // different anchor record (batch/custody-chain anchors are excluded by the
    // anchor_type filter below).
    const anchor = await getLatestAnchorForEvidence(evidenceId, "evidence");
    if (!anchor) {
      return NextResponse.json({
        anchor: null,
        status: "not_created",
        message: "No blockchain anchor exists for this evidence",
        providerMeta: getSafeProviderMeta(),
      });
    }

    const { searchParams } = new URL(req.url);
    const verify = searchParams.get("verify") === "true";

    let verification = null;
    if (verify) {
      // Recompute the canonical digest from the CURRENT stored bytes. This is
      // the exact same canonicalization used at anchor time, so unchanged
      // evidence reproduces the committed digest while modified evidence
      // produces a different digest and fails verification.
      const currentDigest = getCanonicalEvidenceDigest({
        encryptedContent: evidence.encrypted_content,
        sha256: evidence.sha256,
        metadata: evidence.metadata,
      });

      verification = await verifyAnchorOnChain({
        record: {
          txHash: anchor.tx_hash,
          digest: anchor.anchored_digest,
          chainId: anchor.chain_id,
        },
        currentDigest,
        evidenceId,
      });

      // Update status if verification found mismatch
      if (verification.status === "digest_mismatch" && anchor.status !== "digest_mismatch") {
        await updateBlockchainAnchor(anchor.id, { status: "digest_mismatch" });
      }
    }

    return NextResponse.json({
      anchor: {
        id: anchor.id,
        anchorType: anchor.anchor_type,
        status: anchor.status,
        txHash: anchor.tx_hash,
        blockNumber: anchor.block_number,
        chainId: anchor.chain_id,
        networkName: anchor.network_name,
        digest: anchor.anchored_digest,
        anchoredAt: anchor.anchored_at,
        provider: anchor.provider,
        anchorVersion: anchor.anchor_version,
        createdAt: anchor.created_at,
      },
      verification,
      providerMeta: getSafeProviderMeta(),
    });
  } catch (error) {
    console.error("Evidence anchor status error:", error);
    return NextResponse.json(
      {
        error:
          error instanceof Error
            ? sanitizeBlockchainErrorMessage(error)
            : "Failed to retrieve anchor status",
      },
      { status: 500 }
    );
  }
}
