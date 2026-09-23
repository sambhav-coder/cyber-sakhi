import { describe, expect, it } from "vitest";
import {
  DEFAULT_AVATAR_ID,
  getAvatarPreset,
  SAKHI_AVATAR_PRESETS,
  summarizeRig,
} from "../../lib/avatar/presets";

describe("avatar presets — officer candidate and classic presets available", () => {
  it("ships verified presets (Officer candidate and Classic Sakhi)", () => {
    expect(SAKHI_AVATAR_PRESETS.length).toBeGreaterThanOrEqual(2);
    const officer = SAKHI_AVATAR_PRESETS.find((p) => p.id === "sakhi-officer");
    const classic = SAKHI_AVATAR_PRESETS.find((p) => p.id === "sakhi-classic");
    expect(officer).toBeDefined();
    expect(classic).toBeDefined();
    expect(officer?.modelUrl).toBe("/assets/design/sakhi-officer.glb");
    expect(classic?.modelUrl).toBe("/assets/design/sakhi.glb");
    expect(officer?.selfHosted).toBe(true);
    expect(classic?.selfHosted).toBe(true);
  });

  it("resolves the known presets without fallback", () => {
    const { preset: pOfficer, fallback: fbOfficer } = getAvatarPreset("sakhi-officer");
    expect(fbOfficer).toBe(false);
    expect(pOfficer.modelUrl).toBe("/assets/design/sakhi-officer.glb");

    const { preset: pClassic, fallback: fbClassic } = getAvatarPreset("sakhi-classic");
    expect(fbClassic).toBe(false);
    expect(pClassic.modelUrl).toBe("/assets/design/sakhi.glb");
  });

  it("falls back to the existing avatar for unknown ids (never broken)", () => {
    for (const bad of [null, undefined, "", "invalid-id", "../evil.glb"]) {
      const { preset, fallback } = getAvatarPreset(bad);
      expect(preset.id).toBe(DEFAULT_AVATAR_ID);
      expect(fallback).toBe(true);
    }
  });
});

describe("summarizeRig — verify, never assume, viseme support", () => {
  it("reports a fully-compatible rig", () => {
    const report = summarizeRig({
      jawOpen: 0,
      mouthOpen: 1,
      viseme_aa: 2,
      viseme_E: 3,
      viseme_PP: 4,
      eyeBlinkLeft: 5,
      eyeBlinkRight: 6,
      mouthSmile: 7,
    });
    expect(report.morphTargetCount).toBe(8);
    expect(report.visemeCount).toBe(3);
    expect(report.hasJawOpen).toBe(true);
    expect(report.hasEyeBlink).toBe(true);
    expect(report.pipelineCompatible).toBe(true);
  });

  it("flags a rig without visemes as incompatible (no fake lip-sync)", () => {
    const report = summarizeRig({ jawOpen: 0, mouthSmile: 1 });
    expect(report.visemeCount).toBe(0);
    expect(report.hasJawOpen).toBe(true);
    expect(report.pipelineCompatible).toBe(false);
  });

  it("handles missing dictionaries safely", () => {
    for (const empty of [null, undefined, {}]) {
      const report = summarizeRig(empty as unknown as Record<string, number>);
      expect(report.morphTargetCount).toBe(0);
      expect(report.pipelineCompatible).toBe(false);
    }
  });
});
