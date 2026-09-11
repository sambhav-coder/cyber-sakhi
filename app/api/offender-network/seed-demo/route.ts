import { NextResponse } from "next/server";
import { isDevLoginEnabled } from "@/lib/devAuth";
import { getOffenderStore, type IndicatorReport } from "@/lib/offenderNetwork/store";
import { hashIndicator, hashReporter } from "@/lib/offenderNetwork/hash";
import type { IndicatorType, ReportCategory } from "@/lib/offenderNetwork/constants";

/* POST /api/offender-network/seed-demo — LOCAL DEVELOPMENT ONLY.
 *
 * Simulates earlier reports from other survivors so a walkthrough has a
 * repeat offender to find. Goes through the same keyed fingerprinting as
 * real reports, and uses fixed synthetic reporter ids so running it twice
 * adds nothing. Gated exactly like /dev-login. */

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

interface DemoIndicator {
  type: IndicatorType;
  value: string;
  reports: { region: string; category: ReportCategory; daysAgo: number }[];
}

const DEMO: DemoIndicator[] = [
  {
    type: "phone",
    value: "9876543210",
    reports: [
      { region: "Delhi", category: "BLACKMAIL", daysAgo: 41 },
      { region: "Mumbai", category: "BLACKMAIL", daysAgo: 33 },
      { region: "Pune", category: "THREAT", daysAgo: 25 },
      { region: "Delhi", category: "BLACKMAIL", daysAgo: 12 },
      { region: "Bengaluru", category: "HARASSMENT", daysAgo: 6 },
      { region: "Jaipur", category: "BLACKMAIL", daysAgo: 2 },
    ],
  },
  {
    type: "upi",
    value: "rahul.pay@ybl",
    reports: [
      { region: "Delhi", category: "SCAM", daysAgo: 20 },
      { region: "Lucknow", category: "BLACKMAIL", daysAgo: 14 },
      { region: "Mumbai", category: "BLACKMAIL", daysAgo: 8 },
      { region: "Delhi", category: "BLACKMAIL", daysAgo: 3 },
    ],
  },
  {
    // Two reports: below the k-anonymity threshold, so the demo also shows
    // what "detail withheld" looks like.
    type: "handle",
    value: "rahul_07_official",
    reports: [
      { region: "Hyderabad", category: "STALKING", daysAgo: 9 },
      { region: "Chennai", category: "HARASSMENT", daysAgo: 4 },
    ],
  },
];

// Not exported: Next.js route modules may only export handlers and config.
const DEMO_MESSAGE =
  "Send 25000 to rahul.pay@ybl in 2 hours or I leak your photos. " +
  "Call me on 98765 43210. Check instagram.com/rahul_07_official";

export async function POST() {
  if (!isDevLoginEnabled()) {
    return NextResponse.json(
      { error: "Demo seeding is only available in local development." },
      { status: 404 }
    );
  }

  try {
    const store = getOffenderStore();
    const now = Date.now();
    const reports: IndicatorReport[] = DEMO.flatMap((ind) =>
      ind.reports.map((r, i) => ({
        indicatorHash: hashIndicator(ind.type, ind.value),
        indicatorType: ind.type,
        reporterHash: hashReporter(`demo:${ind.type}:${i}`),
        category: r.category,
        region: r.region,
        createdAt: new Date(now - r.daysAgo * 24 * 60 * 60 * 1000).toISOString(),
      }))
    );

    const { inserted, duplicates } = await store.addReports(reports);
    return NextResponse.json({
      backend: store.backend,
      inserted,
      duplicates,
      demoMessage: DEMO_MESSAGE,
    });
  } catch (error) {
    return NextResponse.json(
      {
        error: "Could not seed the Sakhi Network demo.",
        details: error instanceof Error ? error.message : String(error),
      },
      { status: 503 }
    );
  }
}
