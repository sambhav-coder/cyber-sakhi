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

export async function GET(req: NextRequest) {
  const session = await getServerSession(authOptions);

  if (!session?.user?.email) {
    return NextResponse.json(
      { error: "Please login first." },
      { status: 401 }
    );
  }

  const encryptedToken = req.cookies.get(getGmailTokenCookieName())?.value;

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
          { error: "Gmail access token has expired. Please reconnect Gmail." },
          { status: 401 }
        );
      }
      tokenData = await refreshGmailAccessToken(tokenData.refreshToken);
    }

    const url = new URL(
      "https://gmail.googleapis.com/gmail/v1/users/me/messages"
    );

    url.searchParams.set("maxResults", "20");
    url.searchParams.set("includeSpamTrash", "true");

    const response = await fetch(url.toString(), {
      headers: {
        Authorization: `Bearer ${tokenData.accessToken}`,
      },
      cache: "no-store",
    });

    if (!response.ok) {
      const errorText = await response.text();

      return NextResponse.json(
        {
          error: "Failed to fetch Gmail messages.",
          details: errorText,
        },
        { status: response.status }
      );
    }

    const data = await response.json();

    const messageIds = (data.messages || []).map(
      (m: { id: string; threadId?: string }) => m.id
    );

    const enrichedMessages = await Promise.all(
      messageIds.map(async (id: string) => {
        try {
          const msgUrl = new URL(
            `https://gmail.googleapis.com/gmail/v1/users/me/messages/${id}`
          );
          msgUrl.searchParams.set("format", "metadata");
          msgUrl.searchParams.append("metadataHeaders", "From");
          msgUrl.searchParams.append("metadataHeaders", "To");
          msgUrl.searchParams.append("metadataHeaders", "Subject");
          msgUrl.searchParams.append("metadataHeaders", "Date");

          const msgRes = await fetch(msgUrl.toString(), {
            headers: {
              Authorization: `Bearer ${tokenData.accessToken}`,
            },
            cache: "no-store",
          });

          if (!msgRes.ok) {
            return { id };
          }

          const msgData = await msgRes.json();

          const getHeader = (name: string): string | null => {
            const header = (msgData.payload?.headers || []).find(
              (h: { name: string; value: string }) =>
                h.name.toLowerCase() === name.toLowerCase()
            );
            return header?.value ?? null;
          };

          return {
            id: msgData.id as string,
            threadId: msgData.threadId as string | undefined,
            labelIds: (msgData.labelIds || []) as string[],
            snippet: (msgData.snippet || "") as string,
            internalDate: msgData.internalDate
              ? Number(msgData.internalDate)
              : null,
            sizeEstimate: Number(msgData.sizeEstimate || 0),
            historyId: msgData.historyId || null,
            from: getHeader("From"),
            to: getHeader("To"),
            subject: getHeader("Subject"),
            date: getHeader("Date"),
          };
        } catch {
          return { id };
        }
      })
    );

    const result = NextResponse.json({
      messages: enrichedMessages,
      nextPageToken: data.nextPageToken || null,
      resultSizeEstimate: data.resultSizeEstimate || 0,
    });

    result.cookies.set({
      name: getGmailTokenCookieName(),
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
        details: error instanceof Error ? error.message : String(error),
      },
      { status: 500 }
    );
  }
}