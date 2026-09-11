/**
 * GET /api/blockchain/status
 *
 * Safe, read-only endpoint returning the blockchain anchor provider status.
 * No secrets are exposed. Used by the locker page console and harness tests.
 */

import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/authOptions";
import { getSafeProviderMeta } from "@/lib/blockchain/anchor";

export async function GET(_req: NextRequest) {
  try {
    const session = await getServerSession(authOptions);
    if (!session?.user?.id) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const meta = getSafeProviderMeta();
    return NextResponse.json({
      status: meta.configured ? "configured" : "not_configured",
      provider: meta.provider,
      enabled: meta.enabled,
      configured: meta.configured,
      networkName: meta.networkName,
      chainId: meta.chainId,
      message: meta.configured
        ? "Blockchain anchoring is available — real on-chain transactions may be created"
        : "Blockchain anchoring is not configured — no on-chain transactions will be created",
    });
  } catch (error) {
    return NextResponse.json(
      {
        status: "not_configured",
        configured: false,
        enabled: false,
        message: "Blockchain status check failed",
      },
      { status: 200 } // Always 200 — non-configured is not an error
    );
  }
}
