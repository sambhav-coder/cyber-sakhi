/**
 * Dependency-free document text extraction for Sakhi companion uploads.
 *
 * Honest by design:
 *  - TXT/CSV/JSON/HTML/logs  -> direct text decode.
 *  - PDF                     -> best-effort FlateDecode (zlib) text extraction.
 *                               Image-only / scanned PDFs report "no text".
 *  - DOCX / XLSX             -> minimal ZIP reader + XML stripping.
 *  - Images / audio / video  -> content is null with an honest note: OCR and
 *                               transcription are not built in — Sakhi never
 *                               pretends it "read" or "heard" a file it cannot.
 *  - Anything else           -> honest unsupported note.
 *
 * Never runs macros, never opens links, never executes anything.
 */

import { inflateSync, inflateRawSync } from "zlib";

export type ExtractedKind =
  | "text"
  | "csv"
  | "json"
  | "html"
  | "pdf"
  | "docx"
  | "xlsx"
  | "image"
  | "audio"
  | "video"
  | "binary";

export interface ExtractedFile {
  name: string;
  size: number;
  mimeType: string | null;
  kind: ExtractedKind;
  /** Extracted text, or null when extraction is not possible/honest. */
  content: string | null;
  /** Human reason when content is null (never a fabricated success). */
  note: string | null;
  contentLength: number;
  preview: string;
}

const MAX_EXTRACT_CHARS = 120000;
const PREVIEW_CHARS = 220;

function extension(name: string): string {
  const idx = name.lastIndexOf(".");
  return idx >= 0 ? name.slice(idx + 1).toLowerCase() : "";
}

function mimeFromExt(name: string): string | null {
  const map: Record<string, string> = {
    txt: "text/plain", csv: "text/csv", json: "application/json", md: "text/markdown",
    log: "text/plain", xml: "application/xml", yml: "text/yaml", yaml: "text/yaml",
    srt: "text/plain", vtt: "text/plain", eml: "message/rfc822", ics: "text/calendar",
    html: "text/html", htm: "text/html", pdf: "application/pdf",
    docx: "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
    xlsx: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
    png: "image/png", jpg: "image/jpeg", jpeg: "image/jpeg", gif: "image/gif",
    webp: "image/webp", heic: "image/heic", svg: "image/svg+xml",
    mp3: "audio/mpeg", wav: "audio/wav", m4a: "audio/mp4", ogg: "audio/ogg",
    mp4: "video/mp4", mov: "video/quicktime", webm: "video/webm", avi: "video/x-msvideo", mkv: "video/x-matroska",
  };
  return map[extension(name)] || null;
}

export type ExtractedKindFromExt = Exclude<ExtractedKind, "text" | "csv" | "json" | "html" | "pdf" | "docx" | "xlsx">;

function kindFromExt(name: string): ExtractedKind {
  const ext = extension(name);
  const textLikes = ["txt", "md", "log", "srt", "vtt", "eml", "ics", "xml", "yml", "yaml"];
  const csvLikes = ["csv", "tsv"];
  const jsonLikes = ["json"];
  const htmlLikes = ["html", "htm"];
  const imageLikes = ["png", "jpg", "jpeg", "gif", "webp", "heic", "bmp", "svg"];
  const audioLikes = ["mp3", "wav", "m4a", "ogg", "aac", "flac"];
  const videoLikes = ["mp4", "mov", "webm", "avi", "mkv", "3gp"];

  if (textLikes.includes(ext)) return "text";
  if (csvLikes.includes(ext)) return "csv";
  if (jsonLikes.includes(ext)) return "json";
  if (htmlLikes.includes(ext)) return "html";
  if (ext === "pdf") return "pdf";
  if (ext === "docx") return "docx";
  if (ext === "xlsx") return "xlsx";
  if (imageLikes.includes(ext)) return "image";
  if (audioLikes.includes(ext)) return "audio";
  if (videoLikes.includes(ext)) return "video";
  return "binary";
}

function pump(bytes: Uint8Array | ArrayBuffer): Buffer {
  if (bytes instanceof ArrayBuffer) return Buffer.from(bytes);
  return Buffer.from(bytes.buffer, bytes.byteOffset, bytes.byteLength);
}

function cleanWhitespace(text: string): string {
  return text.replace(/\r\n/g, "\n").replace(/[ \t]+/g, " ").replace(/\n{3,}/g, "\n\n").trim();
}

function decodeEntities(text: string): string {
  return text
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/&nbsp;/g, " ");
}

function finalizeResult(name: string, buf: Buffer, kind: ExtractedKind, mimeType: string | null, content: string | null, note: string | null): ExtractedFile {
  const capped = content ? content.slice(0, MAX_EXTRACT_CHARS) : null;
  let finalContent = capped;
  let finalNote = note;
  if (capped !== null && capped.trim().length === 0) {
    finalContent = null;
    finalNote = finalNote || "No extractable text was found in this file.";
  }
  return {
    name,
    size: buf.length,
    mimeType,
    kind,
    content: finalContent,
    note: finalNote,
    contentLength: finalContent ? finalContent.length : 0,
    preview: finalContent ? finalContent.slice(0, PREVIEW_CHARS) : (finalNote || "").slice(0, PREVIEW_CHARS),
  };
}

// ---- PDF (best effort, zlib FlateDecode only) ---------------------------------

function extractPdfText(buf: Buffer): { content: string | null; note: string | null } {
  const latin = buf.toString("latin1");
  const chunks: string[] = [];

  const streamRe = /stream\r?\n([\s\S]*?)endstream/g;
  let m: RegExpExecArray | null;
  while ((m = streamRe.exec(latin)) !== null) {
    let raw: Buffer;
    try {
      raw = inflateSync(Buffer.from(m[1], "latin1"));
    } catch {
      continue;
    }
    const decoded = raw.toString("latin1");
    const toks: string[] = [];
    const tj = /\(((?:[^()\\]|\\.)*)\)\s*Tj/g;
    const tja = /\[((?:[^\]\\]|\\.)*)\]\s*TJ/g;
    let s: RegExpExecArray | null;
    const cleanToken = (part: string) =>
      part
        .replace(/\\([nrtbf()\\])/g, (_, c: string) =>
          c === "n" ? "\n" : c === "r" ? "\r" : c === "t" ? " " : " "
        )
        .trim();
    while ((s = tj.exec(decoded)) !== null) toks.push(cleanToken(s[1]));
    while ((s = tja.exec(decoded)) !== null) {
      const inner = /\(((?:[^()\\]|\\.)*)\)/g;
      let t: RegExpExecArray | null;
      while ((t = inner.exec(s[1])) !== null) toks.push(cleanToken(t[1]));
    }
    if (toks.length < 3) {
      // Fallback: any literal string token in the stream.
      const loose = /\(((?:[^()\\]|\\.)*)\)/g;
      let t: RegExpExecArray | null;
      while ((t = loose.exec(decoded)) !== null) toks.push(cleanToken(t[1]));
    }
    if (toks.length) chunks.push(toks.filter(Boolean).join(" "));
  }

  const text = cleanWhitespace(chunks.join("\n\n"));
  if (!text) {
    return {
      content: null,
      note: "This PDF has no text layer (it may be a scanned document). Image OCR is not available — describe what it shows, or export the text from the original app.",
    };
  }
  return { content: text, note: null };
}

// ---- Minimal ZIP reader (ZIP64 unsupported — rejects clearly) -----------------

function zipFindEntry(buf: Buffer, target: string): Buffer | null {
  let offset = 0;
  while (offset + 30 <= buf.length) {
    const sig = buf.readUInt32LE(offset);
    if (sig !== 0x04034b50) {
      offset += 1;
      continue;
    }
    const method = buf.readUInt16LE(offset + 8);
    const nameLen = buf.readUInt16LE(offset + 26);
    const extraLen = buf.readUInt16LE(offset + 28);
    const compSize = buf.readUInt32LE(offset + 18);
    const name = buf.toString("utf8", offset + 30, offset + 30 + nameLen);
    const dataStart = offset + 30 + nameLen + extraLen;
    if (name === target || name.replace(/\\/g, "/").endsWith(target)) {
      const data = buf.subarray(dataStart, dataStart + compSize);
      if (method === 0) return data;
      if (method === 8) {
        try {
          return inflateRawSync(data);
        } catch {
          return null;
        }
      }
      return null;
    }
    offset = dataStart + compSize;
  }
  return null;
}

function stripXmlToText(xml: Buffer): string {
  let s = xml.toString("utf8");
  s = s.replace(/<\/w:p>/g, "\n").replace(/<\/row>/g, "\n").replace(/<[^>]+>/g, " ");
  s = decodeEntities(s);
  return cleanWhitespace(s);
}

function extractDocx(buf: Buffer): { content: string | null; note: string | null } {
  const doc = zipFindEntry(buf, "word/document.xml");
  if (!doc) return { content: null, note: "Could not read the DOCX structure — no text extracted." };
  const text = stripXmlToText(doc);
  return text
    ? { content: text, note: null }
    : { content: null, note: "The DOCX contains no readable text." };
}

function extractXlsx(buf: Buffer): { content: string | null; note: string | null } {
  const parts: string[] = [];
  const shared = zipFindEntry(buf, "xl/sharedStrings.xml");
  if (shared) {
    const s = shared.toString("utf8").replace(/<[^>]+>/g, " ");
    const cleaned = cleanWhitespace(decodeEntities(s));
    if (cleaned) parts.push("Shared strings: " + cleaned);
  }
  const sheet = zipFindEntry(buf, "xl/worksheets/sheet1.xml");
  if (sheet) {
    const s = sheet.toString("utf8").replace(/<\/row>/g, "\n").replace(/<[^>]+>/g, " ");
    const cleaned = cleanWhitespace(decodeEntities(s));
    if (cleaned) parts.push("First sheet: " + cleaned);
  }
  const text = parts.join("\n");
  return text
    ? { content: text, note: "Best-effort spreadsheet text — check against the original file for numbers and cell layout." }
    : { content: null, note: "Could not read the XLSX contents as text." };
}

// ---- Entry point --------------------------------------------------------------

export function extractTextFromFile(input: {
  name: string;
  mimeType?: string;
  buffer: Uint8Array | ArrayBuffer;
}): ExtractedFile {
  const buf = pump(input.buffer);
  const name = input.name || "file";
  const extKind = kindFromExt(name);
  const mimeGuess = input.mimeType || mimeFromExt(name);
  const kind = extKind;

  switch (kind) {
    case "text":
    case "csv":
    case "json": {
      const content = cleanWhitespace(buf.toString("utf8").slice(0, MAX_EXTRACT_CHARS));
      return finalizeResult(name, buf, kind, mimeGuess, content, null);
    }
    case "html": {
      let s = buf.toString("utf8");
      s = s.replace(/<script[\s\S]*?<\/script>/gi, " ");
      s = s.replace(/<style[\s\S]*?<\/style>/gi, " ");
      s = s.replace(/<[^>]+>/g, " ");
      const content = cleanWhitespace(decodeEntities(s).slice(0, MAX_EXTRACT_CHARS));
      return finalizeResult(name, buf, kind, mimeGuess, content, null);
    }
    case "pdf": {
      const { content, note } = extractPdfText(buf);
      return finalizeResult(name, buf, kind, mimeGuess, content, note);
    }
    case "docx": {
      const { content, note } = extractDocx(buf);
      return finalizeResult(name, buf, kind, mimeGuess, content, note);
    }
    case "xlsx": {
      const { content, note } = extractXlsx(buf);
      return finalizeResult(name, buf, kind, mimeGuess, content, note);
    }
    case "image":
      return finalizeResult(
        name, buf, kind, mimeGuess, null,
        "Image OCR is not available — I can't 'read' the pixels. Describe what the screenshot shows, or paste the text in the chat."
      );
    case "audio":
      return finalizeResult(
        name, buf, kind, mimeGuess, null,
        "Automatic transcription of uploaded audio is not available on this setup. Use Voice Mode (on-device speech recognition) or describe what you heard."
      );
    case "video":
      return finalizeResult(
        name, buf, kind, mimeGuess, null,
        "Video content is not transcribed on this setup. Describe or paste the relevant text/audio content."
      );
    default:
      return finalizeResult(
        name, buf, kind, mimeGuess, null,
        "This file type is not supported for text extraction. If it's evidence, you can still seal it in the Evidence Locker — I just can't read its contents."
      );
  }
}

/** Helper for the upload route: rough start-of-text preview for display metadata. */
export function fileKindLabel(kind: ExtractedKind): string {
  switch (kind) {
    case "text": case "csv": case "json": case "html": return "Text document";
    case "pdf": return "PDF";
    case "docx": return "Word document";
    case "xlsx": return "Excel spreadsheet";
    case "image": return "Image";
    case "audio": return "Audio";
    case "video": return "Video";
    default: return "File";
  }
}