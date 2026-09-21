import { describe, expect, it } from "vitest";
import { parseXml, nodeText, childOf, childrenOf } from "@/lib/news/xml";
import {
  parseFeedXml,
  parsePublishedDate,
} from "@/lib/news/feedParser";

describe("xml parser", () => {
  it("parses RSS-shaped XML with namespaces, CDATA and entities", () => {
    const xml = `
      <rss version="2.0" xmlns:media="http://search.yahoo.com/mrss/" xmlns:atom="http://www.w3.org/2005/Atom">
        <channel>
          <title>Test &amp; Co. &quot;Feed&quot;</title>
          <item>
            <title>A &#8377;12,000 UPI scam &amp; digital arrest</title>
            <description><![CDATA[<p>She <b>lost money</b> in Bengaluru.</p>]]></description>
            <pubDate>Sat, 19 Sep 2026 08:36:35 +0000</pubDate>
            <link>https://example.com/story</link>
            <media:thumbnail url="https://example.com/img.jpg" />
            <enclosure url="https://example.com/encl.jpg" type="image/jpeg"/>
          </item>
        </channel>
      </rss>`;
    const root = parseXml(xml);
    expect(root?.name).toBe("rss");
    const channel = childOf(root, "channel");
    expect(nodeText(childOf(channel, "title"))).toBe('Test & Co. "Feed"');
    const item = childrenOf(channel, "item")[0];
    expect(nodeText(childOf(item, "title"))).toBe("A ₹12,000 UPI scam & digital arrest");
    expect(nodeText(childOf(item, "description"))).toBe("<p>She <b>lost money</b> in Bengaluru.</p>");
    expect(nodeText(childOf(item, "pubDate"))).toBe("Sat, 19 Sep 2026 08:36:35 +0000");
    expect(childOf(item, "media:thumbnail")?.attrs["url"]).toBe("https://example.com/img.jpg");
    expect(childOf(item, "enclosure")?.attrs["url"]).toBe("https://example.com/encl.jpg");
  });

  it("handles empty elements, self-closing tags and comments", () => {
    const xml = `<!-- header --><rss><channel><title></title><item><link/></item></channel></rss>`;
    const root = parseXml(xml);
    expect(root?.name).toBe("rss");
    const item = childrenOf(childOf(root, "channel"), "item")[0];
    expect(item?.children[0]?.name).toBe("link");
  });

  it("decodes numeric entities", () => {
    const xml = `<a><b>&#8377; &amp; &#x20B9;</b></a>`;
    const root = parseXml(xml);
    expect(nodeText(childOf(root, "b"))).toBe("₹ & ₹");
  });
});

describe("feed parser", () => {
  it("parses RSS 2.0 items with namespaces and media", () => {
    const xml = `<?xml version="1.0"?>
      <rss xmlns:media="http://search.yahoo.com/mrss/" xmlns:dc="http://purl.org/dc/elements/1.1/" version="2.0">
        <channel>
          <title>Feed</title>
          <item>
            <title>Man loses over ₹8 lakh in cyber fraud</title>
            <link>https://x.in/a</link>
            <description>Details of the SMS phishing case.</description>
            <pubDate>Mon, 07 Sep 2026 05:00:00 GMT</pubDate>
            <dc:creator>Reporter</dc:creator>
            <category>India</category>
            <guid isPermaLink="false">u1</guid>
            <media:content url="https://x.in/pic.jpg" medium="image"/>
          </item>
        </channel>
      </rss>`;
    const items = parseFeedXml(xml);
    expect(items).toHaveLength(1);
    expect(items[0].title).toBe("Man loses over ₹8 lakh in cyber fraud");
    expect(items[0].link).toBe("https://x.in/a");
    expect(items[0].imageUrl).toBe("https://x.in/pic.jpg");
    expect(items[0].categories).toEqual(["India"]);
    expect(items[0].idHint).toBe("u1");
  });

  it("pulls the first <img> from content:encoded when no media tag exists", () => {
    const xml = `<rss version="2.0"><channel><item>
      <title>Digital arrest scam</title>
      <link>https://y.in/b</link>
      <content:encoded xmlns:content="http://purl.org/rss/1.0/modules/content/"><![CDATA[<img src="https://y.in/lead.jpg" /><p>Body.</p>]]></content:encoded>
      <pubDate>Fri, 18 Sep 2026 03:00:00 +0000</pubDate>
    </item></channel></rss>`;
    const items = parseFeedXml(xml);
    expect(items[0].imageUrl).toBe("https://y.in/lead.jpg");
    expect(items[0].summary).toContain("lead.jpg");
  });

  it("parses Atom feeds", () => {
    const xml = `<?xml version="1.0"?><feed xmlns="http://www.w3.org/2005/Atom">
      <title>Test Feed</title>
      <entry>
        <title>UPI OTP fraud in Pune</title>
        <link rel="alternate" href="https://z.in/entry1"/>
        <summary>Summary here.</summary>
        <published>2026-09-18T09:00:00+05:30</published>
        <id>tag:z.in,2026:1</id>
      </entry>
    </feed>`;
    const items = parseFeedXml(xml);
    expect(items).toHaveLength(1);
    expect(items[0].link).toBe("https://z.in/entry1");
    expect(items[0].publishedAtRaw).toBe("2026-09-18T09:00:00+05:30");
  });

  it("returns empty for non-feed XML", () => {
    expect(parseFeedXml("<html></html>")).toEqual([]);
    expect(parseFeedXml("not xml at all")).toEqual([]);
  });
});

describe("parsePublishedDate", () => {
  it("parses RFC 822, GMT and ISO forms", () => {
    const rfc = parsePublishedDate("Sat, 19 Sep 2026 08:36:35 +0000");
    expect(rfc?.toISOString()).toBe("2026-09-19T08:36:35.000Z");
    const gmt = parsePublishedDate("Mon, 07 Sep 2026 05:00:00 GMT");
    expect(gmt?.toISOString()).toBe("2026-09-07T05:00:00.000Z");
    const iso = parsePublishedDate("2026-09-18T09:00:00+05:30");
    expect(iso?.toISOString()).toBe("2026-09-18T03:30:00.000Z");
  });

  it("returns null for invalid input", () => {
    expect(parsePublishedDate("")).toBeNull();
    expect(parsePublishedDate("tomorrow-ish")).toBeNull();
  });
});