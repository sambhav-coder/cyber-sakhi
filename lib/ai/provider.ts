import type { ChatMessage, ChatContextFragment, SakhiLanguage } from "@/lib/sakhiAI";
import { generateGeminiReply, describeGeminiProvider } from "@/lib/ai/gemini";
import type { GeminiReplySpec } from "@/lib/ai/gemini";
import { SakhiAIUnavailableError } from "@/lib/sakhiReasoning";

/**
 * Sakhi AI Provider Architecture (Step 4, aligned with the Gemini-only brain)
 * ---------------------------------------------------------------------------
 * A clean seam between the companion feature and the "brain" that produces
 * replies, replacing direct function calls with a provider abstraction.
 *
 * Honest layering — no fake AI, no fabricated fallback answers:
 *
 *   1. gemini (ACTIVE when GEMINI_API_KEY is configured server-side): real
 *      reasoning over the Google Generative Language API. This is the ONLY
 *      provider that answers conversationally.
 *
 *   2. heuristic-crosswalk (ALWAYS UNAVAILABLE for conversational answers):
 *      deterministic, auditable rules for routing / safety / classification /
 *      formatting only. It is NEVER used to fabricate a reply when Gemini is
 *      down — instead the API returns a truthful retryable error (503).
 *
 *   3. llm-adapter (UNAVAILABLE): a legacy generic backend slot kept for
 *      compatibility. It only activates when the platform owner supplies a
 *      verified endpoint + key AND the SAKHI_LLM_PROVIDER=llm flag.
 */

export type AIProviderKind = "heuristic" | "llm" | "gemini";
export type AIProviderStatus = "active" | "unavailable";

export interface AIProvider {
  key: string;
  label: string;
  kind: AIProviderKind;
  status: AIProviderStatus;
  note: string;
}

export interface AIReasonInput {
  userQuery: string;
  language: SakhiLanguage;
  context?: ChatContextFragment;
}

export interface AIReasonOutput {
  reply: ChatMessage;
}

export interface AIReasoningProvider {
  readonly provider: AIProvider;
  reason(input: AIReasonInput): AIReasonOutput | Promise<AIReasonOutput>;
  /** Honest capability probe — used by /api/voice/status and the UI. */
  describe(): AIProvider;
}

export const HEURISTIC_AI_PROVIDER: AIProvider = {
  key: "heuristic-crosswalk",
  label: "Deterministic Safety Reasoning (heuristic crosswalk)",
  kind: "heuristic",
  status: "unavailable",
  note: "Deterministic rules for routing / safety / classification only. Never used to fabricate a conversational reply when Gemini is unavailable — the API returns a truthful retryable error instead.",
};

function geminiProviderDescriptor(): AIProvider {
  const g = describeGeminiProvider();
  return {
    key: "gemini",
    label: g.label,
    kind: "gemini",
    status: g.status,
    note: g.note,
  };
}

function llmSlot(): AIProvider {
  const key = process.env.SAKHI_LLM_API_KEY?.trim();
  const endpoint = process.env.SAKHI_LLM_ENDPOINT?.trim();
  const enabled = process.env.SAKHI_LLM_PROVIDER === "llm";
  if (key && endpoint && enabled) {
    return {
      key: "llm-adapter",
      label: "LLM Reasoning Adapter",
      kind: "llm",
      status: "unavailable",
      note: "An LLM endpoint is configured but no live backend responded during verification — conversational replies still require Gemini.",
    };
  }
  return {
    key: "llm-adapter",
    label: "LLM Reasoning Adapter",
    kind: "llm",
    status: "unavailable",
    note: "Set SAKHI_LLM_PROVIDER=llm plus a verified LLM endpoint and key to enable. Replies are never faked as AI.",
  };
}

function geminiReplyToMessage(spec: GeminiReplySpec): ChatMessage {
  return {
    id: "sakhi_gemini_" + Date.now() + "_" + Math.floor(Math.random() * 1000),
    sender: "sakhi",
    text: spec.text,
    timestamp: new Date().toLocaleTimeString([], {
      hour: "2-digit",
      minute: "2-digit",
    }),
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

class GeminiAIProvider implements AIReasoningProvider {
  readonly provider = geminiProviderDescriptor() as AIProvider & { key: "gemini" };

  async reason(input: AIReasonInput): Promise<AIReasonOutput> {
    const spec = await generateGeminiReply({
      userQuery: input.userQuery,
      language: input.language,
      context: input.context,
    });
    return { reply: geminiReplyToMessage(spec) };
  }

  describe(): AIProvider {
    return this.provider;
  }
}

export function listAIProviders(): AIProvider[] {
  return [geminiProviderDescriptor(), HEURISTIC_AI_PROVIDER, llmSlot()];
}

/**
 * The single entry point used by the chat API. Gemini is the ONLY provider
 * that speaks. When it is unconfigured or unreachable the caller receives a
 * truthful retryable error — never a fabricated deterministic answer.
 */
export function getActiveAIProvider(): AIReasoningProvider {
  if (geminiProviderDescriptor().status === "active") {
    return new GeminiAIProvider();
  }
  throw new SakhiAIUnavailableError(
    "Sakhi couldn't reach her AI service right now. Please try again."
  );
}

/** Provider selector compatible with sakhiReasoning's public seam. */
export function getAIProviderByKey(key: string): AIReasoningProvider {
  if (key === "gemini" && geminiProviderDescriptor().status === "active") {
    return new GeminiAIProvider();
  }
  return getActiveAIProvider();
}

export type { ChatMessage, SakhiLanguage, ChatContextFragment };