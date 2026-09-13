import { NextRequest, NextResponse } from "next/server";
import { randomBytes } from "crypto";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/authOptions";
import { isValidUuid } from "@/lib/db/cases";
import { getSakhiConversation } from "@/lib/db/sakhiMemory";
import {
  createConversationShare,
  revokeConversationShares,
} from "@/lib/db/sakhiMemory";

const SHARE_TTL_MS = 7 * 24 * 60 * 60 * 1000;

/**
 * POST /api/chat/conversations/[id] — create a controlled, revocable share.
 *
 * A random token is stored owner-scoped; the resulting link is the ONLY way to
 * read the conversation and it expires after 7 days. Sharing intentionally
 * exposes message text only — never attachment content, case data or evidence.
 */
export async function POST(
  req: NextRequest,
  { params }: { params: { id: string } }
) {
  try {
    const session = await getServerSession(authOptions);
    if (!session?.user?.id) {
      return NextResponse.json({ error: "Unauthorized." }, { status: 401 });
    }
    const conversationId = params.id;
    if (!isValidUuid(conversationId)) {
      return NextResponse.json(
        { error: "Conversation not found or access denied." },
        { status: 403 }
      );
    }
    const convo = await getSakhiConversation(session.user.id, conversationId);
    if (!convo) {
      return NextResponse.json(
        { error: "Conversation not found or access denied." },
        { status: 403 }
      );
    }
    const token = randomBytes(24).toString("base64url");
    const expiresAt = new Date(Date.now() + SHARE_TTL_MS).toISOString();
    await createConversationShare({
      ownerId: session.user.id,
      conversationId,
      token,
      expiresAt,
    });
    const origin = new URL(req.url).origin;
    return NextResponse.json({
      shareUrl: `${origin}/share/${token}`,
      expiresAt,
    });
  } catch (error) {
    return NextResponse.json(
      {
        error:
          error instanceof Error ? error.message : "Failed to create share.",
      },
      { status: 500 }
    );
  }
}

/** DELETE /api/chat/conversations/[id] — revoke all shares for a conversation. */
export async function DELETE(
  req: NextRequest,
  { params }: { params: { id: string } }
) {
  try {
    const session = await getServerSession(authOptions);
    if (!session?.user?.id) {
      return NextResponse.json({ error: "Unauthorized." }, { status: 401 });
    }
    const conversationId = params.id;
    if (!isValidUuid(conversationId)) {
      return NextResponse.json(
        { error: "Conversation not found or access denied." },
        { status: 403 }
      );
    }
    const convo = await getSakhiConversation(session.user.id, conversationId);
    if (!convo) {
      return NextResponse.json(
        { error: "Conversation not found or access denied." },
        { status: 403 }
      );
    }
    await revokeConversationShares(session.user.id, conversationId);
    return NextResponse.json({ ok: true });
  } catch (error) {
    return NextResponse.json(
      {
        error:
          error instanceof Error ? error.message : "Failed to revoke share.",
      },
      { status: 500 }
    );
  }
}