import { NextResponse } from "next/server";
import { guardGovApiRequest } from "@/lib/gov/govGuard";
import { govUnauthorized } from "@/lib/gov/govHttp";
import {
  classifyGovMfaFactor,
  getGovMfaFactor,
} from "@/lib/gov/govMfaEnrollment";

export const runtime = "nodejs";

/** Authenticated MFA status for UI gating (`none` | `pending` | `enabled`). */
export async function GET(req: Request): Promise<NextResponse> {
  const gate = await guardGovApiRequest(req);
  if (!gate.ok) return gate.response;
  try {
    const status = classifyGovMfaFactor(await getGovMfaFactor(gate.context.officer.id));
    return NextResponse.json({ status, mfaFresh: gate.context.mfaFresh });
  } catch {
    return govUnauthorized("MFA_UNAVAILABLE", "Unable to check MFA status.");
  }
}
