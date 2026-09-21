import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/authOptions";
import {
  generateRetentionReport,
  handleRetentionPurgeRequest,
  previewRetentionPurge,
  type RetentionPolicy,
} from "@/lib/privacy/retention";

/**
 * GET /api/admin/retention - Generate retention report
 * POST /api/admin/retention - Execute safe purge (admin only)
 */
export async function GET(req: NextRequest) {
  try {
    const session = await getServerSession(authOptions);
    if (!session?.user?.id) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    if (session.user.role !== "ADMIN") {
      return NextResponse.json(
        { error: "Forbidden: Administrator role required" },
        { status: 403 }
      );
    }

    const { searchParams } = new URL(req.url);
    const evidenceDays = parseInt(searchParams.get("evidenceDays") || "365", 10);
    const caseMetadataDays = parseInt(searchParams.get("caseMetadataDays") || "730", 10);

    const policy: RetentionPolicy = {
      evidenceDays,
      caseMetadataDays,
    };

    const report = await generateRetentionReport(session.user.id, policy);

    return NextResponse.json({
      status: "success",
      report,
      authenticatedAdmin: session.user.email,
      generatedAt: new Date().toISOString(),
    });
  } catch (error) {
    return NextResponse.json(
      {
        error: error instanceof Error ? error.message : "Failed to generate retention report",
      },
      { status: 500 }
    );
  }
}

export async function POST(req: NextRequest) {
  try {
    const session = await getServerSession(authOptions);
    if (!session?.user?.id) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    if (session.user.role !== "ADMIN") {
      return NextResponse.json(
        { error: "Forbidden: Administrator role required for data purge" },
        { status: 403 }
      );
    }

    const body = await req.json();
    const { action, customPolicy } = body;

    if (action === "preview") {
      const policy: RetentionPolicy = customPolicy || {
        evidenceDays: 365,
        caseMetadataDays: 730,
      };
      const preview = await previewRetentionPurge(session.user.id, policy);

      return NextResponse.json({
        status: "success",
        action: "preview",
        preview,
        authenticatedAdmin: session.user.email,
        generatedAt: new Date().toISOString(),
      });
    }

    if (action === "purge") {
      const policy: RetentionPolicy = customPolicy || {
        evidenceDays: 365,
        caseMetadataDays: 730,
      };
      const result = await handleRetentionPurgeRequest(session.user.id, policy);

      return NextResponse.json({
        status: "success",
        action: "purge",
        result,
        authenticatedAdmin: session.user.email,
        executedAt: new Date().toISOString(),
      });
    }

    return NextResponse.json(
      { error: "Invalid action. Use 'preview' or 'purge'" },
      { status: 400 }
    );
  } catch (error) {
    return NextResponse.json(
      {
        error: error instanceof Error ? error.message : "Failed to process retention request",
      },
      { status: 500 }
    );
  }
}