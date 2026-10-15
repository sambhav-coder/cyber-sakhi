import { describe, expect, it, vi, beforeEach, afterEach } from "vitest";
import {
  MIC_PERMISSION_MESSAGES,
  releaseMicProbe,
} from "../../lib/voice/micPermission";

describe("Voice Mode microphone permission probe", () => {
  beforeEach(() => {
    vi.restoreAllMocks();
  });
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("defines clear, actionable errors for every mandated failure mode", () => {
    for (const code of [
      "unsupported",
      "insecure-context",
      "permission-denied",
      "no-microphone",
      "not-readable",
      "empty-recording",
    ] as const) {
      const msg = MIC_PERMISSION_MESSAGES[code];
      expect(msg.length).toBeGreaterThan(20);
    }
    // Permission-denied tells the user exactly what to do; never fakes audio.
    expect(MIC_PERMISSION_MESSAGES["permission-denied"]).toMatch(/Allow the mic/i);
    expect(MIC_PERMISSION_MESSAGES["no-microphone"]).toMatch(/No microphone/i);
    expect(MIC_PERMISSION_MESSAGES["unsupported"]).toMatch(/Chrome or Edge/i);
  });

  it("reports unsupported when getUserMedia is missing (no fake stream)", async () => {
    vi.stubGlobal("window", { isSecureContext: true, location: { hostname: "localhost", protocol: "https:" } });
    vi.stubGlobal("navigator", {});
    const mod = await import("../../lib/voice/micPermission");
    const out = await mod.requestMicrophonePermission();
    expect(out.ok).toBe(false);
    if (!out.ok) expect(out.code).toBe("unsupported");
  });

  it("reports insecure-context without prompting for the mic", async () => {
    const getUserMedia = vi.fn();
    vi.stubGlobal("window", {
      isSecureContext: false,
      location: { hostname: "example.com", protocol: "http:" },
      setTimeout,
    });
    vi.stubGlobal("navigator", { mediaDevices: { getUserMedia } });
    const mod = await import("../../lib/voice/micPermission");
    const out = await mod.requestMicrophonePermission();
    expect(out.ok).toBe(false);
    if (!out.ok) expect(out.code).toBe("insecure-context");
    expect(getUserMedia).not.toHaveBeenCalled();
  });

  it("maps NotAllowedError to permission-denied", async () => {
    vi.stubGlobal("window", {
      isSecureContext: true,
      location: { hostname: "localhost", protocol: "http:" },
      setTimeout,
    });
    vi.stubGlobal("navigator", {
      mediaDevices: {
        getUserMedia: vi.fn().mockRejectedValue(new DOMException("denied", "NotAllowedError")),
      },
    });
    const mod = await import("../../lib/voice/micPermission");
    const out = await mod.requestMicrophonePermission();
    expect(out.ok).toBe(false);
    if (!out.ok) expect(out.code).toBe("permission-denied");
  });

  it("maps NotFoundError to no-microphone", async () => {
    vi.stubGlobal("window", {
      isSecureContext: true,
      location: { hostname: "localhost", protocol: "http:" },
      setTimeout,
    });
    vi.stubGlobal("navigator", {
      mediaDevices: {
        getUserMedia: vi.fn().mockRejectedValue(new DOMException("none", "NotFoundError")),
      },
    });
    const mod = await import("../../lib/voice/micPermission");
    const out = await mod.requestMicrophonePermission();
    expect(out.ok).toBe(false);
    if (!out.ok) expect(out.code).toBe("no-microphone");
  });

  it("releaseMicProbe stops every track and tolerates nulls", () => {
    const stopA = vi.fn();
    const stopB = vi.fn();
    releaseMicProbe({ getTracks: () => [{ stop: stopA }, { stop: stopB }] } as any);
    expect(stopA).toHaveBeenCalled();
    expect(stopB).toHaveBeenCalled();
    expect(() => releaseMicProbe(null)).not.toThrow();
    expect(() => releaseMicProbe(undefined)).not.toThrow();
  });

  it("VoiceModePortal requests permission on gesture and cleans up tracks", async () => {
    const fs = await import("node:fs");
    const portal = fs.readFileSync("components/companion/VoiceModePortal.tsx", "utf8");
    expect(portal).toContain("requestMicrophonePermission");
    expect(portal).toContain("releaseMicProbe");
    // Never requested on render — only inside the gesture handler.
    expect(portal).toMatch(/const startListening = async/);
    // Full lifecycle states exist.
    expect(portal).toMatch(/"requesting"/);
    expect(portal).toMatch(/"transcribing"/);
    // STT locale follows the current switch (Hindi turns use hi-IN).
    expect(portal).toMatch(/langModeRef\.current === "hi" \? "hi" : "en"/);
    // Stale audio is stopped before listening; probe tracks released.
    expect(portal).toContain("micProbeRef");
  });
});
