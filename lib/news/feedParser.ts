import {
  parseXml,
  childOf,
  childrenOf,
  nodeText,
  type XmlNode,
} from "./xml";
import { firstImageSrc, htmlToText } from "./text";
import type { RawFeedItem } from "./types";

export function parseFeedXml(xml: string): RawFeedItem[] {
  const root = parseXml(xml);
  if (!root) return [];
  if (root.name === "rss") return parseRss(root);
  if (root.name.toLowerCase() === "feed") return parseAtom(root);
  return [];
}

function parseRss(root: XmlNode): RawFeedItem[] {
  const channel = childOf(root, "channel");
  if (!channel) return [];
  const items = childrenOf(channel, "item");
  return items.map((item) => {
    const description = nodeText(childOf(item, "description"));
    const contentEncoded = nodeText(childOf(item, "encoded"));
    const contentNode = item.children.find((c) => c.name === "content" || c.name === "content:encoded");
    const content = contentNode ? nodeText(contentNode) : "";
    const allHtml = [contentEncoded, content, description].filter(Boolean).join(" ");
    const descText = htmlToText(description);
    const encText = htmlToText(contentEncoded || content);
    const html =
      descText.length >= 30
        ? description
        : encText.length >= 30
          ? contentEncoded || content
          : description || contentEncoded || content;

    const enclosure = childrenOf(item, "enclosure")[0];
    const mediaContent = childrenOf(item, "media:content")[0];
    const mediaThumbnail = childrenOf(item, "media:thumbnail")[0];
    const thumbnail = childrenOf(item, "thumbnail")[0];
    const imageUrl =
      enclosure?.attrs["url"] ??
      mediaContent?.attrs["url"] ??
      mediaThumbnail?.attrs["url"] ??
      thumbnail?.attrs["url"] ??
      firstImageSrc(allHtml);
    return {
      title: nodeText(childOf(item, "title")),
      summary: html,
      link: nodeText(childOf(item, "link")),
      publishedAtRaw: nodeText(childOf(item, "pubDate")),
      categories: childrenOf(item, "category").map((c) => nodeText(c)),
      imageUrl: imageUrl || null,
      idHint: nodeText(childOf(item, "guid")) || undefined,
    };
  });
}

function parseAtom(root: XmlNode): RawFeedItem[] {
  const entries = childrenOf(root, "entry");
  return entries.map((entry) => {
    const links = childrenOf(entry, "link");
    const alternate =
      links.find((l) => (l.attrs["rel"] || "alternate") === "alternate") ?? links[0];
    const content = childOf(entry, "content");
    const summary = childOf(entry, "summary");
    const media = content || summary;
    return {
      title: nodeText(childOf(entry, "title")),
      summary: media ? nodeText(media) : "",
      link: alternate?.attrs["href"] ?? "",
      publishedAtRaw: nodeText(childOf(entry, "published"))
        ? nodeText(childOf(entry, "published"))
        : nodeText(childOf(entry, "updated")),
      categories: childrenOf(entry, "category")
        .map((c) => c.attrs["label"] || c.attrs["term"] || "")
        .filter(Boolean),
      imageUrl: media ? firstImageSrc(nodeText(media)) : null,
      idHint: nodeText(childOf(entry, "id")) || undefined,
    };
  });
}

export function parsePublishedDate(raw: string): Date | null {
  if (!raw) return null;
  const d = new Date(raw.trim());
  return Number.isNaN(d.getTime()) ? null : d;
}