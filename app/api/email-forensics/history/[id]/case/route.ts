import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/authOptions";
import { createCaseFromHistory } from "@/lib/db/casePipeline";

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/**
 * POST /api/email-forensics/history/[id]/case
 * Opens a case for a saved analysis, only when the user asks for one.
 */
export async function POST(
  _req: NextRequest,
  { params }: { params: { id: string } }
) {
  const session = await getServerSession(authOptions);
  if (!session?.user?.id) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  if (!UUID.test(params.id)) {
    return NextResponse.json({ error: "Analysis not found." }, { status: 404 });
  }

  try {
    const created = await createCaseFromHistory({
      userId: session.user.id,
      historyId: params.id,
    });
    if (!created) {
      return NextResponse.json({ error: "Analysis not found." }, { status: 404 });
    }
    return NextResponse.json({
      case: {
        id: created.id,
        caseNumber: created.case_number,
        title: created.title,
        threatType: created.threat_type,
        severity: created.severity,
      },
    });
  } catch (error) {
    return NextResponse.json(
      {
        error: "Could not create a case for this analysis.",
        details: error instanceof Error ? error.message : String(error),
      },
      { status: 500 }
    );
  }
}
