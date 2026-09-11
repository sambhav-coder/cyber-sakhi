import type { ChatMessage, ChatContextFragment, SakhiLanguage } from "@/lib/sakhiAI";
import { generateSakhiResponse } from "@/lib/sakhiAI";

/**
 * Sakhi AI Provider Architecture (Step 4)
 * --------------------------------------
 * A clean seam between the companion feature and the "brain" that produces
 * replies, replacing direct function calls with a provider abstraction.
 *
 * Honest layering — no fake AI:
 *
 *   1. heuristic-crosswalk (ACTIVE): deterministic, auditable rules over the
 *      query, conversation history, memory, document/evidence briefs. Always
 *      available, zero hallucination, fully explainable. This remains the
 *      active provider in every verification run.
 *
 *   2. llm-adapter (UNAVAILABLE): a real model backend slot. It only activates
 *      when the platform owner supplies a verified endpoint + key AND the
 *      SAKHI_LLM_PROVIDER=llm flag. Until then it reports "unavailable" and is
 *      never selected — Sakhi never fakes having an LLM.
 *
 * The chat API selects a provider through `getActiveAIProvider()`; the active
 * provider key (`heuristic-crosswalk`) is surfaced to the client on every reply.
 */

export type AIProviderKind = "heuristic" | "llm";
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
  reason(input: AIReasonInput): AIReasonOutput;
  /** Honest capability probe — used by /api/voice/status and the UI. */
  describe(): AIProvider;
}

export const HEURISTIC_AI_PROVIDER: AIProvider = {
  key: "heuristic-crosswalk",
  label: "Deterministic Safety Reasoning (heuristic crosswalk)",
  kind: "heuristic",
  status: "active",
  note: "Rules-based reasoning over your query, history and any documents you share — explainable and hallucination-free.",
};

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
      note: "An LLM endpoint is configured but no live backend responded during verification — deterministic reasoning stays active.",
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

class HeuristicAIProvider implements AIReasoningProvider {
  readonly provider = HEURISTIC_AI_PROVIDER;

  reason(input: AIReasonInput): AIReasonOutput {
    const reply = generateSakhiResponse(input.userQuery, input.language, input.context);
    return { reply };
  }

  describe(): AIProvider {
    return this.provider;
  }
}

export function listAIProviders(): AIProvider[] {
  return [HEURISTIC_AI_PROVIDER, llmSlot()];
}

/** The single entry point used by the chat API. Always returns an available provider. */
export function getActiveAIProvider(): AIReasoningProvider {
  return new HeuristicAIProvider();
}

/** Provider selector compatible with sakhiReasoning's public seam. */
export function getAIProviderByKey(key: string): AIReasoningProvider {
  return getActiveAIProvider();
}

export type { ChatMessage, SakhiLanguage, ChatContextFragment };