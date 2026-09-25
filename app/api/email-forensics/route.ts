import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/authOptions";
import { analyzeEmail } from "@/lib/emailForensics";
import { saveAnalysisToHistory } from "@/lib/db/casePipeline";

export async function POST(req: NextRequest) {
  try {
    const session = await getServerSession(authOptions);
    if (!session?.user?.id) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const body = await req.json();
    const { rawEmail, saveToHistory = false } = body;

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

    if (saveToHistory !== true) {
      return NextResponse.json(result);
    }

    // Manual analyses land in the user's history. A case is only created
    // when the user asks for one (POST /api/email-forensics/history/[id]/case).
    const saved = await saveAnalysisToHistory({
      userId: session.user.id,
      result,
    });

    return NextResponse.json({
      ...result,
      historyId: saved.historyId,
      historySaveError: saved.historySaveError,
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
