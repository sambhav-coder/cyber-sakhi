import { decodeEntities } from "./xml";

const IMG_TAG_RE = /<img[^>]+src=["']([^"']+)["']/i;

export function htmlToText(html: string): string {
  if (!html) return "";
  let s = html
    .replace(/<(script|style)[\s\S]*?<\/\1>/gi, " ")
    .replace(/<br\s*\/?>/gi, "\n")
    .replace(/<\/(p|div|li|h[1-6]|tr)>/gi, "\n")
    .replace(/<\/?[^>]+>/g, " ")
    .replace(/&nbsp;/gi, " ")
    .replace(/\u200b/gi, "")
    .replace(/[\t ]+/g, " ")
    .replace(/\n\s*\n+/g, "\n");
  return decodeEntities(s).trim();
}

export function cleanSummary(html: string, maxLength = 300): string {
  const text = htmlToText(html).replace(/\n+/g, " ").trim();
  if (!text) return "";
  if (text.length <= maxLength) return text;
  const cut = text.slice(0, maxLength);
  const lastSentence = Math.max(cut.lastIndexOf(". "), cut.lastIndexOf("? "), cut.lastIndexOf("! "));
  if (lastSentence > 60) return `${cut.slice(0, lastSentence + 1).trim()}`;
  const lastSpace = cut.lastIndexOf(" ");
  return `${cut.slice(0, lastSpace > 40 ? lastSpace : maxLength).trim()}\u2026`;
}

export function firstImageSrc(html: string): string | null {
  if (!html) return null;
  const m = IMG_TAG_RE.exec(html);
  return m ? m[1] : null;
}

export function collapseSpaces(value: string): string {
  return value.replace(/\s+/g, " ").trim();
}