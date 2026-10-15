/**
 * Authoritative server-side Sakhi voice configuration.
 *
 * Single source of truth for the EXACT previously selected Edge TTS voices.
 * Every feature (News Desk read-aloud, Sakhi AI responses, landing-page
 * Sakhi speech, Chat and Voice Mode) resolves its server voice through this
 * module — directly or via `/api/voice/tts` -> `lib/voice/edgeTts.ts`.
 *
 * Recovery evidence (verified via `git log -p` on the remote `main`):
 * - `f1bc6a9` ("feat: productionize Sakhi AI chat and voice") CREATED
 *   `lib/voice/edgeTts.ts` with:
 *     en       -> en-IN-NeerjaNeural (lang en-IN)
 *     hi       -> hi-IN-SwaraNeural  (lang hi-IN)
 *     hinglish -> hi-IN-SwaraNeural  (lang hi-IN)
 * - `64c9109` ("fix: productionize Sakhi voice pipeline") kept the same
 *   voice IDs unchanged (only fixed ws bundling / temp-dir handling).
 * - `4b2da0d` ("feat: enhance Cyber Sakhi investigation and officer avatar")
 *   kept the same voice IDs unchanged (only added word-boundary subtitles).
 * - `tests/voice/edgeTts.test.ts` pins the same three mappings.
 * - `AVATAR_RESTORATION_REPORT.md` documents "en-IN Neerja (English),
 *   hi-IN Swara (Hindi)" as the original voices.
 *
 * The Piper sidecar voices (`en_GB-aru-medium` / `hi_IN-priyamvada-medium`
 * in the deleted `lib/voice/localPiper.ts`, `lib/voice/localStt.ts`,
 * `scripts/piper_sidecar.py` — removed intentionally in `166461e` under the
 * documented Node-only voice policy) were a SEPARATE local engine and were
 * NEVER the selected Edge TTS voices. They must NOT be restored: the server
 * status route (`app/api/voice/status/route.ts`) explicitly reports
 * `local.tts/stt: false` by policy, and `app/api/voice/stt/route.ts`
 * documents that no local Python/Vosk sidecar ships with the app.
 *
 * Rules enforced here:
 * - Language selection follows the ACTUAL response/turn language (`en` |
 *   `hi` | `hinglish`), never the browser locale alone. Callers detect the
 *   turn language first (see `lib/sakhiAI.ts` `detectLanguage`) and pass it
 *   in — this module never guesses from `navigator.language`.
 * - Mixed-language (Hinglish) content uses the Hindi voice by design, matching
 *   the historical configuration.
 * - No silent fallback to an unrelated voice: `resolveVoice` throws on
 *   unknown languages instead of returning a default, so synthesis failures
 *   surface as errors upstream (the client `speakWithEngine` reports them via
 *   `onError` and only then uses the explicit browser-voice fallback path).
 * - No secrets in this file. No logging of user content.
 */

export type SakhiServerVoiceLanguage = "en" | "hi" | "hinglish";

export interface ServerVoiceConfig {
  voice: string;
  lang: string;
}

/**
 * The EXACT previously selected voices. Do not change these IDs without
 * repository evidence that the selection intentionally changed.
 */
export const SAKHI_SERVER_VOICES: Record<SakhiServerVoiceLanguage, ServerVoiceConfig> = {
  en: { voice: "en-IN-NeerjaNeural", lang: "en-IN" },
  hi: { voice: "hi-IN-SwaraNeural", lang: "hi-IN" },
  hinglish: { voice: "hi-IN-SwaraNeural", lang: "hi-IN" },
};

export const SAKHI_VOICE_EN = SAKHI_SERVER_VOICES.en.voice;
export const SAKHI_VOICE_HI = SAKHI_SERVER_VOICES.hi.voice;

/**
 * Normalize a caller-supplied language tag to the authoritative set.
 * Unknown / empty values throw — callers must detect the turn language
 * first instead of receiving a silent unrelated default.
 */
export function normalizeServerVoiceLanguage(
  language: string
): SakhiServerVoiceLanguage {
  const normalized = String(language || "").trim().toLowerCase();
  if (normalized === "hi" || normalized === "hinglish") return normalized;
  if (normalized === "en") return "en";
  throw new Error(
    `Unknown voice language "${language}". Detect the turn language (en/hi/hinglish) before requesting speech.`
  );
}

/** Resolve the exact server voice for a turn language. Throws on unknown. */
export function resolveServerVoice(language: string): ServerVoiceConfig {
  return SAKHI_SERVER_VOICES[normalizeServerVoiceLanguage(language)];
}

/** Map an article/message language tag to the TTS turn language. */
export function voiceLanguageForArticle(
  articleLanguage: string | null | undefined
): "en" | "hi" {
  return articleLanguage === "hi" ? "hi" : "en";
}
