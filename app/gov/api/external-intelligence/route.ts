import { NextResponse } from "next/server";
import { requireGovApi } from "@/lib/gov/govApi";
import { govForbidden, govJsonError, isCrossOriginRequest } from "@/lib/gov/govHttp";
import { externalIntelSummary, syncUrlhaus } from "@/lib/gov/govExternalIntel";

export const runtime = "nodejs";

export async function GET(req: Request) {
  const guard = await requireGovApi(req, "policy.view");
  if (!guard.ok) return guard.response;
  try { return NextResponse.json(await externalIntelSummary()); }
  catch { return govJsonError(503, "EXTERNAL_INTEL_UNAVAILABLE", "External-intelligence storage is unavailable. Apply the approved migration first."); }
}

export async function POST(req: Request) {
  const guard = await requireGovApi(req, "policy.view");
  if (!guard.ok) return guard.response;
  if (isCrossOriginRequest(req)) return govForbidden("CSRF_REJECTED", "Cross-origin request rejected.");
  if (guard.context.officer.role !== "SUPER_ADMIN" || !guard.context.mfaFresh) return govForbidden("SYNC_NOT_AUTHORIZED", "A fresh MFA-verified super-administrator session is required to synchronize external intelligence.");
  try { return NextResponse.json({ source: "URLhaus", ...(await syncUrlhaus(guard.context.officer.id)) }); }
  catch (e) {
    const message = e instanceof Error && e.message.includes("URLHAUS_AUTH_KEY") ? "URLhaus is disabled until URLHAUS_AUTH_KEY (or URLHAUS_API_KEY) is configured." : "External-intelligence synchronization failed. Check source health and ingestion logs.";
    return govJsonError(503, "EXTERNAL_INTEL_SYNC_FAILED", message);
  }
}
