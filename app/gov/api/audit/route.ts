import { NextResponse } from "next/server";
import { requireGovApi } from "@/lib/gov/govApi";
import { govAuditLogs } from "@/lib/gov/govQueries";
export const runtime = "nodejs";
export async function GET(req: Request) {
 const guard = await requireGovApi(req, "audit.view"); if (!guard.ok) return guard.response;
 const p = new URL(req.url).searchParams;
 return NextResponse.json(await govAuditLogs({ officerId: p.get("officer"), action: p.get("action"), caseId: p.get("caseId"), from: p.get("from"), to: p.get("to"), outcome: p.get("outcome"), page: Math.max(1, Number(p.get("page") ?? 1) || 1), pageSize: Math.min(100, Math.max(1, Number(p.get("pageSize") ?? 25) || 25)) }));
}
