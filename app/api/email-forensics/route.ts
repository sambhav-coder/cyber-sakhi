import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/authOptions";
import { analyzeEmail } from "@/lib/emailForensics";
import { createCase } from "@/lib/db/cases";
import { createEmailInvestigation } from "@/lib/db/emailInvestigations";
import { createIndicators } from "@/lib/db/indicators";

function classifyThreatType(result: Awaited<ReturnType<typeof analyzeEmail>>): string {
  const auth = result.authentication;
  const authFail =
    auth.spf.status === "fail" ||
    auth.dkim.status === "fail" ||
    auth.dmarc.status === "fail";

  if (authFail || result.senderSpoofingDetected) return "EMAIL_PHISHING";
  if (result.threatScore >= 40) return "EMAIL_FRAUD";
  return "EMAIL_INVESTIGATION";
}

export async function POST(req: NextRequest) {
  try {
    const session = await getServerSession(authOptions);
    if (!session?.user?.id) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const body = await req.json();
    const { rawEmail, saveAsCase = false } = body;

    if (!rawEmail || typeof rawEmail !== "string") {
      return NextResponse.json(
        { error: "rawEmail field is required and must be a string." },
        { status: 400 }
      );
    }

    const trimmed = rawEmail.trim();
    if (trimmed.length < 30) {
      return NextResponse.json(
        {
          error:
            "Input is too short. Please paste a complete email header or raw email source.",
        },
        { status: 400 }
      );
    }

    const result = await analyzeEmail(trimmed);

    if (saveAsCase !== true) {
      return NextResponse.json(result);
    }

    const threatType = classifyThreatType(result);
    const title = result.headers.subject?.trim().slice(0, 120) ||
      `Email Investigation — ${result.senderDomain || "unknown sender"}`;

    let createdCase: Awaited<ReturnType<typeof createCase>> | null = null;
    let caseSaveError: string | undefined;

    try {
      createdCase = await createCase({
        userId: session.user.id,
        title,
        description: [
          `Forensic scan of an email from ${result.senderDomain || "unknown sender"}.`,
          `Findings: ${result.findings.length}. Indicators: ${result.indicators.length}.`,
          result.senderSpoofingDetected
            ? "Spoofing signals detected."
            : "No spoofing signals detected.",
        ].join(" "),
        threatType,
        status: "open",
        severity: result.threatLevel,
      });
    } catch (caseError) {
      caseSaveError =
        "Analysis succeeded but the case could not be persisted: " +
        (caseError instanceof Error ? caseError.message : "unknown error");
    }

    if (!createdCase) {
      return NextResponse.json({ ...result, case: null, caseSaveError });
    }

    let investigationId: string | undefined;
    try {
      const investigation = await createEmailInvestigation({
        userId: session.user.id,
        caseId: createdCase.id,
        result,
      });
      investigationId = investigation.id;
    } catch {
      investigationId = undefined;
    }

    let indicatorSaveState = "ok";
    if (investigationId) {
      try {
        await createIndicators({
          investigationId,
          caseId: createdCase.id,
          indicators: result.indicators,
        });
      } catch {
        indicatorSaveState = "failed";
      }
    }

    return NextResponse.json({
      ...result,
      case: {
        id: createdCase.id,
        caseNumber: createdCase.case_number,
        title: createdCase.title,
        threatType: createdCase.threat_type,
        status: createdCase.status,
        severity: createdCase.severity,
        createdAt: createdCase.created_at,
        indicatorSaveState,
      },
      caseSaveNote:
        indicatorSaveState === "failed"
          ? "Case created but some indicators could not be persisted."
          : undefined,
    });
  } catch (error) {
    return NextResponse.json(
      {
        error: "Email forensics analysis failed.",
        details: error instanceof Error ? error.message : String(error),
      },
      { status: 500 }
    );
  }
}