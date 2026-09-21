import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { normalizeEmailText, tokenize } from "../../lib/ml/tokenizer";

const FIXTURE = join(process.cwd(), "tests", "fixtures", "ml", "tokenize_cases.json");

interface TokenizeCase {
  input: string;
  normalized: string;
  tokens: string[];
}

const cases = (JSON.parse(readFileSync(FIXTURE, "utf-8")) as {
  cases: TokenizeCase[];
}).cases;

describe("tokenizer parity with scripts/ml/common.py", () => {
  it("has fixture cases", () => {
    expect(cases.length).toBeGreaterThan(0);
  });

  it("matches Python normalize_email_text for every fixture input", () => {
    for (const c of cases) {
      expect(normalizeEmailText(c.input)).toBe(c.normalized);
    }
  });

  it("matches Python tokenize for every fixture input", () => {
    for (const c of cases) {
      const normalized = normalizeEmailText(c.input);
      expect(tokenize(normalized)).toEqual(c.tokens);
    }
  });
});

describe("tokenizer invariants", () => {
  it("drops tokens shorter than two characters", () => {
    expect(tokenize(normalizeEmailText("a b cd ef"))).not.toContain("a");
    expect(tokenize(normalizeEmailText("a b cd ef"))).not.toContain("b");
    expect(tokenize(normalizeEmailText("a b cd ef"))).toContain("cd");
    expect(tokenize(normalizeEmailText("a b cd ef"))).toContain("ef");
  });

  it("keeps placeholder tokens intact and never pairs them into bigrams", () => {
    const tokens = tokenize("__url__ login __email__ verify");
    expect(tokens).toContain("__url__");
    expect(tokens).toContain("__email__");
    expect(tokens).not.toContain("__url__ login");
    expect(tokens).not.toContain("__email__ verify");
  });

  it("builds unigrams + adjacent-word bigrams", () => {
    const tokens = tokenize(normalizeEmailText("dear customer account suspended"));
    expect(tokens).toContain("dear customer");
    expect(tokens).toContain("customer account");
    expect(tokens).toContain("account suspended");
  });

  it("normalizes urls/emails/phones/numbers into placeholders", () => {
    const norm = normalizeEmailText(
      "see https://bit.ly/x or www.example.com mail a@b.co ph 9812345670 cost 1,299.50"
    );
    expect(norm).toContain("__url__");
    expect(norm).toContain("__email__");
    expect(norm).toContain("__phone__");
    expect(norm).toContain("__num__");
  });
});