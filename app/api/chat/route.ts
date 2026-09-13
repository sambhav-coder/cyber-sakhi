import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/authOptions";
import { reasonGeneral, reasonForCase, SakhiAIUnavailableError } from "@/lib/sakhiReasoning";
import { sanitizeImages, base64ByteLength, MAX_IMAGES_PER_REPLY, MAX_IMAGE_BYTES, MAX_TOTAL_IMAGE_BYTES } from "@/lib/ai/gemini";
import type { GeminiImageInput } from "@/lib/ai/gemini";
import { normalizeLanguage, detectLanguage, explicitLanguageRequest } from "@/lib/sakhiAI";
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
  caseId?: string;
  title?: string;
  mimeType?: string;
  dataBase64?: string;
}

const MAX_ATTACHMENTS = 3;
const MAX_DOC_CONTEXT_CHARS = 6000;
const MAX_IMAGE_PREVIEW_BYTES = 512;

const ALLOWED_IMAGE_MIME = new Set(["image/jpeg", "image/png", "image/webp", "image/gif"]);

/**
 * Verify an image attachment the client intends for Gemini. Returns the
 * validated input, or throws a truthful Error the caller returns verbatim.
 * Image bytes are sent to Gemini only — never stored by the server.
 */
function pickValidGeminiImages(
  attachments: ChatAttachmentInput[]
): { invalidError: string | null; images: GeminiImageInput[] } {
  const imageAttachments = attachments.filter((a) => a.kind === "image");
  if (imageAttachments.length === 0) {
    return { invalidError: null, images: [] };
  }
  if (imageAttachments.length > MAX_IMAGES_PER_REPLY) {
    return {
      invalidError: `You can attach up to ${MAX_IMAGES_PER_REPLY} images per message.`,
      images: [],
    };
  }
  const potential: GeminiImageInput[] = [];
  for (const a of imageAttachments) {
    const mime = String(a.mimeType || "").toLowerCase();
    if (!ALLOWED_IMAGE_MIME.has(mime)) {
      return {
        invalidError: `${a.name || "This file"} is not a supported image (JPEG/PNG/WebP/GIF). Please remove it or use a supported format.`,
        images: [],
      };
    }
    const data = String(a.dataBase64 || "");
    if (!data) {
      return { invalidError: `${a.name || "This image"} could not be read. Try attaching it again.`, images: [] };
    }
    const approxBytes = base64ByteLength(data);
    if (approxBytes <= 0 || approxBytes > MAX_IMAGE_BYTES) {
      return {
        invalidError: `${a.name || "This image"} is empty or over ${Math.round(MAX_IMAGE_BYTES / 1024 / 1024)}MB. Compress it and try again.`,
        images: [],
      };
    }
    potential.push({ name: a.name || "image", mimeType: mime, dataBase64: data });
  }
  const total = potential.reduce((sum, p) => sum + base64ByteLength(p.dataBase64), 0);
  if (total > MAX_TOTAL_IMAGE_BYTES) {
    return {
      invalidError: `Attached images are too large together. Attach up to ${Math.round(MAX_TOTAL_IMAGE_BYTES / 1024 / 1024)}MB total.`,
      images: [],
    };
  }
  return { invalidError: null, images: sanitizeImages(potential) };
}

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
    if (error instanceof SakhiAIUnavailableError) {
      return NextResponse.json(
        { error: error.message, retryable: error.retryable === true },
        { status: 503 }
      );
    }
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

    // Validate any image attachments BEFORE the AI call — image bytes go to
    // Gemini inline (never persisted, never filename-only).
    const { invalidError, images } = pickValidGeminiImages(attachments);
    if (invalidError) {
      return NextResponse.json({ error: invalidError }, { status: 400 });
    }

    // Automatic language matching: the brain infers the user's language from
    // THIS message (never locked to earlier turns); an explicit "in Hindi"
    // request overrides detection. A client-picked preference is only a hint.
    const lang = explicitLanguageRequest(message) || detectLanguage(message);
    void normalizeLanguage(language as SakhiLanguage);

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
          const result = await reasonGeneral({ userQuery: message, language: lang });
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
      const reportBriefs: string[] = [];
      let unverifiedEvidence = 0;
      let unverifiedReports = 0;

      for (const a of attachments) {
        if (a.kind === "evidence" && a.evidenceCode) {
          const row = await getEvidenceByCode(a.evidenceCode, session.user.id);
          if (row) {
            const brief = evidenceToBrief(row);
            evidenceBriefs.push(evidenceBriefText(brief));
          } else {
            unverifiedEvidence += 1;
          }
        } else if (a.kind === "report" && a.caseId) {
          if (isValidUuid(a.caseId)) {
            const own = await getCaseForUser(a.caseId, session.user.id);
            if (own) {
              const invs = await getCaseInvestigationsForUser(a.caseId, session.user.id);
              const first = (invs[0]?.analysis || {}) as {
                threatScore?: number;
                threatLevel?: string;
                findings?: string[];
              };
              const findings = Array.isArray(first.findings)
                ? first.findings.slice(0, 6)
                : [];
              const summary = [
                `📋 Report for case ${own.case_number || own.id}:`,
                `threat ${String(first.threatLevel || own.severity || "unknown")} (score ${first.threatScore ?? 0}/100).`,
                findings.length > 0
                  ? `Findings: ${findings.join(" | ")}`
                  : "No explicit forensic findings were recorded.",
              ].join(" ");
              reportBriefs.push(summary.slice(0, MAX_DOC_CONTEXT_CHARS));
            } else {
              unverifiedReports += 1;
            }
          } else {
            unverifiedReports += 1;
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

      // For images we do NOT write a filename-only summary — the actual
      // pixels go to Gemini inline, so no text placeholder is fabricated.

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
        memoryRows = (await listSakhiMemory(session.user.id))
          // Stored language preferences are surfaced nowhere to the model —
          // language is decided per-message by detection/override, so a past
          // "prefer Hindi" row can never force a following English turn.
          .filter((m) => !/^sakhi\.language/i.test(m.key))
          .map((m) => ({
            key: m.key,
            value: m.value,
          }));
      } catch {
        memoryRows = [];
      }

      const result = await reasonGeneral({
        userQuery: message,
        language: lang,
        images,
        context: {
          history,
          attachmentSummaries,
          evidenceBriefs,
          reportBriefs,
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
            items: attachments.map((a) =>
              a.kind === "image"
                ? {
                    kind: "image",
                    name: a.name || null,
                    mimeType: a.mimeType || null,
                    // NOTE: dataBase64 is deliberately NOT persisted — image
                    // bytes only ever travel client -> API -> Gemini.
                    preview: null,
                  }
                : {
                    kind: a.kind || "document",
                    name: a.name || null,
                    evidenceCode: a.evidenceCode || null,
                    caseId: a.caseId || null,
                    preview:
                      typeof a.content === "string" && a.kind === "document"
                        ? a.content.slice(0, MAX_IMAGE_PREVIEW_BYTES)
                        : null,
                  }
            ),
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
          imageCount: images.length,
          evidenceCount: evidenceBriefs.length,
          reportCount: reportBriefs.length,
          unverifiedEvidence,
          unverifiedReports,
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

    const result = await reasonForCase(caseIdValue, message, lang, context, images);

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
    if (error instanceof SakhiAIUnavailableError) {
      return NextResponse.json(
        { error: error.message, retryable: error.retryable === true },
        { status: 503 }
      );
    }
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