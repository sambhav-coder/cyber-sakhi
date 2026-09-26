import { describe, expect, it } from "vitest";
import {
  isPersistableIndicator,
  isValidEmailIndicator,
  isValidHashIndicator,
  isValidIpIndicator,
  isWellFormedIndicator,
  normalizeDomainIndicator,
  normalizeUrlIndicator,
  stripTrailingJunk,
} from "../../lib/indicatorNormalize";
import { buildTimeBuckets } from "../../lib/gov/govQueries";

describe("stripTrailingJunk", () => {
  it("removes qp tails and trailing punctuation", () => {
    expect(stripTrailingJunk("https://link.internshala.com/v1/emailclick?q=")).toBe(
      "https://link.internshala.com/v1/emailclick?q",
    );
    expect(stripTrailingJunk("https://u48138813.ct.sendgrid.net/wf/open?upn=3Du001.=")).toBe(
      "https://u48138813.ct.sendgrid.net/wf/open?upn=3Du001",
    );
    expect(stripTrailingJunk("https://example.com/a.,")).toBe("https://example.com/a");
  });
});

describe("normalizeUrlIndicator", () => {
  it("accepts clean URLs", () => {
    expect(normalizeUrlIndicator("http://77.73.133.113/lego/mine.exe")).toBe(
      "http://77.73.133.113/lego/mine.exe",
    );
    expect(normalizeUrlIndicator("https://example.com/path?a=1")).toBe("https://example.com/path?a=1");
  });

  it("rejects qp garbage and broken hosts", () => {
    expect(normalizeUrlIndicator("http://www.=")).toBeNull();
    // qp tail cleans to a plausible URL — stored cleaned, not as garbage.
    expect(normalizeUrlIndicator("https://internshala.com//static/images/mai=")).toBe(
      "https://internshala.com//static/images/mai",
    );
    // Bare trailing `=` is a truncation artifact; `==` padding is kept.
    expect(normalizeUrlIndicator("https://link.internshala.com/v1/emailclick?q=")).toBeNull();
    expect(normalizeUrlIndicator("https://example.com/dl?token=abc==")).toBe(
      "https://example.com/dl?token=abc==",
    );
    // Syntactically valid hosts pass (feeds report empty for unknown
    // names); only provably-broken values are rejected. No TLD registry
    // is maintained — that would be fragile, not validation.
    expect(normalizeUrlIndicator("https://link.interns=")).toBe("https://link.interns");
    expect(normalizeUrlIndicator("not a url")).toBeNull();
    expect(normalizeUrlIndicator("ftp://example.com/x")).toBeNull();
    expect(normalizeUrlIndicator("http://no-dot-host/x")).toBeNull();
  });
});

describe("normalizeDomainIndicator", () => {
  it("accepts real domains, rejects garbage", () => {
    expect(normalizeDomainIndicator("Example.COM")).toBe("example.com");
    expect(normalizeDomainIndicator("evil.tk.")).toBe("evil.tk");
    expect(normalizeDomainIndicator("notadomain")).toBeNull();
    expect(normalizeDomainIndicator("a=b.cc")).toBeNull();
  });
});

describe("isValidEmailIndicator / isValidIpIndicator / isValidHashIndicator", () => {
  it("validates syntax without verdicts", () => {
    expect(isValidEmailIndicator("user@example.com")).toBe(true);
    expect(isValidEmailIndicator("bad=addr@x")).toBe(false);
    expect(isValidIpIndicator("8.8.8.8")).toBe(true);
    expect(isValidIpIndicator("07:08:55")).toBe(false);
    expect(isValidHashIndicator("e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855")).toBe(true);
    expect(isValidHashIndicator("xyz")).toBe(false);
  });
});

describe("isPersistableIndicator gate", () => {
  it("blocks garbage, passes unknown types through", () => {
    expect(isPersistableIndicator("url", "http://www.=")).toBe(false);
    expect(isPersistableIndicator("url", "https://example.com/a")).toBe(true);
    expect(isPersistableIndicator("domain", "a=b.cc")).toBe(false);
    expect(isPersistableIndicator("phone", "+91-98765-43210")).toBe(true);
    expect(isPersistableIndicator("email", "")).toBe(false);
  });

  it("isWellFormedIndicator mirrors the gate for read paths", () => {
    // Bare trailing `=` is a truncation artifact, excluded from recurrence.
    expect(isWellFormedIndicator("url", "https://link.internshala.com/v1/emailclick?q=")).toBe(false);
    expect(isWellFormedIndicator("url", "http://www.=")).toBe(false);
    expect(isWellFormedIndicator("url", "http://77.73.133.113/lego/mine.exe")).toBe(true);
  });
});

describe("buildTimeBuckets", () => {
  it("fills zero days and sums exactly to the input total", () => {
    const counts = new Map([["2026-09-25", 3], ["2026-09-27", 2]]);
    const buckets = buildTimeBuckets("2026-09-24T00:00:00.000Z", "2026-09-28T00:00:00.000Z", counts);
    expect(buckets.map((b) => b.day)).toEqual([
      "2026-09-24",
      "2026-09-25",
      "2026-09-26",
      "2026-09-27",
      "2026-09-28",
    ]);
    expect(buckets.map((b) => b.count)).toEqual([0, 3, 0, 2, 0]);
    expect(buckets.reduce((s, b) => s + b.count, 0)).toBe(5);
  });

  it("uses weekly buckets beyond 120 days, still reconciling", () => {
    const counts = new Map([["2026-01-15", 2], ["2026-05-20", 3]]);
    const buckets = buildTimeBuckets("2026-01-01T00:00:00.000Z", "2026-06-01T00:00:00.000Z", counts);
    expect(buckets.length).toBeGreaterThan(0);
    expect(buckets.length).toBeLessThan(40);
    expect(buckets.reduce((s, b) => s + b.count, 0)).toBe(5);
  });

  it("returns empty for invalid windows", () => {
    expect(buildTimeBuckets("bad", "2026-01-01T00:00:00.000Z", new Map())).toEqual([]);
  });
});
