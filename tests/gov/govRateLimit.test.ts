import { describe, expect, it } from "vitest";
import { GovRateLimiter } from "../../lib/gov/govRateLimit";

const WINDOW = 1000;
const MAX = 3;

describe("GovRateLimiter", () => {
  it("allows attempts within the budget", () => {
    const limiter = new GovRateLimiter(WINDOW, MAX);
    expect(limiter.check("ip:1", 0).allowed).toBe(true);
    expect(limiter.check("ip:1", 100).allowed).toBe(true);
    expect(limiter.check("ip:1", 200).allowed).toBe(true);
  });

  it("denies once the budget is exhausted and reports retryAfterMs", () => {
    const limiter = new GovRateLimiter(WINDOW, MAX);
    for (let t = 0; t < MAX; t++) limiter.check("ip:1", t);
    const denied = limiter.check("ip:1", MAX + 10);
    expect(denied.allowed).toBe(false);
    // Earliest hit is at t=0; window ends at 1000 → about 990ms remain.
    expect(denied.retryAfterMs).toBeGreaterThan(0);
    expect(denied.retryAfterMs).toBeLessThanOrEqual(WINDOW);
  });

  it("admits a new attempt only after the window slides", () => {
    const limiter = new GovRateLimiter(WINDOW, MAX);
    // Hits at 900, 910, 920: all inside the window at t=1020.
    limiter.check("ip:1", 900);
    limiter.check("ip:1", 910);
    limiter.check("ip:1", 920);
    expect(limiter.check("ip:1", 1020).allowed).toBe(false);
    // By t=2000 every hit predates cutoff=1000 → the window has slid.
    expect(limiter.check("ip:1", 2000).allowed).toBe(true);
  });

  it("tracks keys independently", () => {
    const limiter = new GovRateLimiter(WINDOW, MAX);
    for (let t = 0; t < MAX; t++) limiter.check("ip:a", t);
    expect(limiter.check("ip:b", 0).allowed).toBe(true);
  });

  it("reset clears a key immediately", () => {
    const limiter = new GovRateLimiter(WINDOW, MAX);
    for (let t = 0; t < MAX; t++) limiter.check("ip:1", t);
    limiter.reset("ip:1");
    expect(limiter.check("ip:1", 1234).allowed).toBe(true);
  });

  it("prune drops stale keys and reports the count", () => {
    const limiter = new GovRateLimiter(WINDOW, MAX);
    limiter.check("ip:stale", 0);
    limiter.check("ip:live", 1000);
    expect(limiter.prune(WINDOW + 5)).toBe(1);
    expect(limiter.size).toBe(1);
  });
});