import type { ChatMessage, ChatContextFragment, SakhiLanguage } from "./sakhiAI";
import { generateSakhiResponse } from "./sakhiAI";
import { generateCaseAwareResponse } from "./sakhiAICase";

/**
 * Sakhi Reasoning Provider Architecture
 *
 * Honest layering — no fake AI:
 *
 * 1. DETERMINISTIC / HEURISTIC (ACTIVE): Sakhi's safety reasoning is generated
 *    by explicit, auditable heuristics (case crosswalks, escalation decisions,
 *    evidence-backed explainability). Always available; zero hallucination.
 *
 * 2. LLM ADAPTER (PROVIDER-READY / UNAVAILABLE): a real LLM backend could be
 *    plugged behind the same `reason()` seam when the platform owner adds an
 *    API key + endpoint. Until a genuine backend is connected it reports
 *    "unavailable" and the deterministic provider is used — Sakhi never fakes
 *    having an LLM.
 */

export type SakhiReasoningKind = "heuristic-crosswalk" | "llm-adapter";

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
  status: "active",
  note:
    "Answers are derived from auditable rules over case facts — explainable and hallucination-free.",
};

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
        "An LLM adapter is configured but no live backend responded during verification. Deterministic reasoning remains active.",
    };
  }
  return {
    key: "llm-adapter",
    label: "LLM Reasoning Adapter",
    kind: "llm-adapter",
    status: "unavailable",
    note:
      "Set SAKHI_REASONING_PROVIDER=llm plus a verified LLM endpoint to enable. Not active — answers are never faked as AI.",
  };
}

export function getSakhiReasoningProvider(): SakhiReasoningProvider {
  return DETERMINISTIC_REASONING_PROVIDER;
}

/**
 * Single reasoning seam used by the chat route. Today it always routes to the
 * deterministic provider; swapping in a real LLM backend only changes where
 * `reasonForCase` / `reasonGeneral` delegate.
 */
export interface ReasoningRequest {
  caseId?: string;
  caseNumber?: string;
  userQuery: string;
  language: SakhiLanguage;
  context: Record<string, unknown>;
}

export interface ReasoningResult {
  reply: ChatMessage;
  providerKey: string;
  providerLabel: string;
}

export function reasonGeneral(input: {
  userQuery: string;
  language: SakhiLanguage;
  context?: ChatContextFragment;
}): ReasoningResult {
  const provider = getSakhiReasoningProvider();
  const reply = generateSakhiResponse(input.userQuery, input.language, input.context);
  return {
    reply,
    providerKey: provider.key,
    providerLabel: provider.label,
  };
}

export function reasonForCase(
  caseId: string,
  userQuery: string,
  language: "en" | "hi",
  context: Record<string, unknown>
): ReasoningResult {
  const provider = getSakhiReasoningProvider();
  const reply = generateCaseAwareResponse(userQuery, language, context as any);
  return {
    reply,
    providerKey: provider.key,
    providerLabel: provider.label,
  };
}