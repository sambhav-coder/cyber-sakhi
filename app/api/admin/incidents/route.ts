import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/authOptions";
import { DEFAULT_ADMIN_INCIDENTS } from "@/lib/storage";

export async function GET(req: NextRequest) {
  const session = await getServerSession(authOptions);

  // Server-side RBAC Guard
  if (!session || !session.user) {
    return NextResponse.json(
      { error: "Unauthorized: Authentication required." },
      { status: 401 }
    );
  }

  if (session.user.role !== "ADMIN") {
    return NextResponse.json(
      { error: "Forbidden: Administrator role required to access institutional incident telemetry." },
      { status: 403 }
    );
  }

  return NextResponse.json({
    status: "success",
    incidents: DEFAULT_ADMIN_INCIDENTS,
    anonymizedCount: DEFAULT_ADMIN_INCIDENTS.length,
    authenticatedAdmin: session.user.email,
  });
}