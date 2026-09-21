import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/authOptions";
import { searchCasesForUser } from "@/lib/db/search";
import { logAuditEvent } from "@/lib/audit";

export async function GET(req: NextRequest) {
  try {
    const session = await getServerSession(authOptions);
    if (!session?.user?.id) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const term = (req.nextUrl.searchParams.get("q") ?? "").trim().slice(0, 200);
    if (!term) {
      return NextResponse.json({ cases: [], query: "" });
    }

    const cases = await searchCasesForUser(session.user.id, term);

    // Every search is recorded (fire-and-forget). The payload carries only
    // the query string and hit count — no email bodies or PII.
    void logAuditEvent({
      actorId: session.user.id,
      action: "case.searched",
      entity: "search",
      remoteIp: req.headers.get("x-forwarded-for") ?? undefined,
      userAgent: req.headers.get("user-agent") ?? undefined,
      payload: { query: term, hitCount: cases.length, withinWindow: 200 },
    });

    return NextResponse.json({ cases, query: term });
  } catch (error) {
    return NextResponse.json(
      {
        error:
          error instanceof Error ? error.message : "Failed to search cases.",
      },
      { status: 500 }
    );
  }
}