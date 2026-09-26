import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/authOptions";
import { canUseDemoMode, isDemoSession } from "@/lib/demoMode";
import { getDemoEmailById } from "@/lib/demoEmails";
import { analyzeEmail } from "@/lib/emailForensics";
import { persistCaseFromAnalysis } from "@/lib/db/casePipeline";

interface RouteContext {
  params: {
    id: string;
  };
}

/**
 * GET /api/demo/analyze/[id]
 * 
 * Analyzes a demo email using the existing forensic pipeline.
 * This endpoint only works for the authorized SIH Demo account.
 */
export async function GET(
  req: NextRequest,
  { params }: RouteContext
) {
  const session = await getServerSession(authOptions);

  if (!session?.user?.id || !session?.user?.email) {
    return NextResponse.json(
      { error: "Please login first." },
      { status: 401 }
    );
  }

  if (!params.id) {
    return NextResponse.json(
      { error: "Demo email ID is required." },
      { status: 400 }
    );
  }

  // Verify this is the SIH Demo account
  if (!canUseDemoMode(session)) {
    return NextResponse.json(
      { error: "Demo analysis is only available for the SIH Demo account." },
      { status: 403 }
    );
  }

  try {
    // Get the demo email
    const demoEmail = getDemoEmailById(params.id);

    if (!demoEmail) {
      return NextResponse.json(
        { error: "Demo email not found." },
        { status: 404 }
      );
    }

    // Run the existing forensic analysis on the demo email
    const analysis = await analyzeEmail(demoEmail.raw);

    // Create a case for the demo analysis (same as live Gmail flow)
    const persisted = await persistCaseFromAnalysis({
      userId: session.user.id,
      result: analysis,
      source: "demo_mailbox",
      externalMessageId: demoEmail.id,
    });

    const result = NextResponse.json({
      success: true,
      message: {
        id: demoEmail.id,
        threadId: demoEmail.threadId || null,
        labelIds: demoEmail.labelIds || [],
        sizeEstimate: demoEmail.sizeEstimate || 0,
        internalDate: demoEmail.internalDate || null,
        isDemo: true,
        forensicType: demoEmail.forensicType,
        description: demoEmail.description,
      },
      analysis,
      ...(persisted.createdCase
        ? {
            case: {
              id: persisted.createdCase.id,
              caseNumber: persisted.createdCase.case_number,
              title: persisted.createdCase.title,
              threatType: persisted.createdCase.threat_type,
              status: persisted.createdCase.status,
              severity: persisted.createdCase.severity,
              createdAt: persisted.createdCase.created_at,
              indicatorSaveState: persisted.indicatorSaveState,
            },
            caseSaveNote:
              persisted.indicatorSaveState === "failed"
                ? "Case created but some indicators could not be persisted."
                : undefined,
          }
        : {
            case: null,
            caseSaveError: persisted.caseSaveError,
          }),
      demoMode: {
        enabled: true,
        source: "demo_mailbox",
      },
    });

    return result;
  } catch (error) {
    return NextResponse.json(
      {
        error: "Demo email forensic analysis failed.",
        details:
          error instanceof Error
            ? error.message
            : String(error),
      },
      { status: 500 }
    );
  }
}