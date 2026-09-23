import { describe, expect, it } from "vitest";
import { createNewsService } from "@/lib/news/service";
import type { FeedConfig, FetcherLike } from "@/lib/news/types";

const feedA: FeedConfig = {
  id: "a",
  name: "Source A",
  kind: "news",
  feedUrl: "https://a.example/rss",
};
const feedB: FeedConfig = {
  id: "b",
  name: "Source B",
  kind: "news",
  feedUrl: "https://b.example/rss",
};

function rssDoc(items: string): string {
  return `<?xml version="1.0"?><rss version="2.0"><channel><title>T</title><link>https://t</link>${items}</channel></rss>`;
}

function rssItem(opts: {
  title: string;
  date: string;
  desc?: string;
  link?: string;
}): string {
  const link = opts.link ?? `https://x.in/${encodeURIComponent(opts.title)}`;
  const desc =
    opts.desc ?? "police say this was a cyber fraud and investigation is under way";
  return `<item><title>${opts.title}</title><link>${link}</link><pubDate>${opts.date}</pubDate><description>${desc}</description></item>`;
}

function makeFetcher(
  map: Record<string, string>,
  failUrls: Set<string> = new Set()
): FetcherLike {
  return async (url: string) => {
    if (failUrls.has(url)) throw new Error("network down");
    const xml = map[url];
    if (!xml) return { ok: false, text: async () => "" } as unknown as Response;
    return { ok: true, text: async () => xml } as unknown as Response;
  };
}

function fakeClock(initialIso = "2026-09-19T12:00:00Z") {
  let ms = Date.parse(initialIso);
  return {
    now: () => new Date(ms),
    advance: (deltaMs: number) => {
      ms += deltaMs;
    },
  };
}

describe("news service", () => {
  it("fetches, filters irrelevant items, sorts newest first and slices edition sections", async () => {
    const clock = fakeClock();
    const items = rssDoc(
      rssItem({
        title: "Monsoon rains across Kerala",
        date: "2026-09-19T00:00:00Z",
        desc: "rain brought waterlogging to coastal towns",
      }) +
        rssItem({
          title: "Woman loses Rs 24 crore in digital arrest scam",
          date: "2026-09-18T00:00:00Z",
          desc: "digital arrest fraud, police investigation ongoing",
        }) +
        rssItem({
          title: "UPI OTP fraud man duped in Hyderabad",
          date: "2026-09-10T00:00:00Z",
          desc: "otp phishing siphoned his savings",
        }) +
        rssItem({
          title: "Vintage car auction draws big crowd",
          date: "2026-09-17T00:00:00Z",
          desc: "collectors gathered for the annual show",
        }) +
        rssItem({
          title: "SIM swap drains bank accounts in Nagpur",
          date: "2026-09-05T00:00:00Z",
        })
    );
    const service = createNewsService({
      feeds: [feedA],
      fetcher: makeFetcher({ [feedA.feedUrl]: items }),
      now: clock.now,
      ttlMs: 60_000,
    });
    const edition = await service.getEdition();
    expect(edition.cacheStatus).toBe("live");
    expect(edition.feedsTotal).toBe(1);
    expect(edition.feedsOk).toBe(1);
    expect(edition.articles).toHaveLength(3);
    expect(edition.lead?.title).toBe("Woman loses Rs 24 crore in digital arrest scam");
    expect(edition.lead?.category).toBe("Digital arrest");
    expect(edition.stories.map((s) => s.title)).toEqual([
      "UPI OTP fraud man duped in Hyderabad",
      "SIM swap drains bank accounts in Nagpur",
    ]);
    expect(
      edition.articles.map((a) => a.publishedAt).every((d) => typeof d === "string")
    ).toBe(true);
  });

  it("deduplicates identical stories across feeds", async () => {
    const doc = rssDoc(
      rssItem({
        title: "Same digital arrest story everywhere",
        date: "2026-09-18T00:00:00Z",
      })
    );
    const service = createNewsService({
      feeds: [feedA, feedB],
      fetcher: makeFetcher({ [feedA.feedUrl]: doc, [feedB.feedUrl]: doc }),
    });
    const edition = await service.getEdition();
    expect(edition.articles).toHaveLength(1);
  });

  it("serves cached data within TTL and refetches after expiry", async () => {
    const clock = fakeClock();
    const firstDoc = rssDoc(
      rssItem({ title: "First cyber story today", date: "2026-09-19T11:00:00Z" })
    );
    const secondDoc = rssDoc(
      rssItem({ title: "Breaking second cyber story", date: "2026-09-19T11:30:00Z" })
    );
    const urls: Record<string, string> = { [feedA.feedUrl]: firstDoc };
    const service = createNewsService({
      feeds: [feedA],
      fetcher: makeFetcher(urls),
      now: clock.now,
      ttlMs: 15 * 60 * 1000,
    });

    const first = await service.getEdition();
    expect(first.cacheStatus).toBe("live");
    expect(first.lead?.title).toBe("First cyber story today");

    const cached = await service.getEdition();
    expect(cached.cacheStatus).toBe("cached");
    expect(cached.fetchedAt).toBe(first.fetchedAt);
    expect(cached.lead?.title).toBe("First cyber story today");

    clock.advance(20 * 60 * 1000);
    urls[feedA.feedUrl] = secondDoc;
    const refreshed = await service.getEdition();
    expect(refreshed.cacheStatus).toBe("live");
    expect(refreshed.lead?.title).toBe("Breaking second cyber story");
  });

  it("reports offline when every feed fails and no cache exists", async () => {
    const service = createNewsService({
      feeds: [feedA],
      fetcher: makeFetcher({}, new Set([feedA.feedUrl])),
    });
    const edition = await service.getEdition();
    expect(edition.cacheStatus).toBe("offline");
    expect(edition.feedsOk).toBe(0);
    expect(edition.lead).toBeNull();
    expect(edition.articles).toHaveLength(0);
  });

  it("falls back to a cached edition when a refresh fails", async () => {
    const clock = fakeClock();
    const doc = rssDoc(
      rssItem({ title: "Cached digital arrest story", date: "2026-09-19T10:00:00Z" })
    );
    const failUrls = new Set<string>();
    const service = createNewsService({
      feeds: [feedA],
      fetcher: makeFetcher({ [feedA.feedUrl]: doc }, failUrls),
      now: clock.now,
      ttlMs: 15 * 60 * 1000,
    });

    await service.getEdition();
    clock.advance(30 * 60 * 1000);
    failUrls.add(feedA.feedUrl);
    const edition = await service.getEdition();
    expect(edition.cacheStatus).toBe("cached");
    expect(edition.feedsOk).toBe(0);
    expect(edition.lead?.title).toBe("Cached digital arrest story");
  });

  it("drops stale stories beyond the freshness window", async () => {
    const clock = fakeClock();
    const doc = rssDoc(
      rssItem({
        title: "Very old cyber fraud story",
        date: "2024-06-01T00:00:00Z",
      })
    );
    const service = createNewsService({
      feeds: [feedA],
      fetcher: makeFetcher({ [feedA.feedUrl]: doc }),
      now: clock.now,
      maxAgeDays: 30,
    });
    const edition = await service.getEdition();
    expect(edition.articles).toHaveLength(0);
    expect(edition.lead).toBeNull();
  });

  it("keeps moderately aged stories when nothing fresher exists", async () => {
    const clock = fakeClock();
    const doc = rssDoc(
      rssItem({
        title: "Four-month-old account takeover case",
        date: "2026-05-20T00:00:00Z",
      })
    );
    const service = createNewsService({
      feeds: [feedA],
      fetcher: makeFetcher({ [feedA.feedUrl]: doc }),
      now: clock.now,
      maxAgeDays: 30,
    });
    const edition = await service.getEdition();
    expect(edition.articles).toHaveLength(1);
    expect(edition.lead?.title).toBe("Four-month-old account takeover case");
  });

  it("builds a Hindi edition from original-Hindi feeds with language tags", async () => {
    const clock = fakeClock();
    const hiFeed: FeedConfig = {
      id: "hindi-test",
      name: "Hindi Test Source",
      kind: "news",
      feedUrl: "https://hindi.example/rss",
      language: "hi",
    };
    const doc = rssDoc(
      rssItem({
        title: "ऑनलाइन ठगी में युवक से लाखों की धोखाधड़ी",
        date: "2026-09-19T00:00:00Z",
        desc: "पुलिस ने मामला दर्ज कर जांच शुरू कर दी है, साइबर सेल सक्रिय",
        link: "https://hindi.example/story-1",
      })
    );
    const service = createNewsService({
      feeds: [hiFeed],
      fetcher: makeFetcher({ [hiFeed.feedUrl]: doc }),
      now: clock.now,
    });
    const edition = await service.getEdition({ language: "hi" });
    expect(edition.language).toBe("hi");
    expect(edition.cacheStatus).toBe("live");
    expect(edition.articles).toHaveLength(1);
    expect(edition.lead?.language).toBe("hi");
    expect(edition.lead?.title).toContain("ऑनलाइन ठगी");
  });

  it("keeps English and Hindi caches strictly separate", async () => {
    const clock = fakeClock();
    const enDoc = rssDoc(
      rssItem({ title: "English digital arrest story", date: "2026-09-19T00:00:00Z" })
    );
    const hiFeed: FeedConfig = {
      id: "hindi-test",
      name: "Hindi Test Source",
      kind: "news",
      feedUrl: "https://hindi.example/rss",
      language: "hi",
    };
    const hiDoc = rssDoc(
      rssItem({
        title: "डिजिटल अरेस्ट बताकर ठगी",
        date: "2026-09-19T00:00:00Z",
        desc: "पुलिस जांच कर रही है",
        link: "https://hindi.example/story-2",
      })
    );
    const service = createNewsService({
      feeds: [feedA, hiFeed],
      fetcher: makeFetcher({ [feedA.feedUrl]: enDoc, [hiFeed.feedUrl]: hiDoc }),
      now: clock.now,
    });
    const en = await service.getEdition({ language: "en" });
    const hi = await service.getEdition({ language: "hi" });
    expect(en.language).toBe("en");
    expect(hi.language).toBe("hi");
    expect(hi.lead?.language).toBe("hi");
    const cachedHi = await service.getEdition({ language: "hi" });
    expect(cachedHi.cacheStatus).toBe("cached");
    expect(cachedHi.lead?.title).toBe(hi.lead?.title);
  });
});