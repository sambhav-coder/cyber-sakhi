import type { ChatMessage, ChatContextFragment, SakhiLanguage } from "./sakhiAI";
import { generateGeminiReply } from "./ai/gemini";
import type { GeminiImageInput, GeminiReplySpec } from "./ai/gemini";
import { describeGeminiProvider } from "./ai/gemini";

/**
 * Sakhi Reasoning Provider Architecture (Master Correction)
 *
 * ONE real brain: Chat and Voice both resolve through this seam, and the only
 * conversational answers it produces come from Gemini.
 *
 * If Gemini is not configured or a call fails, this layer NEVER substitutes a
 * canned/heuristic answer. It throws `SakhiAIUnavailableError`, which the chat
 * API converts into a truthful "AI service unavailable" message with Retry.
 *
 * Deterministic logic is still used only for routing, safety controls,
 * authorization, validation, classification and formatting — never to fabricate
 * a conversational reply.
 */
export type SakhiReasoningKind = "heuristic-crosswalk" | "llm-adapter" | "gemini";

export interface SakhiReasoningProvider {
  key: string;
  label: string;
  kind: SakhiReasoningKind;
  status: "active" | "unavailable";
  note: string;
}

export const DETERMINISTIC_REASONING_PROVIDER: SakhiReasoningProvider = {
  key: "heuristic-crosswalk",
  label: "Deterministic Safety Reasoning (heuristic crosswalk)",
  kind: "heuristic-crosswalk",
  status: "unavailable",
  note:
    "Rule-based routing/classification only. It is never used to fabricate conversational answers.",
};

function geminiProvider(): SakhiReasoningProvider {
  const g = describeGeminiProvider();
  return {
    key: g.key,
    label: g.label,
    kind: "gemini",
    status: g.status,
    note: g.note,
  };
}

function llmProvider(): SakhiReasoningProvider {
  const key = process.env.SAKHI_LLM_API_KEY?.trim();
  const endpoint = process.env.SAKHI_LLM_ENDPOINT?.trim();
  if (key && endpoint && process.env.SAKHI_REASONING_PROVIDER === "llm") {
    return {
      key: "llm-adapter",
      label: "LLM Reasoning Adapter",
      kind: "llm-adapter",
      status: "unavailable",
      note:
        "An LLM adapter is configured but deprecated. Sakhi uses Gemini for conversational answers.",
    };
  }
  return {
    key: "llm-adapter",
    label: "LLM Reasoning Adapter",
    kind: "llm-adapter",
    status: "unavailable",
    note: "Deprecated legacy adapter — not used.",
  };
}

/** The provider reported for the NEXT reply. Only Gemini can answer conversationally. */
export function getSakhiReasoningProvider(): SakhiReasoningProvider {
  return geminiProvider();
}

export function listSakhiReasoningProviders(): SakhiReasoningProvider[] {
  return [geminiProvider(), DETERMINISTIC_REASONING_PROVIDER, llmProvider()];
}

export class SakhiAIUnavailableError extends Error {
  retryable: boolean;
  constructor(message: string, retryable = true) {
    super(message);
    this.name = "SakhiAIUnavailableError";
    this.retryable = retryable;
  }
}

export interface ReasoningResult {
  reply: ChatMessage;
  providerKey: string;
  providerLabel: string;
}

function nowLabel(): string {
  return new Date().toLocaleTimeString([], {
    hour: "2-digit",
    minute: "2-digit",
  });
}

function toChatMessage(spec: GeminiReplySpec): ChatMessage {
  return {
    id: "sakhi_gemini_" + Date.now() + "_" + Math.floor(Math.random() * 1000),
    sender: "sakhi",
    text: spec.text,
    timestamp: nowLabel(),
    category:
      spec.category === "emergency" ||
      spec.category === "legal" ||
      spec.category === "evidence" ||
      spec.category === "emotional" ||
      spec.category === "scam" ||
      spec.category === "education"
        ? spec.category
        : "general",
    quickActions:
      spec.quickActions && spec.quickActions.length > 0
        ? spec.quickActions
        : undefined,
  };
}

async function geminiOrThrow(input: {
  userQuery: string;
  language: SakhiLanguage;
  context?: ChatContextFragment;
  caseContext?: Record<string, unknown>;
  images?: GeminiImageInput[];
}): Promise<ReasoningResult> {
  const provider = geminiProvider();
  if (provider.status !== "active") {
    throw new SakhiAIUnavailableError(
      "Sakhi couldn't reach her AI service right now. Please try again.",
      true
    );
  }
  try {
    const spec = await generateGeminiReply({
      userQuery: input.userQuery,
      language: input.language,
      context: input.context,
      caseContext: input.caseContext,
      images: input.images,
    });
    return {
      reply: toChatMessage(spec),
      providerKey: provider.key,
      providerLabel: provider.label,
    };
  } catch (error) {
    console.warn("[sakhiReasoning] Gemini call failed:", error instanceof Error ? error.message : String(error));
    throw new SakhiAIUnavailableError(
      "Sakhi couldn't reach her AI service right now. Please try again.",
      true
    );
  }
}

export async function reasonGeneral(input: {
  userQuery: string;
  language: SakhiLanguage;
  context?: ChatContextFragment;
  images?: GeminiImageInput[];
}): Promise<ReasoningResult> {
  return geminiOrThrow(input);
}

export async function reasonForCase(
  caseId: string,
  userQuery: string,
  language: SakhiLanguage,
  context: Record<string, unknown>,
  images?: GeminiImageInput[]
): Promise<ReasoningResult> {
  return geminiOrThrow({ userQuery, language, caseContext: context, images });
}