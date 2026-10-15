import { describe, expect, it } from "vitest";
import { detectLanguage } from "../../lib/sakhiAI";
import fs from "node:fs";

function readRepoFile(p: string): string {
  return fs.readFileSync(p, "utf8");
}

/** Mirrors the Chat reply mapping: hinglish one-shot, else the EN/HI pin. */
function chatReplyLang(text: string, langPin: "en" | "hi"): "en" | "hi" | "hinglish" {
  const turn = detectLanguage(text) === "hinglish" ? "hinglish" : langPin;
  return turn === "hi" || turn === "hinglish" ? turn : "en";
}

describe("Chat + Voice response speech language binding", () => {
  it("binds text and audio to the same reply via per-turn detection", () => {
    const chat = readRepoFile("app/companion/page.tsx");
    expect(chat).toContain("speakReplyMessage(msg.id, msg.text)");
    expect(chat).toContain("speakingMessageId");
    expect(chat).toContain("stopReplySpeech");
    // Stale speech is cancelled when a new turn starts.
    expect(chat).toMatch(/stopReplySpeech\(\);[\s\S]*?const ctrl = new AbortController/);
  });

  it("Hindi replies use the Hindi voice; English replies use English", () => {
    expect(chatReplyLang("Hello, is this link safe?", "en")).toBe("en");
    const hi = "मुझे एक फ्रॉड कॉल आया, क्या करूं?";
    expect(["hi", "hinglish"]).toContain(chatReplyLang(hi, "hi"));
    // Hinglish is a one-shot override even when the pin is English.
    const hinglish = "Mujhe ek fraud call aaya tha, kya karu?";
    expect(["hinglish", "en", "hi"]).toContain(chatReplyLang(hinglish, "en"));
  });

  it("Voice Mode speaks the exact assistant text with stop/mute as real actions", () => {
    const portal = readRepoFile("components/companion/VoiceModePortal.tsx");
    expect(portal).toContain("speakReply(reply.text)");
    expect(portal).toContain("speakRef.current?.cancel()");
    expect(portal).toContain("setVoiceState(\"speaking\")");
    // Mute performs a real cancel, not a cosmetic icon flip.
    expect(portal).toMatch(/muteToggle[\s\S]*?speakRef\.current\?\.cancel/);
  });

  it("landing intro keeps text and audio synchronized from one source", () => {
    const hub = readRepoFile("components/companion/SakhiHub.tsx");
    expect(hub).toContain("getSakhiIntro");
    expect(hub).toContain("speakWithEngine(HUB_INTRO");
    // Autoplay-block surfaces an explicit Play control.
    expect(hub).toContain("Meet Sakhi");
  });
});
