import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/authOptions";
import { reasonGeneral, reasonForCase } from "@/lib/sakhiReasoning";
import { normalizeLanguage, detectLanguage } from "@/lib/sakhiAI";
import type { ChatContextFragment, SakhiLanguage } from "@/lib/sakhiAI";
import {
  getCaseForUser,
  getCaseForUserByCaseNumber,
  getCaseIndicators,
  getCaseInvestigationsForUser,
  getCaseChat,
  isValidUuid,
} from "@/lib/db/cases";
import { appendCaseChatMessage } from "@/lib/db/caseChat";
import {
  appendSakhiMessage,
  createSakhiConversation,
  getSakhiConversation,
  listSakhiMemory,
  listSakhiMessages,
  saveSakhiMemory,
} from "@/lib/db/sakhiMemory";
import { getEvidenceByCode } from "@/lib/db/evidence";
import { evidenceBriefText, evidenceToBrief } from "@/lib/evidenceBrief";

interface ChatAttachmentInput {
  kind?: string;
  name?: string;
  content?: string;
  note?: string;
  evidenceCode?: string;
  title?: string;
}

const MAX_ATTACHMENTS = 3;
const MAX_DOC_CONTEXT_CHARS = 6000;

function messageToChatShape(row: {
  role: string;
  content: string;
  created_at: string;
  id: string;
}) {
  return {
    id: row.id,
    sender: row.role === "sakhi" ? "sakhi" : "user",
    text: row.content,
    timestamp: new Date(row.created_at).toLocaleTimeString([], {
      hour: "2-digit",
      minute: "2-digit",
    }),
    createdAt: row.created_at,
  };
}

export async function GET(req: NextRequest) {
  try {
    const session = await getServerSession(authOptions);
    if (!session?.user?.id) {
      return NextResponse.json({ error: "Unauthorized." }, { status: 401 });
    }

    const params = new URL(req.url).searchParams;
    const caseId = params.get("caseId");
    const conversationId = params.get("conversationId");

    if (caseId) {
      if (!isValidUuid(caseId)) {
        return NextResponse.json(
          { error: "Case not found or access denied." },
          { status: 403 }
        );
      }

      const caseRow = await getCaseForUser(caseId, session.user.id);
      if (!caseRow) {
        return NextResponse.json(
          { error: "Case not found or access denied." },
          { status: 403 }
        );
      }

      const history = await getCaseChat(caseId, session.user.id);
      const messages = history.map((m) =>
        messageToChatShape({
          id: m.id,
          role: m.role,
          content: m.content,
          created_at: m.created_at,
        })
      );

      return NextResponse.json({ messages });
    }

    if (conversationId) {
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
      const history = await listSakhiMessages(session.user.id, conversationId);
      const messages = history.map((m) =>
        messageToChatShape({
          id: m.id,
          role: m.role,
          content: m.content,
          created_at: m.created_at,
        })
      );
      return NextResponse.json({ messages, conversation: {
        id: convo.id,
        title: convo.title,
        language: convo.language,
        createdAt: convo.created_at,
        updatedAt: convo.updated_at,
      } });
    }

    return NextResponse.json(
      { error: "Case not found or access denied." },
      { status: 403 }
    );
  } catch (error) {
    return NextResponse.json(
      {
        error:
          error instanceof Error
            ? error.message
            : "Sakhi companion service error.",
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
    const { message, language, caseId } = body;
    const attachmentsRaw = Array.isArray(body.attachments) ? body.attachments : [];
    const attachments: ChatAttachmentInput[] = attachmentsRaw
      .slice(0, MAX_ATTACHMENTS)
      .filter((a: ChatAttachmentInput) => a && typeof a === "object");

    if (!message || typeof message !== "string") {
      return NextResponse.json(
        { error: "Message field is required." },
        { status: 400 }
      );
    }

    const lang = normalizeLanguage(language as SakhiLanguage);

    let caseIdValue = typeof caseId === "string" ? caseId : "";
    let resolvedFromCaseNumber = false;

    // Stage C2: allow "my case number is CS-2026-XXXXXX" without a caseId.
    if (!caseIdValue) {
      const caseNumberMatch = message.match(/\bCS-\d{4}-[A-Z2-9]{6}\b/i);
      if (caseNumberMatch) {
        const owned = await getCaseForUserByCaseNumber(
          caseNumberMatch[0],
          session.user.id
        );
        if (owned) {
          caseIdValue = owned.id;
          resolvedFromCaseNumber = true;
        } else {
          // Ownership-scoped: never reveal whether the number exists for
          // another account. Reply with generic guidance + a note only.
          const result = reasonGeneral({ userQuery: message, language: lang });
          return NextResponse.json({
            ...result.reply,
            provider: {
              key: result.providerKey,
              label: result.providerLabel,
            },
            context: {
              caseId: null,
              caseNumber: caseNumberMatch[0].toUpperCase(),
              resolvedFromCaseNumber,
              memoryPersisted: false,
              note: "I could not find that case under your account — if it was analysed in a different account, log in there.",
            },
          });
        }
      }
    }

    // ---- General companion path (no case) ---------------------------------
    if (!caseIdValue) {
      const conversationIdValue =
        typeof body.conversationId === "string" &&
        isValidUuid(body.conversationId)
          ? body.conversationId
          : "";

      let convo =
        conversationIdValue !== ""
          ? await getSakhiConversation(session.user.id, conversationIdValue)
          : null;
      if (conversationIdValue !== "" && !convo) {
        return NextResponse.json(
          { error: "Conversation not found or access denied." },
          { status: 403 }
        );
      }

      // Resolve document + evidence attachments into honest context fragments.
      const attachmentSummaries: string[] = [];
      const evidenceBriefs: string[] = [];
      let unverifiedEvidence = 0;

      for (const a of attachments) {
        if (a.kind === "evidence" && a.evidenceCode) {
          const row = await getEvidenceByCode(a.evidenceCode, session.user.id);
          if (row) {
            const brief = evidenceToBrief(row);
            evidenceBriefs.push(evidenceBriefText(brief));
          } else {
            unverifiedEvidence += 1;
          }
        } else if (a.kind === "document") {
          const name = a.name || "document";
          if (a.content && a.content.trim()) {
            const snippet = a.content.trim().slice(0, MAX_DOC_CONTEXT_CHARS);
            attachmentSummaries.push(
              `📄 ${name} — ${snippet.length} characters extracted: "${snippet.slice(0, 240)}${snippet.length > 240 ? "…" : ""}"`
            );
          } else {
            attachmentSummaries.push(
              `📄 ${name} — ${a.note || "no text was extracted"}.`
            );
          }
        }
      }

      // Build conversation context: history, memory (non-sensitive), attachments.
      let history: ChatContextFragment["history"] = [];
      if (convo) {
        const rows = await listSakhiMessages(session.user.id, convo.id);
        history = rows.slice(-12).map((m) => ({
          sender: m.role === "sakhi" ? "sakhi" : "user",
          text: m.content,
        }));
      }

      let memoryRows: { key: string; value: string }[] = [];
      try {
        memoryRows = (await listSakhiMemory(session.user.id)).map((m) => ({
          key: m.key,
          value: m.value,
        }));
      } catch {
        memoryRows = [];
      }

      const result = reasonGeneral({
        userQuery: message,
        language: lang,
        context: {
          history,
          attachmentSummaries,
          evidenceBriefs,
          memory: memoryRows,
        },
      });

      let memoryPersisted = false;
      let finalConversationId = conversationIdValue || null;
      try {
        if (!convo) {
          convo = await createSakhiConversation({
            ownerId: session.user.id,
            language: lang,
            title: message.slice(0, 80),
          });
          finalConversationId = convo.id;
        }
        await appendSakhiMessage({
          ownerId: session.user.id,
          conversationId: finalConversationId!,
          role: "user",
          content: message,
          titleIfFirst: message,
          attachmentMeta: {
            count: attachments.length,
            items: attachments.map((a) => ({
              kind: a.kind || "document",
              name: a.name || null,
              evidenceCode: a.evidenceCode || null,
              preview:
                typeof a.content === "string" && a.kind === "document"
                  ? a.content.slice(0, 160)
                  : null,
            })),
          },
        });
        await appendSakhiMessage({
          ownerId: session.user.id,
          conversationId: finalConversationId!,
          role: "sakhi",
          content: result.reply.text,
        });
        if (lang !== "en") {
          await saveSakhiMemory({
            ownerId: session.user.id,
            key: "sakhi.language",
            value: lang,
            kind: "preference",
            sensitive: false,
          });
        }
        memoryPersisted = true;
      } catch {
        memoryPersisted = false;
      }

      return NextResponse.json({
        ...result.reply,
        detectedLanguage: detectLanguage(message),
        provider: {
          key: result.providerKey,
          label: result.providerLabel,
        },
        context: {
          conversationId: finalConversationId,
          caseId: null,
          resolvedFromCaseNumber,
          memoryPersisted,
          attachmentCount: attachments.length,
          evidenceCount: evidenceBriefs.length,
          unverifiedEvidence,
        },
      });
    }
    // -----------------------------------------------------------------------

    if (!isValidUuid(caseIdValue)) {
      return NextResponse.json(
        { error: "Case not found or access denied." },
        { status: 403 }
      );
    }

    const caseRow = await getCaseForUser(caseIdValue, session.user.id);
    if (!caseRow) {
      return NextResponse.json(
        { error: "Case not found or access denied." },
        { status: 403 }
      );
    }

    const investigations = await getCaseInvestigationsForUser(
      caseIdValue,
      session.user.id
    );
    const indicators = await getCaseIndicators(
      caseIdValue,
      session.user.id,
      investigations.map((inv) => inv.id)
    );

    const latestAnalysis = (investigations[0]?.analysis || {}) as {
      threatScore?: number;
      threatLevel?: string;
      senderSpoofingDetected?: boolean;
      senderDomain?: string;
      findings?: string[];
      structuredFindings?: Array<{
        category?: string;
        severity?: string;
        description?: string;
      }>;
      verdict?: {
        level?: string;
        summary?: string;
        contributingSignals?: string[];
      };
    };

    const context = {
      caseNumber: caseRow.case_number || caseRow.id,
      threatLevel: String(latestAnalysis.threatLevel || caseRow.severity || "unknown"),
      threatScore: latestAnalysis.threatScore ?? 0,
      spoofingDetected: latestAnalysis.senderSpoofingDetected === true,
      senderDomain: latestAnalysis.senderDomain,
      findings: [
        ...(latestAnalysis.findings || []),
        ...(latestAnalysis.verdict?.summary ? [latestAnalysis.verdict.summary] : []),
      ],
      indicatorCount: indicators.length,
      suspiciousUrlCount: indicators.filter(
        (i) => i.type === "url" && i.malicious === true
      ).length,
      financialHarm:
        /(transfer(red)?\s*(money|funds|₹|rs)|paid|money moved|upi|bank transfer|bought\s.*gift|paid.* ₹)/i.test(
          message
        ) || undefined,
      sharedCredential:
        /otp.?shared|gave\s+(otp|password|pin|credential)|typed\s+password|entered\s+(otp|password)|shared\s+(otp|password|pin)/i.test(
          message
        ) || undefined,
      interactedWithLink:
        /clicked|opened the link|entered\s+(details|info|card)|downloaded\s+(attachment|file)/i.test(
          message
        ) || undefined,
      escalated: caseRow.status === "escalated" || undefined,
    };

    const result = reasonForCase(caseIdValue, message, lang === "hi" ? "hi" : "en", context);

    let memoryPersisted = false;
    try {
      await appendCaseChatMessage({
        caseId: caseIdValue,
        userId: session.user.id,
        role: "user",
        content: message,
      });
      await appendCaseChatMessage({
        caseId: caseIdValue,
        userId: session.user.id,
        role: "sakhi",
        content: result.reply.text,
      });
      memoryPersisted = true;
    } catch {
      memoryPersisted = false;
    }

    return NextResponse.json({
      ...result.reply,
      provider: {
        key: result.providerKey,
        label: result.providerLabel,
      },
      context: {
        caseId: caseIdValue,
        caseNumber: context.caseNumber,
        resolvedFromCaseNumber,
        memoryPersisted,
      },
    });
  } catch (error) {
    return NextResponse.json(
      {
        error:
          error instanceof Error
            ? error.message
            : "Sakhi companion service error.",
      },
      { status: 500 }
    );
  }
}