import { NextRequest, NextResponse } from "next/server";
import { getOffenderStore } from "@/lib/offenderNetwork/store";
import { getRequesterHash, parseIndicators, toDay } from "@/lib/offenderNetwork/server";
import {
  K_ANONYMITY,
  type LookupResponse,
  type LookupResult,
} from "@/lib/offenderNetwork/constants";

/* POST /api/offender-network/lookup
 *
 * "Has anyone else reported these identifiers?" Open to signed-out users.
 * Returns counts only; region and category detail is released once at
 * least K_ANONYMITY distinct accounts have reported the same identifier. */

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST(req: NextRequest) {
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

  try {
    const store = getOffenderStore();
    const requesterHash = await getRequesterHash();
    const hashes = parsed.items.flatMap((i) => (i ? [i.hash] : []));
    const stats = await store.getStats(hashes, requesterHash);

    const results: LookupResult[] = parsed.items.map((item, index) => {
      if (!item) {
        return {
          index,
          valid: false,
          otherReporters: 0,
          requesterHasReported: false,
          firstSeenDay: null,
          lastSeenDay: null,
          regions: [],
          categories: [],
          detailWithheld: false,
        };
      }

      const s = stats.get(item.hash);
      const others = s?.otherReporters ?? 0;
      /* Counted WITHOUT the requester. If the requester counted toward k,
       * two victims plus one curious account would cross the threshold and
       * that account would learn the other two's cities — effectively k=2.
       * It would also let an offender report their own number to unlock
       * victims' locations sooner. */
      const releaseDetail = others >= K_ANONYMITY;

      return {
        index,
        valid: true,
        otherReporters: s?.otherReporters ?? 0,
        requesterHasReported: s?.requesterHasReported ?? false,
        firstSeenDay: releaseDetail ? toDay(s?.firstSeen ?? null) : null,
        lastSeenDay: releaseDetail ? toDay(s?.lastSeen ?? null) : null,
        regions: releaseDetail ? s?.regions ?? [] : [],
        categories: releaseDetail ? s?.categories ?? [] : [],
        detailWithheld: others > 0 && !releaseDetail,
      };
    });

    const response: LookupResponse = { backend: store.backend, results };
    return NextResponse.json(response, { headers: { "Cache-Control": "no-store" } });
  } catch (error) {
    return NextResponse.json(
      {
        error: "Sakhi Network is unavailable right now.",
        details: error instanceof Error ? error.message : String(error),
      },
      { status: 503 }
    );
  }
}
