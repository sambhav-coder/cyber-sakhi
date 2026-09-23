import { describe, expect, it } from "vitest";
import {
  SAKHI_LANDING_INTRO,
  SAKHI_CHAT_INTRO,
  SAKHI_VOICE_INTRO,
  getSakhiIntro,
} from "../../lib/voice/content";

describe("mode introductions — one canonical string per mode", () => {
  it("exposes three distinct, non-trivial intros", () => {
    const all = new Set([SAKHI_LANDING_INTRO, SAKHI_CHAT_INTRO, SAKHI_VOICE_INTRO]);
    expect(all.size).toBe(3);
    expect(SAKHI_LANDING_INTRO.length).toBeGreaterThan(30);
    expect(SAKHI_CHAT_INTRO.length).toBeGreaterThan(30);
    expect(SAKHI_VOICE_INTRO.length).toBeGreaterThan(30);
  });

  it("each intro is mode-specific and never a copy of another mode", () => {
    expect(SAKHI_LANDING_INTRO).toContain("Sakhi AI");
    expect(SAKHI_CHAT_INTRO).toContain("Chat Mode");
    expect(SAKHI_VOICE_INTRO).toContain("Voice Mode");

    expect(SAKHI_CHAT_INTRO).not.toContain("Voice Mode");
    expect(SAKHI_VOICE_INTRO).not.toContain("Chat Mode");
    expect(SAKHI_LANDING_INTRO).not.toContain("Voice Mode");
    expect(SAKHI_LANDING_INTRO).not.toContain("Chat Mode");
  });

  it("unified API returns the canonical English strings", () => {
    expect(getSakhiIntro("landing", "en")).toBe(SAKHI_LANDING_INTRO);
    expect(getSakhiIntro("chat", "en")).toBe(SAKHI_CHAT_INTRO);
    expect(getSakhiIntro("voice", "en")).toBe(SAKHI_VOICE_INTRO);
  });

  it("Hindi mode returns Devanagari intros that follow the switch", () => {
    const DEVANAGARI = /[\u0900-\u097F]/;
    for (const mode of ["landing", "chat", "voice"] as const) {
      const hi = getSakhiIntro(mode, "hi");
      expect(hi.length).toBeGreaterThan(30);
      expect(hi).toMatch(DEVANAGARI);
      expect(hi).not.toBe(getSakhiIntro(mode, "en"));
    }
    expect(getSakhiIntro("chat", "hi")).toContain("चैट");
    expect(getSakhiIntro("voice", "hi")).toContain("वॉइस");
  });
});