import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/authOptions";
import {
  deleteEmailInvestigationForUser,
  getEmailInvestigationForUser,
} from "@/lib/db/emailInvestigations";
import { getCaseForUser } from "@/lib/db/cases";

export const dynamic = "force-dynamic";

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

interface RouteContext {
  params: { id: string };
}

/** GET /api/email-forensics/history/[id] — one saved analysis, full report. */
export async function GET(_req: NextRequest, { params }: RouteContext) {
  const session = await getServerSession(authOptions);
  if (!session?.user?.id) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  if (!UUID.test(params.id)) {
    return NextResponse.json({ error: "Analysis not found." }, { status: 404 });
  }

  try {
    const row = await getEmailInvestigationForUser(params.id, session.user.id);
    if (!row || !row.analysis) {
      return NextResponse.json({ error: "Analysis not found." }, { status: 404 });
    }

    const linkedCase = row.case_id
      ? await getCaseForUser(row.case_id, session.user.id)
      : null;

    return NextResponse.json(
      {
        historyId: row.id,
        source: row.source,
        createdAt: row.created_at,
        analysis: row.analysis,
        case: linkedCase
          ? {
              id: linkedCase.id,
              caseNumber: linkedCase.case_number,
              title: linkedCase.title,
              threatType: linkedCase.threat_type,
              severity: linkedCase.severity,
            }
          : null,
      },
      { headers: { "Cache-Control": "no-store" } }
    );
  } catch (error) {
    return NextResponse.json(
      {
        error: "Could not load this analysis.",
        details: error instanceof Error ? error.message : String(error),
      },
      { status: 500 }
    );
  }
}

/** DELETE /api/email-forensics/history/[id] — remove from history. */
export async function DELETE(_req: NextRequest, { params }: RouteContext) {
  const session = await getServerSession(authOptions);
  if (!session?.user?.id) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  if (!UUID.test(params.id)) {
    return NextResponse.json({ error: "Analysis not found." }, { status: 404 });
  }

  try {
    const deleted = await deleteEmailInvestigationForUser(params.id, session.user.id);
    if (!deleted) {
      return NextResponse.json({ error: "Analysis not found." }, { status: 404 });
    }
    return NextResponse.json({ success: true });
  } catch (error) {
    return NextResponse.json(
      {
        error: "Could not delete this analysis.",
        details: error instanceof Error ? error.message : String(error),
      },
      { status: 500 }
    );
  }
}
