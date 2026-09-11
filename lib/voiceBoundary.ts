/**
 * SAKHI AI BOUNDARIES (Stage K)
 * -----------------------------
 * Explicit capability and safety boundaries for the Sakhi companion.
 *
 * 1. LEARNER SAFETY — Sakhi never fabricates forensics, phone numbers,
 *    legal statuses, or named organizations. When a capability is not
 *    integrated, it answers UNAVAILABLE rather than inventing an answer.
 * 2. VOICE BOUNDARIES — any voice interaction MUST confirm text consent and
 *    never runs passive background recording. The current product has a
 *    demonstration keyboard interface only; there is no live ASR/TTS.
 * 3. ACTION BOUNDARIES — Sakhi never files complaints, never marks a case
 *    escalated, and never claims confirmed damage on its own.
 */

export type SakhiCapability =
  | "text_chat"
  | "case_chat_with_memory"
  | "general_chat_with_memory"
  | "forensic_scoring_explainable"
  | "escalation_guidance"
  | "evidence_sealing_sha256"
  | "chain_of_custody_review"
  | "voice_mode_browser"
  | "document_pipeline"
  | "locker_attach_to_chat"
  | "voice_shield_demo"
  | "auto_sos"
  | "auto_complaint_filing";

export interface CapabilityStatus {
  available: boolean;
  description: string;
  /** When false, the UI must show this reason instead of a fake control. */
  unavailableReason?: string;
}

export const CAPABILITIES: Record<SakhiCapability, CapabilityStatus> = {
  text_chat: {
    available: true,
    description: "Multi-language text companion (English/Hindi/Hinglish).",
  },
  case_chat_with_memory: {
    available: true,
    description: "Case-scoped conversation memory persisted privately.",
  },
  general_chat_with_memory: {
    available: true,
    description: "General conversations with owner-scoped transcript + lightweight memory.",
  },
  forensic_scoring_explainable: {
    available: true,
    description: "Deterministic threat scoring with a visible rationale.",
  },
  escalation_guidance: {
    available: true,
    description: "Guidance on whether/when to report; Sakhi never files for you.",
  },
  evidence_sealing_sha256: {
    available: true,
    description: "Every locker file is sealed with a SHA-256 integrity hash.",
  },
  chain_of_custody_review: {
    available: true,
    description: "Review who accessed an evidence item and when.",
  },
  voice_mode_browser: {
    available: true,
    description: "On-device browser speech recognition & speech synthesis (English/Hindi) with explicit per-session consent; no audio is uploaded unless a server provider is configured.",
  },
  document_pipeline: {
    available: true,
    description: "Dependency-free text extraction for txt/csv/json/pdf/docx/xlsx uploads; images & other types report an honest 'not extractable' note.",
  },
  locker_attach_to_chat: {
    available: true,
    description: "Attach evidence from your Evidence Locker to a Sakhi chat by EV code — metadata only, never locked contents.",
  },
  auto_sos: {
    available: false,
    description: "Automatic SOS transmission (not integrated).",
    unavailableReason:
      "Automatic SOS transmission is not integrated. Dial 112/1091 directly or use the manual SOS button.",
  },
  voice_shield_demo: {
    available: false,
    description: "Voice Shield demonstration (not integrated).",
    unavailableReason:
      "Live GPS-broadcast SOS is not integrated. On-device speech (Voice Mode) works in the browser; emergency GPS broadcast does not.",
  },
  auto_complaint_filing: {
    available: false,
    description: "Automatic complaint filing (never offered).",
    unavailableReason:
      "Sakhi never files cyber complaints automatically — filing is always a manual, user-initiated action.",
  },
};

export interface VoiceConsent {
  grantable: boolean;
  mustBeExplicit: true;
  neverPassiveRecording: true;
  prompt:
    | string
    | "Voice interactions require your explicit, per-session consent. No audio is recorded silently.";
}

export const VOICE_CONSENT: VoiceConsent = {
  grantable: true,
  mustBeExplicit: true,
  neverPassiveRecording: true,
  prompt:
    "Voice interactions require your explicit, per-session consent. No audio is recorded silently.",
};

/** Short-context rule: when a user asks for something we cannot do, reply
 *  with the capability status rather than a fabricated success. */
export function boundaryResponse(capability: SakhiCapability): {
  ok: boolean;
  text: string;
} {
  const cap = CAPABILITIES[capability];
  if (cap.available) {
    return { ok: true, text: cap.description };
  }
  return { ok: false, text: cap.unavailableReason || "Not available." };
}