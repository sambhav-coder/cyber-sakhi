import { describe, expect, it } from "vitest";
import {
  clearEntryLanguage,
  getEntryLanguage,
  resolveEntryLanguage,
  setEntryLanguage,
} from "../../lib/entryLanguage";

function memoryStore(initial: Record<string, string> = {}) {
  const data = { ...initial };
  return {
    getItem: (k: string) => (k in data ? data[k] : null),
    setItem: (k: string, v: string) => {
      data[k] = v;
    },
    removeItem: (k: string) => {
      delete data[k];
    },
    snapshot: () => ({ ...data }),
  };
}

describe("entry language gate", () => {
  it("starts unresolved (gate must show) with empty storage", () => {
    expect(getEntryLanguage(memoryStore())).toBeNull();
  });

  it("persists and reads back the user's choice", () => {
    const store = memoryStore();
    setEntryLanguage("hi", store);
    expect(getEntryLanguage(store)).toBe("hi");
    expect(store.snapshot()["sakhi.entryLanguage"]).toBe("hi");
    setEntryLanguage("en", store);
    expect(getEntryLanguage(store)).toBe("en");
  });

  it("clears the choice (gate shows again)", () => {
    const store = memoryStore();
    setEntryLanguage("hi", store);
    clearEntryLanguage(store);
    expect(getEntryLanguage(store)).toBeNull();
  });

  it("rejects garbage values instead of inventing a language", () => {
    expect(getEntryLanguage(memoryStore({ "sakhi.entryLanguage": "fr" }))).toBeNull();
    expect(getEntryLanguage(memoryStore({ "sakhi.entryLanguage": "" }))).toBeNull();
  });

  it("returns null without storage (SSR/private mode)", () => {
    expect(getEntryLanguage(null)).toBeNull();
    expect(() => setEntryLanguage("hi", null)).not.toThrow();
  });
});

describe("resolveEntryLanguage — explicit override, stored choice, default", () => {
  it("an explicit override wins", () => {
    expect(resolveEntryLanguage("en", "hi")).toBe("hi");
    expect(resolveEntryLanguage("hi", "en")).toBe("en");
    expect(resolveEntryLanguage(null, "hi")).toBe("hi");
  });

  it("falls back to the stored entry choice", () => {
    expect(resolveEntryLanguage("hi", null)).toBe("hi");
    expect(resolveEntryLanguage("en", undefined)).toBe("en");
  });

  it("defaults to English when nothing is resolved", () => {
    expect(resolveEntryLanguage(null, null)).toBe("en");
    expect(resolveEntryLanguage(null, "fr")).toBe("en");
  });
});
