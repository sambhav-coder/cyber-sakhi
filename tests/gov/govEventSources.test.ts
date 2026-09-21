import { describe, expect, it } from "vitest";
import fs from "node:fs";
import path from "node:path";
import {
  parseI4cAdvisories,
  parseI4cEvents,
  parseI4cPressReleases,
} from "@/lib/gov/govEventSources";
import { dedupeBy, normalizeKey, sanitizeText, tryParseDate, absolutize, sortEvents, isCyberRelevantForEvents } from "@/lib/gov/govFeedUtils";
import type { GovCurrentEvent } from "@/lib/gov/govFeedTypes";

function fixture(name: string): string {
  return fs.readFileSync(path.join(__dirname, "..", "fixtures", "gov", name), "utf8");
}

describe("govFeedUtils", () => {
  it("normalizeKey strips punctuation and case for dedupe keys", () => {
    expect(normalizeKey("  I4C cautions — 'Boss Scam': WhatsApp ")).toBe("i4ccautionsbossscamwhatsapp");
  });

  it("dedupeBy keeps the first unique row only", () => {
    const rows = [{ t: "One" }, { t: "Two" }, { t: "one" }, { t: "Three" }];
    expect(dedupeBy(rows, (r) => r.t)).toEqual([{ t: "One" }, { t: "Two" }, { t: "Three" }]);
  });

  it("parses the date formats used by I4C pages", () => {
    expect(tryParseDate("21 July 2026")).not.toBeNull();
    expect(tryParseDate("March 16 2026")).not.toBeNull();
    expect(tryParseDate("25 August, 2026")).not.toBeNull();
    expect(tryParseDate("")).toBeNull();
  });

  it("absolutizes relative I4C paths against the site origin", () => {
    expect(absolutize("theme/resources/advisories/x.pdf", "https://i4c.mha.gov.in/advisories.aspx")).toBe(
      "https://i4c.mha.gov.in/theme/resources/advisories/x.pdf"
    );
    expect(absolutize("https://www.pib.gov.in/x", "https://i4c.mha.gov.in/advisories.aspx")).toBe(
      "https://www.pib.gov.in/x"
    );
  });

  it("sanitizeText strips markup and decodes entities", () => {
    const out = sanitizeText("<p>Police &amp; cyber cell investigate <b>fraud</b></p>", 200);
    expect(out).toContain("Police & cyber cell investigate fraud");
    expect(out).not.toContain("<b>");
  });

  it("sortEvents orders by date and uses source priority as tiebreak", () => {
    const a: GovCurrentEvent = {
      id: "a", title: "A", summary: "", source: "I4C", sourceUrl: "",
      publishedAt: "2026-09-01T00:00:00Z", category: "c", type: "ADVISORY",
    };
    const b: GovCurrentEvent = {
      id: "b", title: "B", summary: "", source: "I4C · PIB", sourceUrl: "",
      publishedAt: "2026-09-01T00:00:00Z", category: "c", type: "ANNOUNCEMENT",
    };
    const c: GovCurrentEvent = {
      id: "c", title: "C", summary: "", source: "I4C", sourceUrl: "",
      publishedAt: "2026-09-05T00:00:00Z", category: "c", type: "PROGRAM",
    };
    const sorted = sortEvents([b, c, a], { I4C: 0, "I4C · PIB": 1 });
    expect(sorted.map((e) => e.id)).toEqual(["c", "a", "b"]);
  });
});

describe("I4C advisories parser (real captured page)", () => {
  const events = parseI4cAdvisories(fixture("i4c-advisories.html"));

  it("extracts a substantial list of advisories", () => {
    expect(events.length).toBeGreaterThanOrEqual(5);
  });

  it("normalizes types, titles and PDF source URLs", () => {
    const e = events[0];
    expect(e.title.length).toBeGreaterThan(0);
    expect(e.source).toBe("I4C");
    expect(e.sourceUrl).toMatch(/^https:\/\/i4c\.mha\.gov\.in\/theme\/resources\/advisories\/.*\.pdf$/);
    expect(e.summary.length).toBeGreaterThan(0);
    expect(["ADVISORY", "ALERT", "GUIDELINE"]).toContain(e.type);
    expect(e.publishedAt).toMatch(/^\d{4}-\d{2}-\d{2}T/);
  });

  it("keeps unique ids", () => {
    const ids = new Set(events.map((e) => e.id));
    expect(ids.size).toBe(events.length);
  });
});

describe("I4C press releases parser (real captured page)", () => {
  const events = parseI4cPressReleases(fixture("i4c-press-releases.html"));

  it("extracts English cyber-relevant releases", () => {
    expect(events.length).toBeGreaterThanOrEqual(1);
    const boss = events.find((e) => e.title.includes("Boss"));
    expect(boss).toBeTruthy();
    expect(boss?.sourceUrl).toMatch(/^https:\/\/www\.pib\.gov\.in\/PressReleasePage\.aspx\?PRID=/);
    expect(boss?.location).toBe("Delhi");
  });

  it("never surfaces Hindi-only rows or non-cyber releases", () => {
    const deva = events.some((e) => !/[a-zA-Z]/.test(e.title));
    expect(deva).toBe(false);
    expect(
      events.every((e) => isCyberRelevantForEvents(`${e.title} ${e.summary}`))
    ).toBe(true);
  });

  it("marks them as announcements", () => {
    expect(events.every((e) => e.type === "ANNOUNCEMENT")).toBe(true);
  });
});

describe("I4C events parser (real captured page)", () => {
  const events = parseI4cEvents(fixture("i4c-events.html"));

  it("extracts awareness events with dates", () => {
    expect(events.length).toBeGreaterThanOrEqual(2);
    expect(["WORKSHOP", "AWARENESS", "PROGRAM"]).toContain(events[0].type);
  });

  it("carries meaningful programme summaries", () => {
    expect(events[0].summary.length).toBeGreaterThan(80);
    expect(events[0].title).toBeTruthy();
  });
});

describe("defensive parsing", () => {
  it("returns an empty array for a redirect/error shell", () => {
    const shell =
      "<html><head><title>Not Found</title></head><body><a href='https://cert-in.org.in'>home</a></body></html>";
    expect(parseI4cAdvisories(shell)).toEqual([]);
    expect(parseI4cPressReleases(shell)).toEqual([]);
    expect(parseI4cEvents(shell)).toEqual([]);
  });
});