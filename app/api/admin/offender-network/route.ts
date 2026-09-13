import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/authOptions";
import { getOffenderStore } from "@/lib/offenderNetwork/store";
import { K_ANONYMITY, type ReportCategory } from "@/lib/offenderNetwork/constants";

/* GET /api/admin/offender-network
 *
 * The cross-victim view: identifiers that several unrelated people have
 * reported independently. This is the part a cyber cell can act on,
 * because a pattern across victims is what turns a dismissible one-off
 * complaint into a case.
 *
 * It still cannot expose anyone. The identifiers are stored as keyed
 * fingerprints, so the server itself cannot recover the phone number or
 * UPI ID; only a short prefix is returned, purely as a reference handle.
 * Reporters are fingerprints too, so "6 victims" is a count and nothing
 * more. */

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export interface AdminOffender {
  /** Short prefix of the keyed fingerprint — a reference, not the value. */
  fingerprint: string;
  type: string;
  distinctReporters: number;
  firstSeenDay: string;
  lastSeenDay: string;
  regions: string[];
  categories: ReportCategory[];
}

export async function GET(req: NextRequest) {
  const session = await getServerSession(authOptions);

  if (!session || !session.user) {
    return NextResponse.json(
      { error: "Unauthorized: Authentication required." },
      { status: 401 }
    );
  }
  if (session.user.role !== "ADMIN") {
    return NextResponse.json(
      { error: "Forbidden: Administrator role required." },
      { status: 403 }
    );
  }

  const url = new URL(req.url);
  const minParam = Number(url.searchParams.get("min"));
  const minReporters =
    Number.isFinite(minParam) && minParam >= 2 ? Math.floor(minParam) : K_ANONYMITY;

  try {
    const store = getOffenderStore();
    const ranked = await store.topIndicators(minReporters, 50);

    const offenders: AdminOffender[] = ranked.map((r) => ({
      fingerprint: r.indicatorHash.slice(0, 12),
      type: r.indicatorType,
      distinctReporters: r.distinctReporters,
      firstSeenDay: r.firstSeen.slice(0, 10),
      lastSeenDay: r.lastSeen.slice(0, 10),
      regions: r.regions,
      categories: r.categories,
    }));

    return NextResponse.json(
      {
        backend: store.backend,
        minReporters,
        generatedAt: new Date().toISOString(),
        offenders,
        totalVictimReports: offenders.reduce((s, o) => s + o.distinctReporters, 0),
        privacy: {
          note: "Identifiers are stored as HMAC-SHA256 fingerprints keyed with a server secret. The raw phone number, UPI ID or handle is not recoverable, and reporter identities are never stored.",
        },
      },
      { headers: { "Cache-Control": "no-store" } }
    );
  } catch (error) {
    return NextResponse.json(
      {
        error: "Sakhi Network is unavailable.",
        details: error instanceof Error ? error.message : String(error),
      },
      { status: 503 }
    );
  }
}
