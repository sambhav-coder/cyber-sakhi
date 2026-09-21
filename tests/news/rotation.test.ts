import { describe, expect, it } from "vitest";
import {
  buildNarration,
  buildRotationPool,
  deskArticles,
  deskCandidates,
  excludePoolFromSecondary,
  mergePool,
  nextLeadIndex,
  watchArticles,
} from "@/lib/news/rotation";
import type { NewsArticle } from "@/lib/news/types";

function article(id: string): NewsArticle {
  return {
    id,
    title: `Story ${id}`,
    summary: "summary",
    sourceName: "Source A",
    sourceKind: "news",
    sourceUrl: `https://x.in/${id}`,
    publishedAt: "2026-09-19T00:00:00.000Z",
    retrievedAt: "2026-09-19T00:00:00.000Z",
    category: "Cybercrime",
    tags: [],
    location: null,
    imageUrl: null,
    verifiedSource: false,
  };
}

describe("news rotation pool", () => {
  it("builds an ordered, de-duplicated pool lead → stories → watch", () => {
    const lead = article("lead");
    const s1 = article("s1");
    const s2 = article("s2");
    const w1 = article("w1");
    const pool = buildRotationPool({ lead, stories: [s1, s2], cyberWatch: [s1, w1] });
    expect(pool.map((a) => a.id)).toEqual(["lead", "s1", "s2", "w1"]);
  });

  it("handles a null lead and duplicate watch ids", () => {
    const s1 = article("s1");
    const s2 = article("s2");
    const w1 = article("s2");
    const pool = buildRotationPool({ lead: null, stories: [s1, s2], cyberWatch: [w1] });
    expect(pool.map((a) => a.id)).toEqual(["s1", "s2"]);
  });

  it("returns an empty pool for an empty edition", () => {
    expect(buildRotationPool({ lead: null, stories: [], cyberWatch: [] })).toEqual([]);
  });
});

describe("nextLeadIndex", () => {
  it("cycles cyclically", () => {
    expect(nextLeadIndex(0, 4)).toBe(1);
    expect(nextLeadIndex(3, 4)).toBe(0);
  });

  it("stays put for a single-item pool", () => {
    expect(nextLeadIndex(0, 1)).toBe(0);
    expect(nextLeadIndex(0, 0)).toBe(0);
  });
});

describe("deskArticles / watchArticles", () => {
  it("excludes the current lead so nothing is shown twice", () => {
    const lead = article("lead");
    const s1 = article("s1");
    const s2 = article("s2");
    const s3 = article("s3");
    expect(deskArticles([lead, s1, s2, s3], "lead").map((a) => a.id)).toEqual(["s1", "s2", "s3"]);
    expect(deskArticles([lead, s1, s2, s3], "s2").map((a) => a.id)).toEqual(["lead", "s1", "s3"]);
  });

  it("respects the max bounds", () => {
    const s1 = article("s1");
    const s2 = article("s2");
    const s3 = article("s3");
    const w1 = article("w1");
    const w2 = article("w2");
    const w3 = article("w3");
    expect(deskArticles([s1, s2, s3], "none", 2).length).toBe(2);
    expect(watchArticles([w1, w2, w3], "none").map((a) => a.id)).toEqual(["w1", "w2"]);
    expect(watchArticles([w1, w2], "w1").map((a) => a.id)).toEqual(["w2"]);
  });
});

describe("mergePool", () => {
  it("prefers the fresh pool order and appends known leftovers", () => {
    const a = article("a");
    const b = article("b");
    const c = article("c");
    expect(mergePool([a, b], [b, c]).map((x) => x.id)).toEqual(["b", "c", "a"]);
  });

  it("de-duplicates across both pools", () => {
    const a = article("a");
    expect(mergePool([a], [a]).length).toBe(1);
  });
});

describe("deskCandidates", () => {
  it("returns the first non-current articles of the pool", () => {
    const a = article("a");
    const b = article("b");
    const c = article("c");
    const d = article("d");
    expect(deskCandidates([a, b, c, d], "a").map((x) => x.id)).toEqual(["b", "c", "d"]);
    expect(deskCandidates([a, b, c], "b", 2).map((x) => x.id)).toEqual(["a", "c"]);
  });

  it("returns an empty list for a single-item pool", () => {
    expect(deskCandidates([article("a")], "a")).toEqual([]);
  });
});

describe("excludePoolFromSecondary", () => {
  it("removes all pool articles from secondary list", () => {
    const pool = [article("a"), article("b"), article("c")];
    const secondary = [article("b"), article("c"), article("d"), article("e")];
    const result = excludePoolFromSecondary(secondary, pool);
    expect(result.map((x) => x.id)).toEqual(["d", "e"]);
  });

  it("returns all secondary articles when pool is empty", () => {
    const pool: NewsArticle[] = [];
    const secondary = [article("a"), article("b")];
    const result = excludePoolFromSecondary(secondary, pool);
    expect(result.map((x) => x.id)).toEqual(["a", "b"]);
  });

  it("returns empty when all secondary articles are in pool", () => {
    const pool = [article("a"), article("b")];
    const secondary = [article("a"), article("b")];
    const result = excludePoolFromSecondary(secondary, pool);
    expect(result).toEqual([]);
  });
});

describe("buildNarration", () => {
  it("narrates the real article data in a deterministic order", () => {
    const a: NewsArticle = {
      ...article("a"),
      title: "Non-banking financial firm duped of Rs 12.84 cr; bank staff among 5 held",
      summary: "A concise factual summary based only on the actual source.",
      sourceName: "The Indian Express",
      category: "Financial Fraud",
      publishedAt: "2026-09-16T04:30:00.000Z",
      location: "Gujarat",
    };
    expect(buildNarration(a)).toBe(
      "Financial Fraud. Non-banking financial firm duped of Rs 12.84 cr; bank staff among 5 held. A concise factual summary based only on the actual source. According to The Indian Express. Published September 16, 2026. Location: Gujarat."
    );
  });

  it("sentence-cases an uppercase category but keeps short acronyms intact", () => {
    expect(buildNarration({ ...article("a"), category: "DIGITAL ARREST" })).toContain(
      "Digital Arrest."
    );
    expect(buildNarration({ ...article("a"), category: "UPI FRAUD" })).toContain("UPI Fraud.");
  });

  it("omits missing source, date and location without leaving blank segments", () => {
    const a = {
      ...article("a"),
      summary: "",
      sourceName: "",
      publishedAt: null,
      location: null,
      category: "",
    };
    expect(buildNarration(a)).toBe("Story a.");
  });
});