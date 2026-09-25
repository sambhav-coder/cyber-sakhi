import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/authOptions";
import {
  encryptGmailToken,
  getGmailTokenCookieName,
} from "@/lib/gmailToken";
import {
  parseGmailToken,
  refreshGmailAccessToken,
  GmailTokenPayload,
} from "@/lib/gmailApi";
import {
  decodeGmailRaw,
  rebuildEmailFromFull,
  type GmailPart,
} from "@/lib/gmailDecoder";
import { analyzeEmail } from "@/lib/emailForensics";
import { saveAnalysisToHistory } from "@/lib/db/casePipeline";

interface RouteContext {
  params: {
    id: string;
  };
}

export async function GET(
  req: NextRequest,
  { params }: RouteContext
) {
  const session = await getServerSession(authOptions);

  if (!session?.user?.id || !session?.user?.email) {
    return NextResponse.json(
      { error: "Please login first." },
      { status: 401 }
    );
  }

  if (!params.id) {
    return NextResponse.json(
      { error: "Gmail message ID is required." },
      { status: 400 }
    );
  }

  // Get user-scoped Gmail token cookie
  const userCookieName = getGmailTokenCookieName(session.user.id);
  const encryptedToken = req.cookies.get(userCookieName)?.value;

  if (!encryptedToken) {
    return NextResponse.json(
      { error: "Gmail is not connected." },
      { status: 401 }
    );
  }

  try {
    let tokenData: GmailTokenPayload =
      parseGmailToken(encryptedToken);

    // Refresh the access token when it is close to expiry.
    if (Date.now() >= tokenData.expiresAt - 60_000) {
      if (!tokenData.refreshToken) {
        return NextResponse.json(
          {
            error:
              "Gmail access token has expired. Please reconnect Gmail.",
          },
          { status: 401 }
        );
      }

      tokenData = await refreshGmailAccessToken(
        tokenData.refreshToken
      );
    }

    const fetchMessage = (format: "raw" | "full") => {
      const gmailUrl = new URL(
        `https://gmail.googleapis.com/gmail/v1/users/me/messages/${encodeURIComponent(
          params.id
        )}`
      );
      gmailUrl.searchParams.set("format", format);
      return fetch(gmailUrl.toString(), {
        headers: {
          Authorization: `Bearer ${tokenData.accessToken}`,
        },
        cache: "no-store",
      });
    };

    // Prefer the exact MIME source. If Gmail refuses format=raw, fall back
    // to format=full (the same fetch the inbox quick scan uses) and rebuild
    // the headers and text body from it.
    let gmailResponse = await fetchMessage("raw");
    let usedFallback = false;

    if (!gmailResponse.ok) {
      const rawError = await gmailResponse.text();
      console.error(
        `[gmail/analyze] format=raw failed (${gmailResponse.status}):`,
        rawError
      );
      gmailResponse = await fetchMessage("full");
      usedFallback = true;
    }

    if (!gmailResponse.ok) {
      const errorText = await gmailResponse.text();
      console.error(
        `[gmail/analyze] format=full failed (${gmailResponse.status}):`,
        errorText
      );

      let googleMessage: string | undefined;
      try {
        googleMessage = JSON.parse(errorText)?.error?.message;
      } catch {
        /* non-JSON error body */
      }

      return NextResponse.json(
        {
          error: googleMessage
            ? `Failed to fetch Gmail message: ${googleMessage}`
            : "Failed to fetch Gmail message.",
          details: errorText,
        },
        { status: gmailResponse.status }
      );
    }

    const gmailMessage = await gmailResponse.json();

    // Gmail returns raw MIME as base64url encoded content.
    const rawEmail = usedFallback
      ? rebuildEmailFromFull(gmailMessage.payload as GmailPart)
      : gmailMessage.raw
        ? decodeGmailRaw(gmailMessage.raw)
        : "";

    if (!rawEmail.trim()) {
      return NextResponse.json(
        {
          error: "The decoded Gmail message is empty.",
        },
        { status: 422 }
      );
    }

    // Send the real email source into the existing forensic engine.
    const analysis = await analyzeEmail(rawEmail);

    // Save to the user's analysis history, mirroring the raw-paste flow.
    // No case is created unless the user asks for one.
    const saved = await saveAnalysisToHistory({
      userId: session.user.id,
      result: analysis,
      source: "gmail",
      externalMessageId: gmailMessage.id,
    });

    const result = NextResponse.json({
      success: true,
      message: {
        id: gmailMessage.id,
        threadId: gmailMessage.threadId || null,
        labelIds: gmailMessage.labelIds || [],
        sizeEstimate: gmailMessage.sizeEstimate || 0,
        internalDate: gmailMessage.internalDate || null,
      },
      analysis,
      historyId: saved.historyId,
      historySaveError: saved.historySaveError,
    });

    // Update user-scoped cookie with refreshed token
    result.cookies.set({
      name: userCookieName,
      value: encryptGmailToken(JSON.stringify(tokenData)),
      httpOnly: true,
      secure: process.env.NODE_ENV === "production",
      sameSite: "lax",
      path: "/",
      maxAge: 60 * 60 * 24 * 30,
    });

    return result;
  } catch (error) {
    return NextResponse.json(
      {
        error: "Gmail forensic analysis failed.",
        details:
          error instanceof Error
            ? error.message
            : String(error),
      },
      { status: 500 }
    );
  }
}
