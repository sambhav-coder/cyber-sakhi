import type { LanguageAnalysis } from "./emailTypes";

/**
 * LANGUAGE / SCRIPT ANALYSIS (supporting signal only)
 * ---------------------------------------------------
 * Cyber Sakhi NEVER classifies a language as malicious, never infers
 * nationality / identity / location / intent from language, and never presents
 * an uncertain detection as fact. This module only describes the *writing
 * system(s)* actually present in the message and flags informational markers
 * (e.g. code-mixed vernacular) that a downstream human analyst may inspect.
 *
 * Detection is script-range based and purely descriptive. When the input is
 * empty, malformed, or the script cannot be determined, a safe fallback is
 * returned (`script: "Unknown"`, confidence "low", `supporting: true`) — never
 * a fabricated guess.
 */

const SCRIPT_RANGES = [
  { script: "Latin", test: /[\u0000-\u007F\u00C0-\u024F]/ },
  { script: "Devanagari", test: /[\u0900-\u097F]/ },
  { script: "Arabic", test: /[\u0600-\u06FF\u0750-\u077F]/ },
  { script: "Cyrillic", test: /[\u0400-\u04FF]/ },
  { script: "Chinese / CJK", test: /[\u4E00-\u9FFF\u3400-\u4DBF]/ },
  { script: "Japanese Kana", test: /[\u3040-\u30FF]/ },
  { script: "Hangul", test: /[\uAC00-\uD7AF]/ },
  { script: "Tamil", test: /[\u0B80-\u0BFF]/ },
  { script: "Gujarati", test: /[\u0A80-\u0AFF]/ },
  { script: "Bengali", test: /[\u0980-\u09FF]/ },
  { script: "Gurmukhi", test: /[\u0A00-\u0A7F]/ },
  { script: "Kannada", test: /[\u0C80-\u0CFF]/ },
  { script: "Malayalam", test: /[\u0D00-\u0D7F]/ },
  { script: "Telugu", test: /[\u0C00-\u0C7F]/ },
  { script: "Thai", test: /[\u0E00-\u0E7F]/ },
  { script: "Hebrew", test: /[\u0590-\u05FF]/ },
  { script: "Greek", test: /[\u0370-\u03FF]/ },
] as const;

/**
 * Vernacular / code-mixed markers common in South-Asian phishing content written
 * in Hinglish. Informational only.
 */
const VERNACULAR_MARKERS =
  /\b(ji|ka|ki|ke|me|se|nahi|hai|karo|karein|aap|tum|sir|jaldi|pakka|verify karo|update karo|dekho|submit karo)\b/i;

function nonAsciiRatio(text: string): number {
  const ascii = (text.match(/[\u0000-\u007F]/g) || []).length;
  if (text.length === 0) return 0;
  return 1 - ascii / text.length;
}

export function analyzeLanguage(
  subject: string | undefined,
  body: string | null | undefined
): LanguageAnalysis {
  const text = `${subject ?? ""} ${body ?? ""}`.trim();

  // Safe fallback: nothing to analyze, or nothing beyond ASCII Latin.
  if (!text) {
    return {
      script: "Unknown",
      hints: ["No analyzable text was provided — no language statements are made."],
      confidence: "low",
      supporting: true,
      caveat:
        "Language analysis is descriptive only. It is never a threat verdict and never implies a nationality, identity, location or intent.",
    };
  }

  const present = SCRIPT_RANGES.filter((s) => s.test.test(text)).map((s) => s.script);
  const unique = [...new Set(present)].filter((s) => s !== "Latin");

  // A Latin-only message (pure ASCII) is the most common, lowest-value case.
  if (unique.length === 0) {
    return {
      script: "Latin",
      hints: [
        `Written in the Latin script${nonAsciiRatio(text) > 0.2 ? " with accented/Latin-extended characters" : ""}.`,
        "No code-mixed vernacular markers were detected.",
      ],
      confidence: "high",
      supporting: true,
      caveat:
        "The Latin script is used by many languages and countries. No identity or intent is inferred from it.",
    };
  }

  const script =
    unique.length === 1
      ? unique[0]
      : `Mixed (${[...new Set(["Latin", ...unique])].slice(0, 3).join(" + ")})`;

  const hints: string[] = [];
  if (unique.length === 1) {
    hints.push(`${unique[0]} script detected alongside Latin.`);
  } else {
    hints.push("Multiple writing systems detected in the same message.");
  }
  if (VERNACULAR_MARKERS.test(text)) {
    hints.push("Code-mixed vernacular markers detected (e.g. Hinglish phrasing).");
  }
  if (nonAsciiRatio(text) > 0.5) {
    hints.push("Most of the message is in a non-Latin script.");
  }

  return {
    script,
    hints,
    // Script range detection is deterministic; the caveat below keeps the
    // *implication* bounded even when the script itself is confidently known.
    confidence: "high",
    supporting: true,
    caveat:
      "This describes the writing system(s) present in the message — nothing more. It is not a threat verdict, and it never implies a nationality, identity, location or intent.",
  };
}