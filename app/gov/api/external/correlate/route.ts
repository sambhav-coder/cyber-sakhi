import { NextResponse } from "next/server";
import { requireGovApi } from "@/lib/gov/govApi";
import { govSearchIndicators, resolveGovScopeFilter } from "@/lib/gov/govQueries";
import { govJsonError, govJsonOk } from "@/lib/gov/govHttp";

export const runtime = "nodejs";

/**
 * Correlate one external IOC against the officer's scoped Cyber-Sakhi
 * indicators (PART 5 lifecycle: external IOC -> correlation -> review).
 * Read-only; scope enforced inside govSearchIndicators. Never creates cases.
 */
export async function POST(req: Request): Promise<NextResponse> {
  const guard = await requireGovApi(req, "indicator.correlate");
  if (!guard.ok) return guard.response;
  const body = (await req.json().catch(() => null)) as { value?: unknown } | null;
  const value = typeof body?.value === "string" ? body.value.trim().slice(0, 2048) : "";
  if (!value) return govJsonError(400, "BAD_REQUEST", "An indicator value is required.");
  const matches = await govSearchIndicators(await resolveGovScopeFilter(guard.context.officer), value, 10).catch(() => null);
  if (!matches) return govJsonError(500, "CORRELATION_FAILED", "Unable to correlate this indicator.");
  return govJsonOk({ matches });
}
