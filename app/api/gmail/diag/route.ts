import { NextRequest, NextResponse } from "next/server";

export const dynamic = "force-dynamic";

function maskClientId(v: string | undefined) {
  if (!v) return { exists: false };
  return { exists: true, length: v.length, first6: v.slice(0, 6), last6: v.slice(-6) };
}

function maskSecret(v: string | undefined) {
  if (!v) return { exists: false };
  return { exists: true, length: v.length, first4: v.slice(0, 4), last4: v.slice(-4) };
}

export async function GET(req: NextRequest) {
  const gmailId = process.env.GOOGLE_GMAIL_CLIENT_ID;
  const gmailSecret = process.env.GOOGLE_GMAIL_CLIENT_SECRET;
  const googleClientId = process.env.GOOGLE_CLIENT_ID;

  const requestOrigin = req.nextUrl.origin;
  const vercelUrl = process.env.VERCEL_URL || null;
  const nextauthUrl = process.env.NEXTAUTH_URL || null;

  const redirectUriCandidates: Record<string, string> = {
    requestOrigin: `${requestOrigin}/api/gmail/callback`,
  };
  if (vercelUrl) {
    redirectUriCandidates.vercelUrl = `https://${vercelUrl}/api/gmail/callback`;
  }
  if (nextauthUrl) {
    redirectUriCandidates.nextauthUrl = `${nextauthUrl.replace(/\/+$/, "")}/api/gmail/callback`;
  }

  return NextResponse.json(
    {
      tempDiagnostic: true,
      gmailClientId: maskClientId(gmailId),
      gmailClientSecret: maskSecret(gmailSecret),
      googleClientId: maskClientId(googleClientId),
      gmailIdMatchesGoogleClientId:
        !!gmailId && !!googleClientId && gmailId === googleClientId,
      redirectUriCandidates,
      env: { NODE_ENV: process.env.NODE_ENV || null },
    },
    { status: 200 }
  );
}