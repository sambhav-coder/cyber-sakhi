import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/authOptions";
import {
  createEvidence,
  listEvidenceForUser,
  getEvidenceById,
} from "@/lib/db/evidence";
import { appendChainOfCustody } from "@/lib/db/chainOfCustody";
import { EvidenceItem } from "@/lib/types";
import type { EvidenceRow } from "@/lib/db/types";

const VALID_ACTIONS_UPLOAD = ["UPLOADED", "ENCRYPTED"];

function rowToEvidenceItem(ev: EvidenceRow): EvidenceItem {
  return {
    id: ev.id,
    title: ev.title,
    filename: ev.filename,
    fileType: ev.file_type,
    fileSize: ev.file_size,
    timestamp: ev.created_at,
    sha256Hash: ev.sha256_hash,
    category: ev.category as EvidenceItem["category"],
    notes: ev.notes ?? undefined,
    integrityVerified: ev.integrity_verified,
    simulatedIpfsCid: ev.simulated_ipfs_cid || "mock_ipfs_cid",
    simulatedTxHash: ev.simulated_tx_hash || "mock_tx_hash",
  };
}

export async function POST(req: NextRequest) {
  try {
    const session = await getServerSession(authOptions);
    if (!session?.user?.id) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const body = await req.json();
    const {
      title,
      filename,
      fileType,
      fileSize,
      sha256Hash,
      category,
      notes,
      encryptedContent,
      encryptionIv,
      encryptedSize,
    } = body;

    if (!title || !filename || !fileType || !sha256Hash || !category) {
      return NextResponse.json(
        { error: "Missing required fields" },
        { status: 400 }
      );
    }

    const evidenceItem: EvidenceItem = {
      id: "ev_" + Date.now() + "_" + Math.random().toString(36).substring(2, 8),
      title,
      filename,
      fileType,
      fileSize: fileSize || 0,
      timestamp: new Date().toISOString(),
      sha256Hash,
      category,
      notes: notes || null,
      integrityVerified: true,
      simulatedIpfsCid: "mock_ipfs_cid_" + sha256Hash.substring(0, 16),
      simulatedTxHash: "mock_tx_hash_" + sha256Hash.substring(0, 16),
    };

    const result = await createEvidence({
      userId: session.user.id,
      item: evidenceItem,
      encryptedContent,
      encryptionIv,
      encryptedSize,
    });

    let custodyErrors: string[] = [];
    try {
      await appendChainOfCustody({
        evidenceId: result.id,
        action: "UPLOADED",
        actorId: session.user.id,
        notes: "Evidence uploaded to secure vault",
      });
    } catch (custodyError: any) {
      custodyErrors.push(
        "Failed to record UPLOADED custody event: " +
          (custodyError?.message || "unknown error")
      );
    }

    if (encryptedContent) {
      try {
        await appendChainOfCustody({
          evidenceId: result.id,
          action: "ENCRYPTED",
          actorId: session.user.id,
          notes: "Evidence content encrypted using AES-256-GCM",
        });
      } catch (custodyError: any) {
        custodyErrors.push(
          "Failed to record ENCRYPTED custody event: " +
            (custodyError?.message || "unknown error")
        );
      }
    }

    return NextResponse.json(
      {
        message:
          custodyErrors.length > 0
            ? "Evidence saved, but some custody events failed: " +
              custodyErrors.join("; ")
            : "Evidence saved successfully",
        evidence: result,
        custodyErrors: custodyErrors.length > 0 ? custodyErrors : undefined,
      },
      { status: custodyErrors.length > 0 ? 207 : 201 }
    );
  } catch (error) {
    console.error("Evidence upload error:", error);
    return NextResponse.json(
      {
        error: error instanceof Error ? error.message : "Failed to save evidence",
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
    const evidenceId = searchParams.get("id");

    if (evidenceId) {
      const evidence = await getEvidenceById(evidenceId, session.user.id);
      if (!evidence) {
        return NextResponse.json(
          { error: "Evidence not found or access denied" },
          { status: 404 }
        );
      }

      try {
        await appendChainOfCustody({
          evidenceId: evidence.id,
          action: "RETRIEVED",
          actorId: session.user.id,
          notes: "Encrypted evidence retrieved from secure vault",
        });
      } catch (_) {
        // Non-fatal: custody event failure doesn't block retrieval
      }

      return NextResponse.json({
        evidence: {
          id: evidence.id,
          title: evidence.title,
          filename: evidence.filename,
          fileType: evidence.file_type,
          fileSize: evidence.file_size,
          sha256Hash: evidence.sha256_hash,
          category: evidence.category,
          notes: evidence.notes,
          integrityVerified: evidence.integrity_verified,
          simulatedIpfsCid: evidence.simulated_ipfs_cid,
          simulatedTxHash: evidence.simulated_tx_hash,
          encryptedContent: evidence.encrypted_content,
          encryptionIv: evidence.encryption_iv,
          encryptedSize: evidence.encrypted_size,
          createdAt: evidence.created_at,
        },
      });
    }

    const evidence = await listEvidenceForUser(session.user.id);
    const sanitized: EvidenceItem[] = evidence.map(rowToEvidenceItem);

    return NextResponse.json({ evidence: sanitized });
  } catch (error) {
    console.error("Evidence retrieval error:", error);
    return NextResponse.json(
      {
        error:
          error instanceof Error ? error.message : "Failed to retrieve evidence",
      },
      { status: 500 }
    );
  }
}
