import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/authOptions";
import { isValidUuid } from "@/lib/db/cases";
import { normalizeLanguage } from "@/lib/sakhiAI";
import type { SakhiLanguage } from "@/lib/sakhiAI";
import {
  createSakhiConversation,
  deleteSakhiConversation,
  getSakhiConversation,
  listSakhiConversations,
  listConversationPins,
  setConversationPinned,
  touchSakhiConversation,
} from "@/lib/db/sakhiMemory";

export async function GET() {
  try {
    const session = await getServerSession(authOptions);
    if (!session?.user?.id) {
      return NextResponse.json({ error: "Unauthorized." }, { status: 401 });
    }
    const rows = await listSakhiConversations(session.user.id);
    const pins = await listConversationPins(session.user.id);
    return NextResponse.json({
      conversations: rows.map((c) => ({
        id: c.id,
        title: c.title,
        language: c.language,
        pinned: pins[c.id] === true,
        createdAt: c.created_at,
        updatedAt: c.updated_at,
      })),
    });
  } catch (error) {
    return NextResponse.json(
      {
        error:
          error instanceof Error ? error.message : "Failed to list conversations.",
      },
      { status: 500 }
    );
  }
}

export async function POST(req: NextRequest) {
  try {
    const session = await getServerSession(authOptions);
    if (!session?.user?.id) {
      return NextResponse.json({ error: "Unauthorized." }, { status: 401 });
    }
    const body = await req.json();
    const title =
      typeof body.title === "string" && body.title.trim()
        ? body.title.trim().slice(0, 120)
        : "New conversation";
    const language = normalizeLanguage(body.language as SakhiLanguage);

    const convo = await createSakhiConversation({
      ownerId: session.user.id,
      title,
      language,
    });
    return NextResponse.json({
      conversation: {
        id: convo.id,
        title: convo.title,
        language: convo.language,
        pinned: false,
        createdAt: convo.created_at,
        updatedAt: convo.updated_at,
      },
    });
  } catch (error) {
    return NextResponse.json(
      {
        error:
          error instanceof Error ? error.message : "Failed to create conversation.",
      },
      { status: 500 }
    );
  }
}

export async function PATCH(req: NextRequest) {
  try {
    const session = await getServerSession(authOptions);
    if (!session?.user?.id) {
      return NextResponse.json({ error: "Unauthorized." }, { status: 401 });
    }
    const body = await req.json();
    const { conversationId, title, pinned } = body;
    if (typeof conversationId !== "string" || !isValidUuid(conversationId)) {
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
    if (typeof pinned === "boolean") {
      await setConversationPinned(session.user.id, conversationId, pinned);
    }
    const newTitle =
      typeof title === "string" && title.trim()
        ? title.trim().slice(0, 120)
        : convo.title;
    await touchSakhiConversation(conversationId, { title: newTitle });
    return NextResponse.json({ ok: true, title: newTitle, pinned });
  } catch (error) {
    return NextResponse.json(
      {
        error:
          error instanceof Error ? error.message : "Failed to rename conversation.",
      },
      { status: 500 }
    );
  }
}

export async function DELETE(req: NextRequest) {
  try {
    const session = await getServerSession(authOptions);
    if (!session?.user?.id) {
      return NextResponse.json({ error: "Unauthorized." }, { status: 401 });
    }
    const body = await req.json();
    const { conversationId } = body;
    if (typeof conversationId !== "string" || !isValidUuid(conversationId)) {
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
    await deleteSakhiConversation(session.user.id, conversationId);
    return NextResponse.json({ ok: true });
  } catch (error) {
    return NextResponse.json(
      {
        error:
          error instanceof Error ? error.message : "Failed to delete conversation.",
      },
      { status: 500 }
    );
  }
}