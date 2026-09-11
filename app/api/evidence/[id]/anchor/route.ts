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

    // Compute custody root
    const events = await listChainOfCustody(evidenceId);
    const custodyRoot = computeCustodyRoot(events);

    // Build deterministic payload + digest
    const { payload, digest } = buildEvidenceAnchorPayload({
      evidenceId,
      evidenceCode: evidence.evidence_code || evidenceId,
      sha256Hash: evidence.sha256 || "",
      custodyRootHash: custodyRoot,
    });

    if (dryRun) {
      return NextResponse.json({
        anchor: {
          submitted: false,
          status: "not_created",
          digest,
          payloadPrefix: payload.substring(0, 80) + (payload.length > 80 ? "..." : ""),
          providerMeta: getSafeProviderMeta(),
        },
        message: "Dry run — no transaction submitted",
      });
    }

    // Create anchor record (status = 'pending' initially)
    const anchorRecord = await createBlockchainAnchor({
      evidenceId,
      anchorType: "evidence",
      anchorVersion: 1,
      provider: getSafeProviderMeta().provider,
      networkName: getSafeProviderMeta().networkName,
      chainId: getSafeProviderMeta().chainId,
      payload,
      digest,
      payloadMetadata: { custodyRoot, sha256Hash: evidence.sha256 },
    });

    // Attempt real EVM transaction
    const result = await anchorEvidenceOnChain({
      scope: "evidence",
      evidenceId,
      payload,
      digest,
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
        digest,
        reason: result.reason,
      },
      providerMeta: getSafeProviderMeta(),
    });
  } catch (error) {
    console.error("Evidence anchor error:", error);
    return NextResponse.json(
      {
        error: error instanceof Error ? error.message : "Failed to anchor evidence",
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

    const anchor = await getLatestAnchorForEvidence(evidenceId);
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
      const events = await listChainOfCustody(evidenceId);
      const custodyRoot = computeCustodyRoot(events);
      const { digest: currentDigest } = buildEvidenceAnchorPayload({
        evidenceId,
        evidenceCode: evidence.evidence_code || evidenceId,
        sha256Hash: evidence.sha256 || "",
        custodyRootHash: custodyRoot,
      });

      verification = await verifyAnchorOnChain({
        record: {
          txHash: anchor.tx_hash,
          digest: anchor.anchored_digest,
          chainId: anchor.chain_id,
        },
        currentDigest,
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
        error: error instanceof Error ? error.message : "Failed to retrieve anchor status",
      },
      { status: 500 }
    );
  }
}
