import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/authOptions";
import {
  getEvidenceById,
  updateEvidence,
  deleteEvidenceCustody,
  deleteEvidence,
} from "@/lib/db/evidence";
import { appendChainOfCustody } from "@/lib/db/chainOfCustody";
import { getCaseForUser, isValidUuid } from "@/lib/db/cases";
import { parseEvidenceMetadata } from "@/lib/evidenceView";
import type { EvidenceRow } from "@/lib/db/types";

async function loadOwned(
  evidenceId: string,
  userId: string
): Promise<{ evidence: EvidenceRow } | NextResponse> {
  const evidence = await getEvidenceById(evidenceId, userId);
  if (!evidence) {
    return NextResponse.json(
      { error: "Evidence not found or access denied" },
      { status: 404 }
    );
  }
  return { evidence };
}

function metadataWith(
  meta: Record<string, unknown>,
  patch: Record<string, unknown>
) {
  return { ...(meta || {}), ...patch };
}

export async function PATCH(req: NextRequest, ctx: { params: { id: string } }) {
  try {
    const session = await getServerSession(authOptions);
    if (!session?.user?.id) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const evidenceId = ctx.params.id;
    if (!isValidUuid(evidenceId)) {
      return NextResponse.json({ error: "Invalid evidence id." }, { status: 400 });
    }

    const loaded = await loadOwned(evidenceId, session.user.id);
    if (loaded instanceof NextResponse) return loaded;
    const evidence = loaded.evidence;

    const body = await req.json();
    const hasCaseChange = "caseId" in body;
    const hasLockChange = "locked" in body;
    if (!hasCaseChange && !hasLockChange) {
      return NextResponse.json(
        { error: "Nothing to update." },
        { status: 400 }
      );
    }

    const meta = parseEvidenceMetadata(evidence.metadata);
    const locked = meta.locked;
    const hasMaterial = Boolean(evidence.wrapped_key || evidence.lock_version);

    if (locked && hasCaseChange && body.caseId !== evidence.case_id) {
      return NextResponse.json(
        {
          error:
            "This evidence is locked. Unlock it before changing its case association.",
        },
        { status: 409 }
      );
    }

    // Soft-unlock (PATCH locked=false) is REJECTED when crypto lock material exists.
    // Real unlock must go through POST /api/evidence/[id]/unlock.
    if (hasLockChange && body.locked === false && hasMaterial) {
      return NextResponse.json(
        {
          error:
            "This evidence is cryptographically protected. Use the protected unlock flow.",
        },
        { status: 409 }
      );
    }

    const baseMetadata = (evidence.metadata || {}) as Record<string, unknown>;
    let nextMetadata: Record<string, unknown> | undefined;
    let newCaseId: string | null | undefined = undefined;

    if (hasLockChange) {
      const wantsLock = body.locked === true;
      if (wantsLock !== locked) {
        nextMetadata = metadataWith(baseMetadata, {
          locked: wantsLock,
          lockedAt: wantsLock ? new Date().toISOString() : null,
        });
      }
    }

    if (hasCaseChange) {
      const raw = body.caseId as unknown;
      if (raw === null) {
        if (evidence.case_id !== null) newCaseId = null;
      } else if (typeof raw === "string") {
        if (!isValidUuid(raw)) {
          return NextResponse.json(
            { error: "Invalid case id." },
            { status: 400 }
          );
        }
        const ownsCase = await getCaseForUser(raw, session.user.id);
        if (!ownsCase) {
          return NextResponse.json(
            { error: "Case not found or access denied." },
            { status: 403 }
          );
        }
        newCaseId = raw;
      } else {
        return NextResponse.json(
          { error: "Invalid case id." },
          { status: 400 }
        );
      }
    }

    const updated = await updateEvidence(evidenceId, session.user.id, {
      ...(newCaseId !== undefined ? { caseId: newCaseId } : {}),
      ...(nextMetadata !== undefined ? { metadata: nextMetadata } : {}),
    });

    if (!updated) {
      return NextResponse.json(
        { error: "Evidence not found or access denied" },
        { status: 404 }
      );
    }

    const custodyErrors: string[] = [];
    if (hasLockChange && meta.locked !== (body.locked === true)) {
      const action = body.locked === true ? "LOCKED" : "UNLOCKED";
      const note =
        action === "LOCKED"
          ? "Evidence locked against modification and deletion"
          : "Evidence unlocked";
      try {
        await appendChainOfCustody({
          evidenceId,
          action,
          actorId: session.user.id,
          notes: note,
        });
      } catch (custodyError: any) {
        custodyErrors.push(
          `Failed to record ${action} custody event: ` +
            (custodyError?.message || "unknown error")
        );
      }
    }

    if (hasCaseChange && newCaseId !== undefined && newCaseId !== evidence.case_id) {
      const action = newCaseId ? "CASE_LINKED" : "CASE_UNLINKED";
      try {
        await appendChainOfCustody({
          evidenceId,
          action,
          actorId: session.user.id,
          notes: newCaseId ? "Evidence linked to a case" : "Evidence unlinked from case",
        });
      } catch (custodyError: any) {
        custodyErrors.push(
          `Failed to record ${action} custody event: ` +
            (custodyError?.message || "unknown error")
        );
      }
    }

    const updatedMeta = parseEvidenceMetadata(updated.metadata);
    const caseNumber = updated.case_id
      ? ((await getCaseForUser(updated.case_id, session.user.id))?.case_number ??
        null)
      : null;

    return NextResponse.json({
      message:
        custodyErrors.length > 0
          ? "Evidence updated, but some custody events failed: " +
            custodyErrors.join("; ")
          : "Evidence updated",
      custodyErrors: custodyErrors.length > 0 ? custodyErrors : undefined,
      evidence: {
        id: updated.id,
        title: updated.title,
        filename: updated.filename,
        fileType: updated.mime_type || "application/octet-stream",
        fileSize: updated.file_size ?? 0,
        sha256Hash: updated.sha256 || "",
        category: (updated.category as EvidenceItemCategory) || "OTHER",
        notes: updated.description ?? null,
        integrityVerified: updatedMeta.integrityVerified,
        encrypted: updatedMeta.encrypted,
        locked: updatedMeta.locked,
        lockedAt: updatedMeta.lockedAt,
        evidenceCode: updated.evidence_code,
        caseId: updated.case_id,
        caseNumber,
      },
    });
  } catch (error) {
    console.error("Evidence update error:", error);
    return NextResponse.json(
      {
        error:
          error instanceof Error ? error.message : "Failed to update evidence",
      },
      { status: 500 }
    );
  }
}

type EvidenceItemCategory =
  | "HARASSMENT"
  | "BLACKMAIL"
  | "SCAM"
  | "STALKING"
  | "THREAT"
  | "OTHER";

export async function DELETE(
  req: NextRequest,
  ctx: { params: { id: string } }
) {
  try {
    const session = await getServerSession(authOptions);
    if (!session?.user?.id) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const evidenceId = ctx.params.id;
    if (!isValidUuid(evidenceId)) {
      return NextResponse.json({ error: "Invalid evidence id." }, { status: 400 });
    }

    const loaded = await loadOwned(evidenceId, session.user.id);
    if (loaded instanceof NextResponse) return loaded;
    const evidence = loaded.evidence;

    const meta = parseEvidenceMetadata(evidence.metadata);
    if (meta.locked) {
      return NextResponse.json(
        {
          error:
            "This evidence is locked. Unlock it before deleting — locked evidence cannot be removed.",
        },
        { status: 409 }
      );
    }

    // The custody chain is intentionally removed together with the evidence so
    // no orphaned audit rows survive. A "DELETED" event cannot persist in the
    // chain that is deleted with it, so the response states this plainly.
    await deleteEvidenceCustody(evidenceId);
    await deleteEvidence(evidenceId, session.user.id);

    return NextResponse.json({
      message:
        "Evidence deleted. Its chain of custody was removed with it to avoid orphaned records.",
      evidenceId,
    });
  } catch (error) {
    console.error("Evidence delete error:", error);
    return NextResponse.json(
      {
        error:
          error instanceof Error ? error.message : "Failed to delete evidence",
      },
      { status: 500 }
    );
  }
}