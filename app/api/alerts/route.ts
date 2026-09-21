import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/authOptions";
import { analyzeEmail } from "@/lib/emailForensics";
import { generateAlerts } from "@/lib/alerts";

/**
 * GET /api/alerts - Retrieve user's recent alerts
 * POST /api/alerts - Generate alerts for email analysis
 */

export async function GET(req: NextRequest) {
  try {
    const session = await getServerSession(authOptions);
    if (!session?.user?.id) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    // For now, return a placeholder for user's alerts
    // In a full implementation, this would query a database of stored alerts
    return NextResponse.json({
      alerts: [],
      message: "Alert history would be retrieved from database in full implementation",
      userId: session.user.id,
    });
  } catch (error) {
    return NextResponse.json(
      {
        error: error instanceof Error ? error.message : "Failed to retrieve alerts",
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

    const body = await req.json();
    const { rawEmail } = body;

    if (!rawEmail || typeof rawEmail !== "string") {
      return NextResponse.json(
        { error: "rawEmail field is required and must be a string." },
        { status: 400 }
      );
    }

    // Analyze the email to get the full analysis result
    const analysisResult = await analyzeEmail(rawEmail.trim());

    // Generate alerts from the analysis
    const alerts = generateAlerts(analysisResult);

    // In a full implementation, these would be stored in a database
    // For now, return them directly
    return NextResponse.json({
      alerts,
      analysisId: analysisResult.id,
      threatLevel: analysisResult.threatLevel,
      threatScore: analysisResult.threatScore,
      generatedAt: new Date().toISOString(),
    });
  } catch (error) {
    return NextResponse.json(
      {
        error: error instanceof Error ? error.message : "Failed to generate alerts",
      },
      { status: 500 }
    );
  }
}