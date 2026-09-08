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

    const url =
      `https://gmail.googleapis.com/gmail/v1/users/me/messages/` +
      `${encodeURIComponent(params.id)}`;

    const gmailUrl = new URL(url);
    gmailUrl.searchParams.set("format", "raw");

    const response = await fetch(gmailUrl.toString(), {
      headers: {
        Authorization: `Bearer ${tokenData.accessToken}`,
      },
      cache: "no-store",
    });

    if (!response.ok) {
      const errorText = await response.text();

      return NextResponse.json(
        {
          error: "Failed to fetch Gmail message.",
          details: errorText,
        },
        { status: response.status }
      );
    }

    const data = await response.json();

    const result = NextResponse.json({
      id: data.id,
      threadId: data.threadId,
      labelIds: data.labelIds || [],
      raw: data.raw || null,
      sizeEstimate: data.sizeEstimate || 0,
      internalDate: data.internalDate || null,
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
        error: "Gmail message request failed.",
        details:
          error instanceof Error
            ? error.message
            : String(error),
      },
      { status: 500 }
    );
  }
}