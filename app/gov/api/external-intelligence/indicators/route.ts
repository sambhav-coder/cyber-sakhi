import { NextResponse } from "next/server";
import { requireGovApi } from "@/lib/gov/govApi";
import { govJsonError } from "@/lib/gov/govHttp";
import { listExternalIndicators } from "@/lib/gov/govExternalIntel";

export const runtime = "nodejs";

export async function GET(req: Request) {
  const guard = await requireGovApi(req, "indicator.view");
  if (!guard.ok) return guard.response;
  const limit = Number(new URL(req.url).searchParams.get("limit") ?? 50);
  try { return NextResponse.json(await listExternalIndicators(limit)); }
  catch { return govJsonError(503, "EXTERNAL_INTEL_UNAVAILABLE", "External-intelligence storage is unavailable. Apply the approved migration first."); }
}
