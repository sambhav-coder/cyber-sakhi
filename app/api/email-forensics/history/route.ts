import { NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/authOptions";
import { listEmailHistoryForUser } from "@/lib/db/emailInvestigations";

export const dynamic = "force-dynamic";

/** GET /api/email-forensics/history — the user's manually analyzed emails. */
export async function GET() {
  const session = await getServerSession(authOptions);
  if (!session?.user?.id) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  try {
    const rows = await listEmailHistoryForUser(session.user.id);
    return NextResponse.json(
      {
        items: rows.map((r) => ({
          id: r.id,
          subject: r.subject,
          sender: r.sender,
          verdict: r.verdict,
          riskScore: r.risk_score,
          source: r.source,
          caseId: r.case_id,
          createdAt: r.created_at,
        })),
      },
      { headers: { "Cache-Control": "no-store" } }
    );
  } catch (error) {
    return NextResponse.json(
      {
        error: "Could not load your analysis history.",
        details: error instanceof Error ? error.message : String(error),
      },
      { status: 500 }
    );
  }
}
