/**
 * Canonical Sakhi onboarding copy — ONE source of truth per mode.
 *
 * Sakhi has THREE distinct, intentional introductions, each with a single
 * canonical string. The SAME string is (a) rendered as the visible UI text,
 * (b) spoken by Sakhi's TTS (local Piper, else browser voice), and (c) used
 * for the avatar's lip-sync. Never duplicate, reword, or fork a mode's intro
 * inside a surface — every surface must consume the same exported constant:
 *
 *   - SAKHI_LANDING_INTRO  -> Sakhi AI landing / hub (SakhiHub), always English.
 *   - SAKHI_CHAT_INTRO     -> Chat Mode welcome (spoken intro + welcome card).
 *   - SAKHI_VOICE_INTRO    -> Voice Mode spoken welcome (VoiceModePortal).
 *
 * Landing onboarding is ALWAYS English (product policy). Hindi/Hinglish is a
 * per-turn capability on top, never a replacement.
 */
export const SAKHI_LANDING_INTRO =
  "Welcome to Sakhi AI. I'm Sakhi, your smart cyber-safety companion. You can chat with me or talk to me by voice. I can help you understand online threats, stay safer, and make sense of your digital world. Choose a mode and let's get started.";

/** Chat Mode — dedicated intro, distinct from the landing and voice modes. */
export const SAKHI_CHAT_INTRO =
  "Welcome to Chat Mode. I'm Sakhi. Ask me about cyber safety, phishing, fraud, your cases, evidence, or anything you're unsure about. What's on your mind?";

/** Voice Mode — distinct natural spoken welcome. */
export const SAKHI_VOICE_INTRO =
  "Welcome to Voice Mode. I'm Sakhi. You can talk to me naturally here, just like a one-to-one conversation. Tell me what's going on, and I'll listen.";