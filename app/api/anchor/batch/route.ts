/**
 * POST /api/anchor/batch
 * GET  /api/anchor/batch
 *
 * Batch blockchain anchoring for multiple evidence items.
 * Uses a Merkle root over individual evidence digests for a single on-chain commit.
 * Honest: if blockchain is not configured, no transaction is created.
 *
 * POST { evidenceIds: string[], dryRun?: boolean }
 * GET  returns batch anchor history (latest per evidence)
 */

import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/authOptions";
import { getEvidenceById } from "@/lib/db/evidence";
import { getLatestAnchorForEvidence, createBlockchainAnchor, updateBlockchainAnchor } from "@/lib/db/blockchainAnchors";
import { getCanonicalEvidenceDigest } from "@/lib/evidenceDigest";
import { sanitizeBlockchainErrorMessage } from "@/lib/blockchain/errorSanitizer";
import {
  buildBatchAnchorPayload,
  anchorEvidenceOnChain,
  getSafeProviderMeta,
} from "@/lib/blockchain/anchor";

export async function POST(req: NextRequest) {
  try {
    const session = await getServerSession(authOptions);
    if (!session?.user?.id) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const body = await req.json();
    const { evidenceIds, dryRun } = body || {};

    if (!Array.isArray(evidenceIds) || evidenceIds.length === 0) {
      return NextResponse.json(
        { error: "evidenceIds must be a non-empty array" },
        { status: 400 }
      );
    }

    if (evidenceIds.length > 50) {
      return NextResponse.json(
        { error: "Batch size limited to 50 evidence items" },
        { status: 400 }
      );
    }

    // Verify ownership and collect digests
    const evidenceDigests: string[] = [];
    const verifiedIds: string[] = [];

    for (const eid of evidenceIds) {
      const ev = await getEvidenceById(eid, session.user.id);
      if (!ev) continue; // skip unauthorized items silently

      // Batch leaves are the canonical evidence digests (the same digest used
      // for single-evidence anchors and verification).
      evidenceDigests.push(
        getCanonicalEvidenceDigest({
          encryptedContent: ev.encrypted_content,
          sha256: ev.sha256,
          metadata: ev.metadata,
        })
      );
      verifiedIds.push(eid);
    }

    if (verifiedIds.length === 0) {
      return NextResponse.json(
        { error: "No valid evidence items found" },
        { status: 404 }
      );
    }

    // Build batch payload with Merkle root
    const { payload, digest, merkleRoot } = buildBatchAnchorPayload({
      evidenceIds: verifiedIds,
      evidenceDigests,
      batchSize: verifiedIds.length,
    });

    if (dryRun) {
      return NextResponse.json({
        anchor: {
          submitted: false,
          status: "not_created",
          digest,
          merkleRoot,
          evidenceCount: verifiedIds.length,
          payloadPrefix: payload.substring(0, 80) + (payload.length > 80 ? "..." : ""),
          providerMeta: getSafeProviderMeta(),
        },
        message: "Dry run — no transaction submitted",
      });
    }

    // Create batch anchor record
    const anchorRecord = await createBlockchainAnchor({
      evidenceId: null, // batch anchor is not tied to a single evidence
      anchorType: "batch",
      anchorVersion: 1,
      provider: getSafeProviderMeta().provider,
      networkName: getSafeProviderMeta().networkName,
      chainId: getSafeProviderMeta().chainId,
      payload,
      digest,
      payloadMetadata: { merkleRoot, evidenceIds: verifiedIds, evidenceCount: verifiedIds.length },
    });

    // Attempt real EVM transaction
    const result = await anchorEvidenceOnChain({
      scope: "batch",
      payload,
      digest,
    });

    // Update anchor record
    await updateBlockchainAnchor(anchorRecord.id, {
      status: result.status,
      txHash: result.txHash,
      blockNumber: result.blockNumber,
      chainId: result.chainId,
      networkName: result.networkName,
      anchoredAt: result.anchoredAt,
      transactionTimestamp: result.anchoredAt,
    });

    return NextResponse.json({
      message: result.submitted
        ? `Batch anchor confirmed for ${verifiedIds.length} evidence items`
        : `Batch anchor attempt: ${result.status}`,
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
        merkleRoot,
        evidenceCount: verifiedIds.length,
        reason: result.reason,
      },
      providerMeta: getSafeProviderMeta(),
    });
  } catch (error) {
    console.error("Batch anchor error:", error);
    return NextResponse.json(
      {
        error:
          error instanceof Error
            ? sanitizeBlockchainErrorMessage(error)
            : "Failed to batch anchor",
      },
      { status: 500 }
    );
  }
}

export async function GET(req: NextRequest) {
  try {
    const session = await getServerSession(authOptions);
    if (!session?.user?.id) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const { searchParams } = new URL(req.url);
    const evidenceId = searchParams.get("evidenceId");

    if (evidenceId) {
      const anchor = await getLatestAnchorForEvidence(evidenceId);
      return NextResponse.json({
        anchor: anchor
          ? {
              id: anchor.id,
              anchorType: anchor.anchor_type,
              status: anchor.status,
              txHash: anchor.tx_hash,
              blockNumber: anchor.block_number,
              chainId: anchor.chain_id,
              networkName: anchor.network_name,
              digest: anchor.anchored_digest,
              anchoredAt: anchor.anchored_at,
              createdAt: anchor.created_at,
            }
          : null,
        providerMeta: getSafeProviderMeta(),
      });
    }

    return NextResponse.json({
      message: "Provide ?evidenceId=... to query a specific anchor",
      providerMeta: getSafeProviderMeta(),
    });
  } catch (error) {
    console.error("Batch anchor status error:", error);
    return NextResponse.json(
      {
        error:
          error instanceof Error
            ? sanitizeBlockchainErrorMessage(error)
            : "Failed to retrieve batch anchor status",
      },
      { status: 500 }
    );
  }
}
