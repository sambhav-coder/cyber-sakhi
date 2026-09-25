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
import { rebuildEmailFromFull, type GmailPart } from "@/lib/gmailDecoder";
import { analyzeEmail } from "@/lib/emailForensics";

/* ------------------------------------------------------------------ *
 * POST /api/gmail/scan   { ids: string[] }   (max 25 per call)
 *
 * Quick severity triage for the inbox list. Each message runs through the
 * same analyzeEmail pipeline as full forensics, but in offline mode: the
 * live network enrichments are skipped, so a whole month of mail can be
 * scored in seconds without exhausting third-party lookup quotas.
 *
 * Deliberately does NOT create cases. Full forensics (and case creation)
 * still happen only when the user opens a message.
 * ------------------------------------------------------------------ */

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const MAX_IDS = 25;
const SCAN_CONCURRENCY = 4;
const MAX_BODY_CHARS = 20_000;
const GMAIL_ID = /^[A-Za-z0-9_-]{1,64}$/;

type Severity = "SAFE" | "LOW" | "MEDIUM" | "HIGH" | "CRITICAL";

interface ScanResult {
  id: string;
  level?: Severity;
  score?: number;
  reason?: string | null;
  error?: string;
}

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

/** The most useful single line for a tooltip: a warning, not a pass. */
function pickReason(findings: string[] | undefined): string | null {
  const hit = (findings || []).find((f) => /^[⚠✗§]/.test(f.trim()));
  if (!hit) return null;
  return hit.length > 160 ? `${hit.slice(0, 157)}…` : hit;
}

export async function POST(req: NextRequest) {
  const session = await getServerSession(authOptions);
  if (!session?.user?.id) {
    return NextResponse.json({ error: "Please login first." }, { status: 401 });
  }

  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Request body must be JSON." }, { status: 400 });
  }

  const ids = (body as { ids?: unknown })?.ids;
  if (
    !Array.isArray(ids) ||
    ids.length === 0 ||
    ids.length > MAX_IDS ||
    !ids.every((id) => typeof id === "string" && GMAIL_ID.test(id))
  ) {
    return NextResponse.json(
      { error: `ids must be 1-${MAX_IDS} Gmail message ids.` },
      { status: 400 }
    );
  }

  const userCookieName = getGmailTokenCookieName(session.user.id);
  const encryptedToken = req.cookies.get(userCookieName)?.value;
  if (!encryptedToken) {
    return NextResponse.json({ error: "Gmail is not connected." }, { status: 401 });
  }

  try {
    let tokenData: GmailTokenPayload = parseGmailToken(encryptedToken);
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

    const results = await mapLimit(
      ids as string[],
      SCAN_CONCURRENCY,
      async (id): Promise<ScanResult> => {
        try {
          const url = new URL(
            `https://gmail.googleapis.com/gmail/v1/users/me/messages/${encodeURIComponent(id)}`
          );
          url.searchParams.set("format", "full");
          const res = await fetch(url.toString(), { headers: authHeader, cache: "no-store" });
          if (!res.ok) return { id, error: `Gmail returned ${res.status}` };

          const msg = await res.json();
          const analysis = await analyzeEmail(
            rebuildEmailFromFull(msg.payload as GmailPart, MAX_BODY_CHARS),
            { offline: true }
          );

          return {
            id,
            level: analysis.threatLevel,
            score: analysis.threatScore,
            reason: pickReason(analysis.findings),
          };
        } catch (err) {
          return { id, error: err instanceof Error ? err.message : "Scan failed" };
        }
      }
    );

    const response = NextResponse.json(
      { results, mode: "quick" },
      { headers: { "Cache-Control": "no-store" } }
    );
    response.cookies.set({
      name: userCookieName,
      value: encryptGmailToken(JSON.stringify(tokenData)),
      httpOnly: true,
      secure: process.env.NODE_ENV === "production",
      sameSite: "lax",
      path: "/",
      maxAge: 60 * 60 * 24 * 30,
    });
    return response;
  } catch (error) {
    return NextResponse.json(
      {
        error: "Gmail quick scan failed.",
        details: error instanceof Error ? error.message : String(error),
      },
      { status: 500 }
    );
  }
}
