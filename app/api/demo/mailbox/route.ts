import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/authOptions";
import { canUseDemoMode, isDemoSession } from "@/lib/demoMode";
import { getAllDemoEmails, getDemoEmailsByType } from "@/lib/demoEmails";

/**
 * GET /api/demo/mailbox
 * 
 * Returns demo mailbox data for the SIH Demo account.
 * This endpoint only works for the authorized SIH Demo user.
 */
export async function GET(req: NextRequest) {
  const session = await getServerSession(authOptions);

  if (!session?.user?.id || !session?.user?.email) {
    return NextResponse.json(
      { error: "Please login first." },
      { status: 401 }
    );
  }

  // Verify this is the SIH Demo account
  if (!canUseDemoMode(session)) {
    return NextResponse.json(
      { error: "Demo mailbox is only available for the SIH Demo account." },
      { status: 403 }
    );
  }

  const demoSession = isDemoSession(session);

  try {
    const searchParams = req.nextUrl.searchParams;
    const folder = searchParams.get("folder") || "INBOX";
    const forensicType = searchParams.get("type") as any;

    let demoEmails = getAllDemoEmails();

    // Filter by forensic type if specified
    if (forensicType) {
      demoEmails = getDemoEmailsByType(forensicType);
    }

    // Filter by folder (label)
    if (folder !== "ALL") {
      demoEmails = demoEmails.filter(email => 
        email.labelIds.includes(folder)
      );
    }

    // Transform demo emails to match Gmail API response format
    const messages = demoEmails.map(email => ({
      id: email.id,
      threadId: email.threadId,
      labelIds: email.labelIds,
      snippet: email.snippet,
      internalDate: email.internalDate,
      sizeEstimate: email.sizeEstimate,
      from: email.from,
      to: email.to,
      subject: email.subject,
      date: email.date,
      // Add demo-specific metadata
      isDemo: true,
      forensicType: email.forensicType,
      description: email.description,
    }));

    return NextResponse.json({
      messages,
      nextPageToken: null,
      resultSizeEstimate: messages.length,
      window: {
        days: 30,
        maxMessages: messages.length,
        capped: false,
      },
      demoMode: {
        enabled: true,
        sakhiNumber: demoSession.sakhiNumber,
        email: demoSession.email,
      },
    });
  } catch (error) {
    return NextResponse.json(
      {
        error: "Failed to load demo mailbox.",
        details: error instanceof Error ? error.message : String(error),
      },
      { status: 500 }
    );
  }
}