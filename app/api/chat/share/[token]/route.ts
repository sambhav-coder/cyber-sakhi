import { NextResponse } from "next/server";
import { resolveConversationShare } from "@/lib/db/sakhiMemory";
import { listSakhiMessages } from "@/lib/db/sakhiMemory";
import { getSakhiConversation } from "@/lib/db/sakhiMemory";

/**
 * GET /api/chat/share/[token] — read a controlled conversation share.
 *
 * Authenticated by the bearer token (a cryptographically random, expiring
 * secret). Emits message text only — never attachment content, case data or
 * evidence. Expired or revoked tokens are rejected.
 */
export async function GET(
  _req: Request,
  { params }: { params: { token: string } }
) {
  try {
    const token = params.token;
    const info = await resolveConversationShare(token);
    if (!info) {
      return NextResponse.json(
        { error: "This share does not exist or has been revoked." },
        { status: 404 }
      );
    }
    if (new Date(info.expiresAt).getTime() < Date.now()) {
      return NextResponse.json(
        { error: "This share has expired." },
        { status: 410 }
      );
    }

    const convo = await getSakhiConversation(info.ownerId, info.conversationId);
    if (!convo) {
      return NextResponse.json(
        { error: "This share does not exist or has been revoked." },
        { status: 404 }
      );
    }
    const messages = await listSakhiMessages(info.ownerId, info.conversationId);

    return NextResponse.json({
      title: convo.title,
      createdAt: convo.created_at,
      expiresAt: info.expiresAt,
      messages: messages.map((m) => ({
        role: m.role,
        text: m.content,
        createdAt: m.created_at,
      })),
    });
  } catch {
    return NextResponse.json(
      { error: "This share could not be loaded." },
      { status: 500 }
    );
  }
}