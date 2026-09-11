/**
 * Audio (STT / TTS) Provider Architecture for Sakhi Companion
 *
 * Honest layering, no fake AI:
 *
 * - SPEECH-TO-TEXT (STT): a server-backed transcription backend. Currently
 *   UNAVAILABLE — no microphone audio is ever recorded, sent or transcribed.
 *   Provider-ready slot exists for a real transcription backend.
 *
 * - TEXT-TO-SPEECH (TTS): a voice-reply backend. Currently UNAVAILABLE — Sakhi
 *   never fakes a "voice response". Provider-ready slot exists.
 *
 * The companion UI surfaces these statuses transparently. In every build the
 * user can fully use Sakhi via typed/pasted text; audio is never faked.
 */

export type AudioProviderStatus = "active" | "unavailable";

export interface AudioProvider {
  key: string;
  label: string;
  status: AudioProviderStatus;
  note: string;
}

function env(name: string): string | undefined {
  try {
    if (typeof process !== "undefined" && process.env) {
      return process.env[name];
    }
  } catch {
    /* not a Node build */
  }
  try {
    if (typeof window !== "undefined" && (window as any).__ENV__) {
      return (window as any).__ENV__[name];
    }
  } catch {
    /* not a browser build */
  }
  return undefined;
}

export function getSpeechToTextProvider(): AudioProvider {
  const configured = env("AUDIO_STT_PROVIDER");
  if (configured && configured !== "none") {
    return {
      key: configured,
      label: `${configured} transcription backend`,
      status: "unavailable",
      note: `${configured} is configured but no transcription service is connected and reachable. Voice Mode uses on-device browser speech instead.`,
    };
  }
  return {
    key: "none",
    label: "Speech-to-Text",
    status: "unavailable",
    note:
      "No server transcription backend. Voice Mode uses on-device browser speech recognition (mic stays in your browser) — or type your message.",
  };
}

export function getTextToSpeechProvider(): AudioProvider {
  const configured = env("AUDIO_TTS_PROVIDER");
  if (configured && configured !== "none") {
    return {
      key: configured,
      label: `${configured} voice backend`,
      status: "unavailable",
      note: `${configured} is configured but no voice service is connected and reachable. Voice Mode uses on-device browser voice instead.`,
    };
  }
  return {
    key: "none",
    label: "Text-to-Speech",
    status: "unavailable",
    note:
      "No server speech backend. Voice Mode uses on-device browser voice (nothing is uploaded) — replies are always shown as text too.",
  };
}

export const audioProvidersSummary = {
  stt: getSpeechToTextProvider(),
  tts: getTextToSpeechProvider(),
};