import { describe, expect, it } from "vitest";
import { filterMemoryForModel } from "../../lib/db/sakhiMemory";

describe("filterMemoryForModel — no language pin leakage into prompts", () => {
  it("drops sakhi.language* rows so a past preference can't force a turn", () => {
    const rows = [
      { key: "sakhi.language", value: "hi" },
      { key: "sakhi.language_pinned", value: "hinglish" },
      { key: "sakhi.preferred_safety_topics", value: "fraud" },
    ];
    expect(filterMemoryForModel(rows).map((r) => r.key)).toEqual([
      "sakhi.preferred_safety_topics",
    ]);
  });

  it("keeps every non-language for the model when nothing is filtered", () => {
    const rows = [
      { key: "case.CS-2026-000001.stage", value: "email-forensics" },
      { key: "sakhi.preferred_safety_topics", value: "fraud" },
    ];
    expect(filterMemoryForModel(rows)).toEqual(rows);
  });

  it("is a pure function — the original array is untouched", () => {
    const rows = [
      { key: "sakhi.language", value: "hi" },
      { key: "case.CS-2026-000001.stage", value: "email-forensics" },
    ];
    filterMemoryForModel(rows);
    expect(rows.length).toBe(2);
    expect(rows[0].key).toBe("sakhi.language");
  });
});