import crypto from "crypto";
import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/authOptions";
import {
  encryptGmailToken,
  getGmailTokenCookieName,
} from "@/lib/gmailToken";

const GMAIL_STATE_COOKIE = "cyber_sakhi_gmail_oauth_state";

export async function GET(req: NextRequest) {
  const session = await getServerSession(authOptions);

  if (!session?.user?.id || !session?.user?.email) {
    return NextResponse.redirect(
      new URL("/login?error=Please%20login%20first", req.url)
    );
  }

  const returnedState = req.nextUrl.searchParams.get("state");
  const storedState = req.cookies.get(GMAIL_STATE_COOKIE)?.value;

  if (!returnedState || !storedState) {
    return NextResponse.redirect(
      new URL(
        "/dashboard?gmail_error=OAuth%20state%20missing",
        req.url
      )
    );
  }

  const statesMatch =
    returnedState.length === storedState.length &&
    crypto.timingSafeEqual(
      Buffer.from(returnedState),
      Buffer.from(storedState)
    );

  if (!statesMatch) {
    return NextResponse.redirect(
      new URL(
        "/dashboard?gmail_error=Invalid%20OAuth%20state",
        req.url
      )
    );
  }

  const code = req.nextUrl.searchParams.get("code");
  const error = req.nextUrl.searchParams.get("error");

  if (error) {
    return NextResponse.redirect(
      new URL(
        `/dashboard?gmail_error=${encodeURIComponent(error)}`,
        req.url
      )
    );
  }

  if (!code) {
    return NextResponse.redirect(
      new URL(
        "/dashboard?gmail_error=Authorization%20code%20missing",
        req.url
      )
    );
  }

  const clientId = process.env.GOOGLE_CLIENT_ID;
  const clientSecret = process.env.GOOGLE_CLIENT_SECRET;

  if (!clientId || !clientSecret) {
    return NextResponse.json(
      {
        error: "Google OAuth credentials are not configured.",
      },
      { status: 500 }
    );
  }

  const redirectUri = `${req.nextUrl.origin}/api/gmail/callback`;

  const tokenResponse = await fetch(
    "https://oauth2.googleapis.com/token",
    {
      method: "POST",
      headers: {
        "Content-Type": "application/x-www-form-urlencoded",
      },
      body: new URLSearchParams({
        code,
        client_id: clientId,
        client_secret: clientSecret,
        redirect_uri: redirectUri,
        grant_type: "authorization_code",
      }),
    }
  );

  if (!tokenResponse.ok) {
    const errorText = await tokenResponse.text();

    return NextResponse.json(
      {
        error: "Failed to exchange Google authorization code.",
        details: errorText,
      },
      { status: 500 }
    );
  }

  const tokenData = await tokenResponse.json();

  if (!tokenData.access_token) {
    return NextResponse.json(
      {
        error: "Google did not return an access token.",
      },
      { status: 500 }
    );
  }

  const tokenPayload = JSON.stringify({
    accessToken: tokenData.access_token,
    refreshToken: tokenData.refresh_token || null,
    expiresAt:
      Date.now() + (tokenData.expires_in || 3600) * 1000,
  });

  const response = NextResponse.redirect(
    new URL("/email-forensics/gmail?gmail=connected", req.url)
  );

  // Store Gmail token in user-scoped cookie
  const userCookieName = getGmailTokenCookieName(session.user.id);
  response.cookies.set({
    name: userCookieName,
    value: encryptGmailToken(tokenPayload),
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax",
    path: "/",
    maxAge: 60 * 60 * 24 * 30,
  });

  response.cookies.set({
    name: GMAIL_STATE_COOKIE,
    value: "",
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax",
    path: "/api/gmail",
    maxAge: 0,
  });

  return response;
}