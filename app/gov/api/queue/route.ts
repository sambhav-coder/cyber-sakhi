import { NextResponse } from "next/server";
import { requireGovApi } from "@/lib/gov/govApi";
import { govQueue, resolveGovScopeFilter } from "@/lib/gov/govQueries";
export const runtime = "nodejs";
export async function GET(req: Request) {
  const guard = await requireGovApi(req, "case.view_meta"); if (!guard.ok) return guard.response;
  const p = new URL(req.url).searchParams; const view = p.get("view") === "TRIAGED" ? "TRIAGED" : p.get("view") === "PRIORITY" ? "PRIORITY" : "NEW";
  // Optional reporting-window narrowing (used by the Overview preview so it
  // reflects the selected date filter). Both bounds must be valid ISO dates;
  // anything else is ignored (unwindowed) rather than failing the queue.
  const parseDate = (v: string | null): string | null => {
    if (!v) return null;
    const t = Date.parse(v);
    return Number.isNaN(t) ? null : new Date(t).toISOString();
  };
  const from = parseDate(p.get("from"));
  const to = parseDate(p.get("to"));
  return NextResponse.json(await govQueue(await resolveGovScopeFilter(guard.context.officer), view, Math.min(100, Math.max(1, Number(p.get("pageSize") ?? 25) || 25)), { from, to }));
}
