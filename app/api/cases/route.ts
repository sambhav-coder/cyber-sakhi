import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/authOptions";
import { listCasesForUser } from "@/lib/db/cases";

export async function GET(req: NextRequest) {
  try {
    const session = await getServerSession(authOptions);
    if (!session?.user?.id) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const cases = await listCasesForUser(session.user.id);

    const safeCases = cases.map((c) => ({
      id: c.id,
      caseNumber: c.case_number,
      title: c.title,
      threatType: c.threat_type,
      status: c.status,
      severity: c.severity,
      createdAt: c.created_at,
      updatedAt: c.updated_at,
    }));

    return NextResponse.json({ cases: safeCases });
  } catch (error) {
    return NextResponse.json(
      {
        error:
          error instanceof Error ? error.message : "Failed to retrieve cases.",
      },
      { status: 500 }
    );
  }
}