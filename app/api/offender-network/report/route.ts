import { NextRequest, NextResponse } from "next/server";
import { getOffenderStore } from "@/lib/offenderNetwork/store";
import { getRequesterHash, parseIndicators } from "@/lib/offenderNetwork/server";
import {
  REGIONS,
  REPORT_CATEGORIES,
  REPORTS_PER_HOUR_LIMIT,
  type ReportCategory,
  type ReportResponse,
} from "@/lib/offenderNetwork/constants";

/* POST /api/offender-network/report
 *
 * Adds the signed-in account's report of each identifier. Stored as a
 * pair of keyed fingerprints — never the identifier, the message, or the
 * account. The same account reporting the same identifier twice counts
 * once. */

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST(req: NextRequest) {
  const reporterHash = await getRequesterHash();
  if (!reporterHash) {
    return NextResponse.json(
      { error: "Sign in to add a report. Looking up is open to everyone." },
      { status: 401 }
    );
  }

  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Request body must be JSON." }, { status: 400 });
  }

  const parsed = parseIndicators(body);
  if ("error" in parsed) {
    return NextResponse.json({ error: parsed.error }, { status: 400 });
  }
  const valid = parsed.items.filter((i): i is NonNullable<typeof i> => i !== null);
  if (valid.length === 0) {
    return NextResponse.json({ error: "None of the identifiers were valid." }, { status: 400 });
  }

  const rawCategory = (body as { category?: unknown }).category;
  const category: ReportCategory = REPORT_CATEGORIES.includes(rawCategory as ReportCategory)
    ? (rawCategory as ReportCategory)
    : "OTHER";

  const rawRegion = (body as { region?: unknown }).region;
  const region =
    typeof rawRegion === "string" && (REGIONS as readonly string[]).includes(rawRegion)
      ? rawRegion
      : null;

  try {
    const store = getOffenderStore();

    const hourAgo = new Date(Date.now() - 60 * 60 * 1000).toISOString();
    const recent = await store.countReportsSince(reporterHash, hourAgo);
    if (recent + valid.length > REPORTS_PER_HOUR_LIMIT) {
      return NextResponse.json(
        { error: "Report limit reached for this hour. Please try again later." },
        { status: 429 }
      );
    }

    const createdAt = new Date().toISOString();
    const { inserted, duplicates } = await store.addReports(
      valid.map((v) => ({
        indicatorHash: v.hash,
        indicatorType: v.type,
        reporterHash,
        category,
        region,
        createdAt,
      }))
    );

    const response: ReportResponse = { backend: store.backend, inserted, duplicates };
    return NextResponse.json(response, { headers: { "Cache-Control": "no-store" } });
  } catch (error) {
    return NextResponse.json(
      {
        error: "Sakhi Network could not record the report.",
        details: error instanceof Error ? error.message : String(error),
      },
      { status: 503 }
    );
  }
}
