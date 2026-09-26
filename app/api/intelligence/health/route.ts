import { NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/authOptions";
import { liveProviderHealth } from "@/lib/intel/orchestrator";

export const dynamic = "force-dynamic";

/**
 * GET /api/intelligence/health
 *
 * Live provider health: one lightweight real request per source. Never
 * includes keys, passwords, tokens, or Authorization material — names,
 * statuses, latencies, and short details only. Authenticated users only.
 */
export async function GET() {
  try {
    const session = await getServerSession(authOptions);
    if (!session?.user?.id) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }
    const providers = await liveProviderHealth(session.user.id);
    return NextResponse.json({ generatedAt: new Date().toISOString(), providers });
  } catch {
    return NextResponse.json({ error: "Health check failed." }, { status: 503 });
  }
}
