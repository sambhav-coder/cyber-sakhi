import { describe, expect, it } from "vitest";
import { resolveTurnLanguage } from "../../lib/sakhiAI";
import { adaptSwitchToDetected } from "../../components/companion/LanguageToggle";

describe("resolveTurnLanguage — smart-switch precedence", () => {
  it("an explicit in-message request beats the toggle pin", () => {
    expect(resolveTurnLanguage("en", "tell me in Hindi what to do")).toBe("hi");
    expect(resolveTurnLanguage("hi", "reply in English please")).toBe("en");
  });

  it("the toggle pin otherwise wins over detection (no stale-lock bypass)", () => {
    // NOTE: messages below contain no explicit "in Hindi/English" request —
    // an explicit request always beats the pin (tested above).
    expect(resolveTurnLanguage("en", "मैं ठीक हूँ, आपकी मदद चाहिए")).toBe("en");
    expect(resolveTurnLanguage("hi", "What's this site?")).toBe("hi");
    expect(resolveTurnLanguage("hinglish", "translate to french please")).toBe("hinglish");
  });

  it("ignores absent or invalid pins and falls through to explicit-then-detection", () => {
    expect(resolveTurnLanguage(undefined, "मैं ठीक हूँ")).toBe("hi");
    expect(resolveTurnLanguage(null, "mujhe scam lag raha hai")).toBe("hinglish");
    expect(resolveTurnLanguage(null, "what should I do now")).toBe("en");
    // @ts-expect-error invalid language pin value must be ignored, not honored
    expect(resolveTurnLanguage("fr", "hello")).toBe("en");
  });

  it("explicit request beats detection when unpinned", () => {
    expect(resolveTurnLanguage(null, "tell me in Hindi what to do")).toBe("hi");
    expect(resolveTurnLanguage(null, "speak hinglish please")).toBe("hinglish");
  });

  it("plain detection is the unpinned default", () => {
    expect(resolveTurnLanguage(null, "hello there")).toBe("en");
    expect(resolveTurnLanguage(null, "mera account hack ho gaya")).toBe("hinglish");
  });
});

describe("adaptSwitchToDetected — smart voice adaptation", () => {
  it("moves the single EN/हिं switch on confident en/hi transcripts", () => {
    expect(adaptSwitchToDetected("hi", "en")).toBe("en");
    expect(adaptSwitchToDetected("en", "hi")).toBe("hi");
  });

  it("leaves the switch untouched for hinglish/unknown input", () => {
    expect(adaptSwitchToDetected("en", "hinglish")).toBe("en");
    expect(adaptSwitchToDetected("hi", null)).toBe("hi");
    expect(adaptSwitchToDetected("hi", undefined)).toBe("hi");
  });
});
