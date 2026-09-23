import { describe, expect, it } from "vitest";
import {
  ATTACK_RATE,
  jawOpenForLevel,
  MAX_JAW_OPEN,
  RELEASE_RATE,
  rmsFromTimeDomain,
  SILENCE_GATE,
  smoothLevel,
} from "../../lib/voice/audioSync";

function tone(length: number, amplitude: number): number[] {
  const out: number[] = [];
  for (let i = 0; i < length; i += 1) {
    out.push(128 + Math.round(amplitude * Math.sin((i / length) * Math.PI * 8)));
  }
  return out;
}

describe("rmsFromTimeDomain — real signal measurement", () => {
  it("digital silence measures ~0", () => {
    expect(rmsFromTimeDomain(new Array(512).fill(128))).toBeCloseTo(0, 6);
    expect(rmsFromTimeDomain([])).toBe(0);
  });

  it("a tone measures proportionally to its amplitude", () => {
    const quiet = rmsFromTimeDomain(tone(512, 10));
    const loud = rmsFromTimeDomain(tone(512, 60));
    expect(loud).toBeGreaterThan(quiet);
    expect(quiet).toBeGreaterThan(0);
    expect(loud).toBeLessThanOrEqual(1);
  });
});

describe("smoothLevel — envelope follower", () => {
  it("attacks fast toward new energy", () => {
    expect(smoothLevel(0, 1)).toBeCloseTo(ATTACK_RATE, 6);
  });

  it("releases slower than it attacks", () => {
    const attackStep = smoothLevel(0, 1) - 0;
    const releaseStep = 1 - smoothLevel(1, 0);
    expect(releaseStep).toBeCloseTo(RELEASE_RATE, 6);
    expect(releaseStep).toBeLessThan(attackStep);
  });

  it("holds steady levels", () => {
    expect(smoothLevel(0.4, 0.4)).toBeCloseTo(0.4, 9);
  });
});

describe("jawOpenForLevel — gated, clamped mouth drive", () => {
  it("stays shut below the silence gate", () => {
    expect(jawOpenForLevel(0)).toBe(0);
    expect(jawOpenForLevel(SILENCE_GATE / 2)).toBe(0);
    expect(jawOpenForLevel(NaN)).toBe(0);
  });

  it("opens proportionally and never exceeds the maximum", () => {
    const half = jawOpenForLevel(0.2);
    const full = jawOpenForLevel(1);
    expect(half).toBeGreaterThan(0);
    expect(full).toBeLessThanOrEqual(MAX_JAW_OPEN);
    expect(full).toBeGreaterThanOrEqual(half);
  });
});
