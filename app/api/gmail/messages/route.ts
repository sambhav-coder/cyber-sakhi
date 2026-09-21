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

/* ------------------------------------------------------------------ *
 * GET /api/gmail/messages?days=30
 *
 * Lists the user's mail from the last `days` days (default 30, max 90),
 * following Gmail's pagination instead of stopping at the first 20
 * results. Capped at MAX_MESSAGES so a very busy inbox cannot turn one
 * request into thousands of Gmail API calls.
 * ------------------------------------------------------------------ */

const DEFAULT_DAYS = 30;
const MAX_DAYS = 90;
const MAX_MESSAGES = 300;
const PAGE_SIZE = 100;
// Gmail allows ~50 message reads per second per user; stay well under it.
const METADATA_CONCURRENCY = 8;

async function mapLimit<T, R>(
  items: T[],
  limit: number,
  fn: (item: T) => Promise<R>
): Promise<R[]> {
  const out = new Array<R>(items.length);
  let next = 0;
  const workers = Array.from({ length: Math.min(limit, items.length) }, async () => {
    while (next < items.length) {
      const i = next++;
      out[i] = await fn(items[i]);
    }
  });
  await Promise.all(workers);
  return out;
}

export async function GET(req: NextRequest) {
  const session = await getServerSession(authOptions);

  if (!session?.user?.id || !session?.user?.email) {
    return NextResponse.json(
      { error: "Please login first." },
      { status: 401 }
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

  const requestedDays = Number(req.nextUrl.searchParams.get("days"));
  const days =
    Number.isFinite(requestedDays) && requestedDays >= 1
      ? Math.min(Math.floor(requestedDays), MAX_DAYS)
      : DEFAULT_DAYS;

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

    const authHeader = { Authorization: `Bearer ${tokenData.accessToken}` };

    // 1. Collect message ids for the window, page by page.
    const messageIds: string[] = [];
    let pageToken: string | undefined;
    let resultSizeEstimate = 0;

    do {
      const url = new URL(
        "https://gmail.googleapis.com/gmail/v1/users/me/messages"
      );
      url.searchParams.set("maxResults", String(PAGE_SIZE));
      url.searchParams.set("includeSpamTrash", "true");
      url.searchParams.set("q", `newer_than:${days}d`);
      if (pageToken) url.searchParams.set("pageToken", pageToken);

      const response = await fetch(url.toString(), {
        headers: authHeader,
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
      if (!resultSizeEstimate) resultSizeEstimate = data.resultSizeEstimate || 0;
      for (const m of (data.messages || []) as { id: string }[]) {
        if (messageIds.length < MAX_MESSAGES) messageIds.push(m.id);
      }
      pageToken = data.nextPageToken || undefined;
    } while (pageToken && messageIds.length < MAX_MESSAGES);

    const capped = Boolean(pageToken);

    // 2. Fetch list metadata for each id, a few at a time.
    const enrichedMessages = await mapLimit(
      messageIds,
      METADATA_CONCURRENCY,
      async (id: string) => {
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
            headers: authHeader,
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
      }
    );

    const result = NextResponse.json({
      messages: enrichedMessages,
      nextPageToken: capped ? pageToken : null,
      resultSizeEstimate,
      window: {
        days,
        maxMessages: MAX_MESSAGES,
        capped,
      },
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
        details: error instanceof Error ? error.message : String(error),
      },
      { status: 500 }
    );
  }
}
