import { NextResponse } from "next/server";
import { requireGovApi } from "@/lib/gov/govApi";
import { govTrends, resolveGovScopeFilter } from "@/lib/gov/govQueries";
export const runtime = "nodejs";
export async function GET(req: Request) {
 const guard = await requireGovApi(req, "analytics.view"); if (!guard.ok) return guard.response;
 const p = new URL(req.url).searchParams;
 const clean = (v: string | null) => (v ?? "").trim().slice(0, 120) || null;
 const parseDate = (v: string | null): string | null => {
   if (!v) return null;
   const t = Date.parse(v);
   return Number.isNaN(t) ? null : new Date(t).toISOString();
 };
 const now = new Date();
 const customFrom = parseDate(p.get("from"));
 const customTo = parseDate(p.get("to")) ?? now.toISOString();
 let from: string; let to: string;
 if (customFrom) {
   from = customFrom; to = customTo;
 } else {
   const days = Math.min(365, Math.max(1, Number(p.get("days") ?? 30) || 30));
   to = now.toISOString(); from = new Date(now.getTime() - days * 86400000).toISOString();
 }
 const span = Math.max(1, Date.parse(to) - Date.parse(from));
 const prevTo = from; const prevFrom = new Date(Date.parse(from) - span).toISOString();
 const filters = {
   threatCategory: clean(p.get("threat")),
   riskLevel: clean(p.get("risk")),
   govStatus: clean(p.get("status")),
   stateCode: clean(p.get("state")),
   districtCode: clean(p.get("district")),
 };
 return NextResponse.json(await govTrends(await resolveGovScopeFilter(guard.context.officer), from, to, prevFrom, prevTo, filters));
}
