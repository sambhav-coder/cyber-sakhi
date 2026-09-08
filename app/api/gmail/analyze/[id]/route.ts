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
import { decodeGmailRaw } from "@/lib/gmailDecoder";
import { analyzeEmail } from "@/lib/emailForensics";

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

    const gmailUrl = new URL(
      `https://gmail.googleapis.com/gmail/v1/users/me/messages/${encodeURIComponent(
        params.id
      )}`
    );

    gmailUrl.searchParams.set("format", "raw");

    const gmailResponse = await fetch(gmailUrl.toString(), {
      headers: {
        Authorization: `Bearer ${tokenData.accessToken}`,
      },
      cache: "no-store",
    });

    if (!gmailResponse.ok) {
      const errorText = await gmailResponse.text();

      return NextResponse.json(
        {
          error: "Failed to fetch Gmail message.",
          details: errorText,
        },
        { status: gmailResponse.status }
      );
    }

    const gmailMessage = await gmailResponse.json();

    if (!gmailMessage.raw) {
      return NextResponse.json(
        {
          error:
            "Gmail returned the message, but no raw MIME source was available.",
        },
        { status: 422 }
      );
    }

    // Gmail returns raw MIME as base64url encoded content.
    const rawEmail = decodeGmailRaw(gmailMessage.raw);

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
