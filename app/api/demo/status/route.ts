import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/authOptions";
import { canUseDemoMode, isDemoSession } from "@/lib/demoMode";

/**
 * GET /api/demo/status
 * 
 * Returns whether the current session is eligible for demo mode.
 * This is used by the frontend to determine whether to show demo mailbox.
 */
export async function GET(req: NextRequest) {
  const session = await getServerSession(authOptions);

  if (!session?.user?.id || !session?.user?.email) {
    return NextResponse.json(
      { 
        isDemo: false,
        reason: "not_authenticated"
      },
      { status: 401 }
    );
  }

  const demoSession = isDemoSession(session);
  const canUseDemo = canUseDemoMode(session);

  return NextResponse.json({
    isDemo: canUseDemo,
    demoSession: {
      sakhiNumber: demoSession.sakhiNumber,
      email: demoSession.email,
    },
    demoModeEnabled: process.env.SIH_DEMO_ENABLED === "true",
  });
}