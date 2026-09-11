import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/authOptions";
import {
  createEvidence,
  listEvidenceForUser,
  getEvidenceById,
} from "@/lib/db/evidence";
import {
  appendChainOfCustody,
  countCustodyByEvidence,
  listChainOfCustody,
} from "@/lib/db/chainOfCustody";
import {
  getEvidenceIntegrityProvider,
  getBlockchainAnchorStatus,
} from "@/lib/evidenceIntegrityProvider";
import { getCaseForUser, isValidUuid, listCaseNumbersByIds } from "@/lib/db/cases";
import { toEvidenceItem, toMaskedEvidenceItem, parseEvidenceMetadata, isCryptoLocked } from "@/lib/evidenceView";
import {
  MAX_EVIDENCE_BYTES,
  MAX_ENCRYPTED_CONTENT_CHARS,
} from "@/lib/evidenceConstants";
import { EvidenceItem } from "@/lib/types";
import { getLatestAnchorForEvidence } from "@/lib/db/blockchainAnchors";
import { getSafeProviderMeta, anchorEvidenceOnChain, buildEvidenceAnchorPayload } from "@/lib/blockchain/anchor";
import { computeCustodyRoot } from "@/lib/db/chainOfCustody";

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
      caseId: linkedCaseId,
    } = body;

    if (!title || !filename || !fileType || !sha256Hash || !category) {
      return NextResponse.json(
        { error: "Missing required fields" },
        { status: 400 }
      );
    }

    if (typeof fileSize !== "number" || fileSize < 0) {
      return NextResponse.json(
        { error: "Invalid file size." },
        { status: 400 }
      );
    }
    if (fileSize > MAX_EVIDENCE_BYTES) {
      return NextResponse.json(
        {
          error: `File exceeds the ${Math.round(
            MAX_EVIDENCE_BYTES / (1024 * 1024)
          )} MB limit for Evidence Locker.`,
        },
        { status: 400 }
      );
    }
    if (
      encryptedContent &&
      typeof encryptedContent === "string" &&
      encryptedContent.length > MAX_ENCRYPTED_CONTENT_CHARS
    ) {
      return NextResponse.json(
        {
          error: "Encrypted payload is too large for Evidence Locker.",
        },
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
      encrypted: Boolean(encryptedContent),
      evidenceCode: "",
      locked: false,
      lockedAt: null,
      caseId: null,
    };

    let linkedCase: string | undefined;
    if (linkedCaseId && typeof linkedCaseId === "string") {
      if (!isValidUuid(linkedCaseId)) {
        return NextResponse.json(
          { error: "Invalid linked case id." },
          { status: 400 }
        );
      }
      const ownsLinked = await getCaseForUser(linkedCaseId, session.user.id);
      if (!ownsLinked) {
        return NextResponse.json(
          { error: "Case not found or access denied." },
          { status: 403 }
        );
      }
      linkedCase = linkedCaseId;
    }

    const result = await createEvidence({
      userId: session.user.id,
      caseId: linkedCase,
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

    // Auto-anchor on upload (best-effort, never blocks the upload)
    if (getSafeProviderMeta().configured) {
      try {
        const events = await listChainOfCustody(result.id);
        const custodyRoot = computeCustodyRoot(events);
        const { payload, digest } = buildEvidenceAnchorPayload({
          evidenceId: result.id,
          evidenceCode: result.evidence_code || "",
          sha256Hash: result.sha256 || "",
          custodyRootHash: custodyRoot,
        });
        const anchorResult = await anchorEvidenceOnChain({
          scope: "evidence",
          evidenceId: result.id,
          payload,
          digest,
        });
        // Log but never fail the upload
        if (anchorResult.submitted) {
          custodyErrors.push(`Auto-anchor confirmed: ${anchorResult.txHash}`);
        }
      } catch (_) {
        // Non-fatal: auto-anchor failure is not a user error
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
        integrity: {
          provider: getEvidenceIntegrityProvider(),
          blockchainAnchor: getBlockchainAnchorStatus(),
        },
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

      const caseNumber = evidence.case_id
        ? (await listCaseNumbersByIds([evidence.case_id], session.user.id))[
            evidence.case_id
          ] ?? null
        : null;
      const meta = parseEvidenceMetadata(evidence.metadata);
      const locked = isCryptoLocked(evidence);

      // If crypto-locked: return masked view with lock envelope (no ciphertext, no sensitive fields)
      if (locked) {
        return NextResponse.json({
          evidence: {
            id: evidence.id,
            evidenceCode: evidence.evidence_code,
            locked: true,
            lockedAt: meta.lockedAt,
            caseId: evidence.case_id,
            caseNumber,
            createdAt: evidence.created_at,
            // Masked: no title, filename, hash, category, notes, ciphertext
            lockEnvelope: {
              lockMethod: evidence.lock_method,
              lockVersion: evidence.lock_version,
              kdf: evidence.kdf,
              kdfSalt: evidence.kdf_salt,
              kdfIterations: evidence.kdf_iterations,
              kdfParams: evidence.kdf_params,
              wrappedKey: evidence.wrapped_key,
              wrappedKeyIv: evidence.wrapped_key_iv,
              verifierWrapped: evidence.verifier_wrapped,
              verifierIv: evidence.verifier_iv,
            },
          },
          integrityProvider: getEvidenceIntegrityProvider(),
          blockchainAnchor: getBlockchainAnchorStatus(),
        });
      }

      // Unlocked view: full details
      return NextResponse.json({
        evidence: {
          id: evidence.id,
          title: evidence.title,
          filename: evidence.filename,
          fileType: evidence.mime_type || "application/octet-stream",
          fileSize: evidence.file_size ?? 0,
          sha256Hash: evidence.sha256 || "",
          category: (evidence.category as EvidenceItem["category"]) || "OTHER",
          notes: evidence.description ?? null,
          integrityVerified: meta.integrityVerified,
          encrypted: meta.encrypted,
          locked: meta.locked,
          lockedAt: meta.lockedAt,
          evidenceCode: evidence.evidence_code,
          caseId: evidence.case_id,
          caseNumber,
          encryptedContent: evidence.encrypted_content,
          encryptionIv: evidence.encryption_iv,
          encryptedSize: evidence.encrypted_size,
          createdAt: evidence.created_at,
          hasLockMaterial: Boolean(evidence.wrapped_key || evidence.lock_version),
          lockMethod: evidence.lock_method,
        },
        integrityProvider: getEvidenceIntegrityProvider(),
        blockchainAnchor: getBlockchainAnchorStatus(),
      });
    }

    const evidence = await listEvidenceForUser(session.user.id);
    const caseIds = evidence
      .map((e) => e.case_id)
      .filter((id): id is string => Boolean(id));
    const caseNumbers = await listCaseNumbersByIds(caseIds, session.user.id);
    const custodyCounts = await countCustodyByEvidence(
      evidence.map((e) => e.id)
    );

    const sanitized: EvidenceItem[] = evidence.map((ev) => {
      const cn = ev.case_id ? (caseNumbers[ev.case_id] ?? null) : null;
      const cc = custodyCounts[ev.id] ?? 0;
      const anchor = ev.blockchain_anchor_id ? undefined : undefined; // loaded lazily if needed
      if (isCryptoLocked(ev)) {
        return toMaskedEvidenceItem(ev, { caseNumber: cn, custodyCount: cc });
      }
      return toEvidenceItem(ev, { caseNumber: cn, custodyCount: cc });
    });

    return NextResponse.json({
      evidence: sanitized,
      system: {
        integrityProvider: getEvidenceIntegrityProvider(),
        blockchainAnchor: getBlockchainAnchorStatus(),
      },
    });
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