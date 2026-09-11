/**
 * Server-side voice provider configuration probe.
 *
 * Honest: an STT/TTS server slot only reports "available" when the platform
 * owner has configured BOTH an endpoint and an API key. Until then it stays
 * unavailable and the companion relies on on-device browser speech. API keys
 * are never returned to the client.
 */

export interface VoiceSlotStatus {
  provider: string | null;
  endpointConfigured: boolean;
  keyConfigured: boolean;
  available: boolean;
  note: string;
}

export function getSttSlotStatus(): VoiceSlotStatus {
  const provider = process.env.SAKHI_STT_PROVIDER?.trim() || null;
  const endpoint = process.env.SAKHI_STT_ENDPOINT?.trim() || null;
  const key = Boolean(process.env.SAKHI_STT_API_KEY?.trim());
  const available = Boolean(provider && endpoint && key);
  return {
    provider,
    endpointConfigured: Boolean(endpoint),
    keyConfigured: key,
    available,
    note: available
      ? `${provider} transcription is configured.`
      : provider
      ? `${provider} is configured but the server transcription endpoint/key are incomplete or unverified — on-device browser speech is used instead.`
      : "No server transcription provider configured — Voice Mode uses on-device browser speech, or you can type.",
  };
}

export function getTtsSlotStatus(): VoiceSlotStatus {
  const provider = process.env.SAKHI_TTS_PROVIDER?.trim() || null;
  const endpoint = process.env.SAKHI_TTS_ENDPOINT?.trim() || null;
  const key = Boolean(process.env.SAKHI_TTS_API_KEY?.trim());
  const available = Boolean(provider && endpoint && key);
  return {
    provider,
    endpointConfigured: Boolean(endpoint),
    keyConfigured: key,
    available,
    note: available
      ? `${provider} voice synthesis is configured.`
      : provider
      ? `${provider} is configured but the server speech endpoint/key are incomplete or unverified — on-device browser voice is used instead.`
      : "No server speech provider configured — Voice Mode uses on-device browser voice, or replies are shown as text.",
  };
}