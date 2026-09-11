import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/authOptions";
import {
  appendChainOfCustody,
  listChainOfCustody,
  verifyChainOfCustody,
} from "@/lib/db/chainOfCustody";
import { verifyEvidenceOwnership } from "@/lib/db/evidence";
import {
  getEvidenceIntegrityProvider,
  getBlockchainAnchorStatus,
} from "@/lib/evidenceIntegrityProvider";

const VALID_ACTIONS = [
  "RETRIEVED",
  "DECRYPTED",
  "INTEGRITY_VERIFIED",
  "INTEGRITY_FAILED",
  "VIEWED",
  "DOWNLOADED",
  "EXPORTED",
];

export async function POST(req: NextRequest) {
  try {
    const session = await getServerSession(authOptions);
    if (!session?.user?.id) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const body = await req.json();
    const { evidenceId, action, notes } = body;

    if (!evidenceId || !action) {
      return NextResponse.json(
        { error: "Missing required fields" },
        { status: 400 }
      );
    }

    if (!VALID_ACTIONS.includes(action)) {
      return NextResponse.json(
        { error: "Invalid action" },
        { status: 400 }
      );
    }

    const owns = await verifyEvidenceOwnership(evidenceId, session.user.id);
    if (!owns) {
      return NextResponse.json(
        { error: "Evidence not found or access denied" },
        { status: 403 }
      );
    }

    const result = await appendChainOfCustody({
      evidenceId,
      action,
      actorId: session.user.id,
      notes: notes || null,
    });

    return NextResponse.json(
      {
        message: "Chain of custody event recorded",
        event: result,
      },
      { status: 201 }
    );
  } catch (error) {
    console.error("Chain of custody error:", error);
    return NextResponse.json(
      {
        error:
          error instanceof Error
            ? error.message
            : "Failed to record chain of custody",
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
    const verify = searchParams.get("verify") === "true";

    if (!evidenceId) {
      return NextResponse.json(
        { error: "Missing evidenceId parameter" },
        { status: 400 }
      );
    }

    const owns = await verifyEvidenceOwnership(evidenceId, session.user.id);
    if (!owns) {
      return NextResponse.json(
        { error: "Evidence not found or access denied" },
        { status: 403 }
      );
    }

    if (verify) {
      const verification = await verifyChainOfCustody(evidenceId);
      const events = await listChainOfCustody(evidenceId);
      return NextResponse.json({
        events,
        verification,
        integrityProvider: getEvidenceIntegrityProvider(),
        blockchainAnchor: getBlockchainAnchorStatus(),
      });
    }

    const events = await listChainOfCustody(evidenceId);
    return NextResponse.json({
      events,
      integrityProvider: getEvidenceIntegrityProvider(),
      blockchainAnchor: getBlockchainAnchorStatus(),
    });
  } catch (error) {
    console.error("Chain of custody list error:", error);
    return NextResponse.json(
      {
        error:
          error instanceof Error
            ? error.message
            : "Failed to retrieve chain of custody",
      },
      { status: 500 }
    );
  }
}
