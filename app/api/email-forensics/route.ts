import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/authOptions";
import { analyzeEmail } from "@/lib/emailForensics";
import { persistCaseFromAnalysis } from "@/lib/db/casePipeline";

export async function POST(req: NextRequest) {
  try {
    const session = await getServerSession(authOptions);
    if (!session?.user?.id) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const body = await req.json();
    const { rawEmail, saveAsCase = false } = body;

    if (!rawEmail || typeof rawEmail !== "string") {
      return NextResponse.json(
        { error: "rawEmail field is required and must be a string." },
        { status: 400 }
      );
    }

    const trimmed = rawEmail.trim();
    if (trimmed.length < 30) {
      return NextResponse.json(
        {
          error:
            "Input is too short. Please paste a complete email header or raw email source.",
        },
        { status: 400 }
      );
    }

    const result = await analyzeEmail(trimmed);

    if (saveAsCase !== true) {
      return NextResponse.json(result);
    }

    const persisted = await persistCaseFromAnalysis({
      userId: session.user.id,
      result,
    });

    if (!persisted.createdCase) {
      return NextResponse.json({
        ...result,
        case: null,
        caseSaveError: persisted.caseSaveError,
      });
    }

    return NextResponse.json({
      ...result,
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
    });
  } catch (error) {
    return NextResponse.json(
      {
        error: "Email forensics analysis failed.",
        details: error instanceof Error ? error.message : String(error),
      },
      { status: 500 }
    );
  }
}