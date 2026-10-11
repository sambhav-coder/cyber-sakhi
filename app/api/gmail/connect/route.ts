import crypto from "crypto";
import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/authOptions";
import {
  getGmailOAuthCredentials,
  getGmailReadonlyScope,
  getGmailRedirectUri,
} from "@/lib/gmailOAuth";

const GMAIL_STATE_COOKIE = "cyber_sakhi_gmail_oauth_state";

export async function GET(req: NextRequest) {
  const session = await getServerSession(authOptions);

  if (!session?.user?.email) {
    return NextResponse.redirect(
      new URL("/login?error=Please%20login%20first", req.url)
    );
  }

  let clientId: string;
  let redirectUri: string;
  try {
    ({ clientId } = getGmailOAuthCredentials());
    redirectUri = getGmailRedirectUri();
  } catch {
    return NextResponse.json(
      { error: "Gmail OAuth is not configured on the server." },
      { status: 500 }
    );
  }

  // Generate a cryptographically random state value
  // to protect the OAuth callback against CSRF.
  const state = crypto.randomBytes(32).toString("hex");

  const params = new URLSearchParams({
    client_id: clientId,
    redirect_uri: redirectUri,
    response_type: "code",
    scope: getGmailReadonlyScope(),
    access_type: "offline",
    prompt: "consent",
    include_granted_scopes: "true",
    state,
  });

  const googleAuthUrl =
    `https://accounts.google.com/o/oauth2/v2/auth?${params.toString()}`;

  const response = NextResponse.redirect(googleAuthUrl);

  response.cookies.set({
    name: GMAIL_STATE_COOKIE,
    value: state,
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax",
    path: "/api/gmail",
    maxAge: 10 * 60,
  });

  return response;
}
