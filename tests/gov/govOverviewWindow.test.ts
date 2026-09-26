import { describe, expect, it } from "vitest";
import { govDashboardWindow } from "../../lib/gov/govQueries";

const DAY_MS = 24 * 60 * 60 * 1000;

describe("govDashboardWindow", () => {
  it("today starts at the UTC day boundary (not local midnight)", () => {
    const before = new Date();
    const w = govDashboardWindow("today");
    expect(w.label).toBe("today");
    expect(w.from).not.toBeNull();
    expect(w.to).not.toBeNull();
    const from = new Date(w.from as string);
    const expected = new Date(
      Date.UTC(before.getUTCFullYear(), before.getUTCMonth(), before.getUTCDate()),
    );
    expect(from.toISOString()).toBe(expected.toISOString());
    expect(Date.parse(w.to as string)).toBeGreaterThanOrEqual(Date.parse(w.from as string));
  });

  it("7d/30d/90d span the requested number of days ending now", () => {
    for (const [label, days] of [["7d", 7], ["30d", 30], ["90d", 90]] as const) {
      const w = govDashboardWindow(label);
      expect(w.label).toBe(label);
      const span = Date.parse(w.to as string) - Date.parse(w.from as string);
      expect(span).toBeGreaterThan(days * DAY_MS - 60_000);
      expect(span).toBeLessThanOrEqual(days * DAY_MS + 60_000);
    }
  });

  it("different ranges produce different windows", () => {
    const a = govDashboardWindow("7d");
    const b = govDashboardWindow("30d");
    expect(a.from).not.toBe(b.from);
  });

  it("custom passes through valid ISO bounds and nulls invalid ones", () => {
    const w = govDashboardWindow("custom", "2026-09-01", "2026-09-10");
    expect(w.label).toBe("custom");
    expect(w.from).toBe(new Date("2026-09-01").toISOString());
    expect(w.to).toBe(new Date("2026-09-10").toISOString());

    const bad = govDashboardWindow("custom", "not-a-date", "");
    expect(bad.from).toBeNull();
    expect(bad.to).toBeNull();
  });

  it("unknown range falls back to 7d", () => {
    expect(govDashboardWindow("whatever").label).toBe("7d");
  });
});
