import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/authOptions";
import {
  getCaseForUser,
  getCaseIndicators,
  getCaseInvestigationsForUser,
  isValidUuid,
} from "@/lib/db/cases";
import { createReport, listReportsForUser } from "@/lib/db/reports";
import { getEvidenceForCase } from "@/lib/db/evidence";
import { buildForensicReport } from "@/lib/forensicReport";

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

    const { searchParams } = new URL(req.url);
    const format = searchParams.get("format");

    const investigations = await getCaseInvestigationsForUser(
      caseId,
      session.user.id
    );
    const indicators = await getCaseIndicators(
      caseId,
      session.user.id,
      investigations.map((inv) => inv.id)
    );
    const previousReports = await listReportsForUser(session.user.id, caseId);
    const linkedEvidence = await getEvidenceForCase(caseId, session.user.id);

    const envelope = buildForensicReport({
      caseRow,
      investigations,
      indicators,
      previousReports,
      evidence: linkedEvidence,
    });

    await createReport({
      userId: session.user.id,
      caseId,
      title: envelope.title,
      reportType: "forensic",
      reportData: {
        caseNumber: envelope.caseNumber,
        generatedAt: envelope.generatedAt,
        content: envelope.content,
      },
    });

    if (format === "text") {
      return new NextResponse(envelope.content, {
        headers: {
          "Content-Type": "text/plain; charset=utf-8",
          "Content-Disposition": `attachment; filename="cyber-sakhi-report-${envelope.caseNumber}.txt"`,
        },
      });
    }

    return NextResponse.json({ envelope });
  } catch (error) {
    return NextResponse.json(
      {
        error:
          error instanceof Error ? error.message : "Failed to generate report.",
      },
      { status: 500 }
    );
  }
}