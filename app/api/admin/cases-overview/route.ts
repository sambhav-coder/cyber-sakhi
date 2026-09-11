import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/authOptions";
import { getAdminCaseOverview } from "@/lib/db/cases";

export async function GET(req: NextRequest) {
  const session = await getServerSession(authOptions);

  if (!session || !session.user) {
    return NextResponse.json(
      { error: "Unauthorized: Authentication required." },
      { status: 401 }
    );
  }

  if (session.user.role !== "ADMIN") {
    return NextResponse.json(
      {
        error:
          "Forbidden: Administrator role required to access institutional case telemetry.",
      },
      { status: 403 }
    );
  }

  const overview = await getAdminCaseOverview();

  return NextResponse.json({
    status: "success",
    overview,
    privacy: {
      anonymized: true,
      note: "Admin telemetry exposes operational metadata only (Case Number, threat type, severity, status, timestamps). No owner identity, subject, sender, content, or indicators are exposed.",
    },
    authenticatedAdmin: session.user.email,
    generatedAt: new Date().toISOString(),
  });
}