/**
 * Canonical Sakhi onboarding copy — ONE source of truth per mode.
 *
 * Sakhi has THREE distinct, intentional introductions, each with a canonical
 * string per language. The SAME string is (a) rendered as the visible UI
 * text, (b) spoken by Sakhi's TTS (Node Edge TTS via /api/voice/tts, else
 * browser voice), and (c) used for the avatar's lip-sync. Never duplicate,
 * reword, or fork a mode's intro inside a surface — every surface must
 * consume `getSakhiIntro(mode, lang)` (the legacy exported constants below
 * are the English variants, kept for backward compatibility):
 *
 *   - "landing" -> Sakhi AI landing / hub (SakhiHub).
 *   - "chat"    -> Chat Mode welcome (spoken intro + welcome card).
 *   - "voice"   -> Voice Mode spoken welcome (VoiceModePortal).
 *
 * The intro language follows the single smart EN/हिं switch from the
 * beginning of the next interaction: English mode plays the English intro
 * with the English TTS voice; Hindi mode plays the Hindi intro (Devanagari)
 * with the Hindi TTS voice. Technical identifiers are never translated.
 */
export const SAKHI_LANDING_INTRO =
  "Welcome to Sakhi AI. I'm Sakhi, your smart cyber-safety companion. You can chat with me or talk to me by voice. I can help you understand online threats, stay safer, and make sense of your digital world. Choose a mode and let's get started.";

/** Chat Mode — dedicated intro, distinct from the landing and voice modes. */
export const SAKHI_CHAT_INTRO =
  "Welcome to Chat Mode. I'm Sakhi. Ask me about cyber safety, phishing, fraud, your cases, evidence, or anything you're unsure about. What's on your mind?";

/** Voice Mode — distinct natural spoken welcome. */
export const SAKHI_VOICE_INTRO =
  "Welcome to Voice Mode. I'm Sakhi. You can talk to me naturally here, just like a one-to-one conversation. Tell me what's going on, and I'll listen.";

export const SAKHI_LANDING_INTRO_HI =
  "सखी AI में आपका स्वागत है। मैं सखी हूँ, आपकी स्मार्ट साइबर-सुरक्षा साथी। आप मुझसे चैट पर या आवाज़ से बात कर सकती हैं। मैं ऑनलाइन खतरों को समझने, सुरक्षित रहने और आपकी डिजिटल दुनिया को सुलझाने में मदद कर सकती हूँ। कोई मोड चुनें और शुरू करते हैं।";

export const SAKHI_CHAT_INTRO_HI =
  "चैट मोड में आपका स्वागत है। मैं सखी हूँ। साइबर सुरक्षा, फ़िशिंग, फ्रॉड, आपके केस, सबूत, या जो भी बात आपको परेशान कर रही हो — मुझसे पूछें। बताइए, क्या बात है?";

export const SAKHI_VOICE_INTRO_HI =
  "वॉइस मोड में आपका स्वागत है। मैं सखी हूँ। यहाँ आप मुझसे बिल्कुल सहज होकर बात कर सकती हैं, जैसे आमने-सामने बातचीत में। बताइए क्या हो रहा है, मैं सुन रही हूँ।";

export type SakhiIntroMode = "landing" | "chat" | "voice";
export type SakhiIntroLang = "en" | "hi";

/**
 * The unified intro-line API: one function, mode-aware content,
 * switch-aware language. Every surface (hub, chat, voice) calls this with
 * the current smart-switch mode — no disconnected per-mode intro systems.
 */
export function getSakhiIntro(mode: SakhiIntroMode, lang: SakhiIntroLang): string {
  const hindi = lang === "hi";
  switch (mode) {
    case "landing":
      return hindi ? SAKHI_LANDING_INTRO_HI : SAKHI_LANDING_INTRO;
    case "chat":
      return hindi ? SAKHI_CHAT_INTRO_HI : SAKHI_CHAT_INTRO;
    case "voice":
      return hindi ? SAKHI_VOICE_INTRO_HI : SAKHI_VOICE_INTRO;
  }
}
