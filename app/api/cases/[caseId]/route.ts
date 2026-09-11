import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/authOptions";
import {
  deleteCase,
  getCaseForUser,
  getCaseIndicators,
  getCaseInvestigationsForUser,
  isValidUuid,
} from "@/lib/db/cases";
import { listReportsForUser } from "@/lib/db/reports";
import { getEvidenceForCase } from "@/lib/db/evidence";

export async function GET(
  req: NextRequest,
  context: { params: { caseId: string } }
) {
  try {
    const session = await getServerSession(authOptions);
    if (!session?.user?.id) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const caseId = context.params.caseId;

    if (!isValidUuid(caseId)) {
      return NextResponse.json(
        { error: "Case not found or access denied." },
        { status: 404 }
      );
    }

    const caseRow = await getCaseForUser(caseId, session.user.id);

    if (!caseRow) {
      return NextResponse.json(
        { error: "Case not found or access denied." },
        { status: 404 }
      );
    }

    const investigations = await getCaseInvestigationsForUser(
      caseId,
      session.user.id
    );
    const indicators = await getCaseIndicators(
      caseId,
      session.user.id,
      investigations.map((inv) => inv.id)
    );

    const [evidence, reports] = await Promise.all([
      getEvidenceForCase(caseId, session.user.id),
      listReportsForUser(session.user.id, caseId),
    ]);

    return NextResponse.json({
      case: {
        id: caseRow.id,
        caseNumber: caseRow.case_number,
        title: caseRow.title,
        description: caseRow.description,
        threatType: caseRow.threat_type,
        status: caseRow.status,
        severity: caseRow.severity,
        createdAt: caseRow.created_at,
        updatedAt: caseRow.updated_at,
      },
      investigations,
      indicators,
      evidence,
      reports: reports.map((r) => ({
        id: r.id,
        title: r.title,
        reportType: r.report_type,
        createdAt: r.created_at,
      })),
    });
  } catch (error) {
    return NextResponse.json(
      {
        error:
          error instanceof Error ? error.message : "Failed to retrieve case.",
      },
      { status: 500 }
    );
  }
}

export async function DELETE(
  req: NextRequest,
  context: { params: { caseId: string } }
) {
  try {
    const session = await getServerSession(authOptions);
    if (!session?.user?.id) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const caseId = context.params.caseId;

    if (!isValidUuid(caseId)) {
      return NextResponse.json(
        { error: "Case not found or access denied." },
        { status: 404 }
      );
    }

    const deleted = await deleteCase(caseId, session.user.id);

    if (!deleted) {
      return NextResponse.json(
        { error: "Case not found or access denied." },
        { status: 404 }
      );
    }

    return NextResponse.json({
      message: "Case deleted.",
      caseId,
    });
  } catch (error) {
    return NextResponse.json(
      {
        error: error instanceof Error ? error.message : "Failed to delete case.",
      },
      { status: 500 }
    );
  }
}