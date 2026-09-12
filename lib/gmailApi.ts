import { decryptGmailToken } from "./gmailToken";

export interface GmailTokenPayload {
  accessToken: string;
  refreshToken: string | null;
  expiresAt: number;
}

export function parseGmailToken(
  encryptedToken: string
): GmailTokenPayload {
  const decrypted = decryptGmailToken(encryptedToken);

  const data = JSON.parse(decrypted) as GmailTokenPayload;

  if (!data.accessToken || !data.expiresAt) {
    throw new Error("Invalid Gmail token payload.");
  }

  return data;
}

export async function refreshGmailAccessToken(
  refreshToken: string
): Promise<GmailTokenPayload> {
  const clientId = process.env.GOOGLE_GMAIL_CLIENT_ID;
  const clientSecret = process.env.GOOGLE_GMAIL_CLIENT_SECRET;

  if (!clientId || !clientSecret) {
    throw new Error("Gmail OAuth credentials are not configured.");
  }

  const response = await fetch(
    "https://oauth2.googleapis.com/token",
    {
      method: "POST",
      headers: {
        "Content-Type": "application/x-www-form-urlencoded",
      },
      body: new URLSearchParams({
        client_id: clientId,
        client_secret: clientSecret,
        refresh_token: refreshToken,
        grant_type: "refresh_token",
      }),
    }
  );

  if (!response.ok) {
    const errorText = await response.text();

    throw new Error(
      `Failed to refresh Gmail access token: ${errorText}`
    );
  }

  const data = await response.json();

  if (!data.access_token) {
    throw new Error(
      "Google did not return a refreshed access token."
    );
  }

  return {
    accessToken: data.access_token,
    refreshToken,
    expiresAt:
      Date.now() + (data.expires_in || 3600) * 1000,
  };
}