/**
 * Entry language: the user's EN/HI choice made BEFORE any intro playback.
 *
 * Stored in sessionStorage so the hub, Chat, and Voice modes all inherit
 * the same default without a duplicate global language system. Rendering
 * layers read it at mount; nothing is ever auto-played before it resolves.
 */

export type EntryLang = "en" | "hi";

const STORAGE_KEY = "sakhi.entryLanguage";

interface MinimalStorage {
  getItem(key: string): string | null;
  setItem(key: string, value: string): void;
  removeItem(key: string): void;
}

function browserStorage(): MinimalStorage | null {
  try {
    if (typeof window !== "undefined" && window.sessionStorage) {
      return window.sessionStorage;
    }
  } catch {
    /* private mode / SSR: no storage available */
  }
  return null;
}

/** Stored choice, or null when the user has not chosen yet (gate must show). */
export function getEntryLanguage(storage?: MinimalStorage | null): EntryLang | null {
  const store = storage === undefined ? browserStorage() : storage;
  if (!store) return null;
  try {
    const raw = store.getItem(STORAGE_KEY);
    return raw === "hi" ? "hi" : raw === "en" ? "en" : null;
  } catch {
    return null;
  }
}

/** Persist the user's choice. Silent no-op when storage is unavailable. */
export function setEntryLanguage(lang: EntryLang, storage?: MinimalStorage | null): void {
  const store = storage === undefined ? browserStorage() : storage;
  if (!store) return;
  try {
    store.setItem(STORAGE_KEY, lang);
  } catch {
    /* ignore write failures; the choice still applies to this view */
  }
}

/** Clear the stored choice (shows the gate again). */
export function clearEntryLanguage(storage?: MinimalStorage | null): void {
  const store = storage === undefined ? browserStorage() : storage;
  if (!store) return;
  try {
    store.removeItem(STORAGE_KEY);
  } catch {
    /* noop */
  }
}

/**
 * Resolve the effective default language: explicit override (e.g. `?lang=`)
 * wins, then the stored entry choice, then English. Pure — unit-tested.
 */
export function resolveEntryLanguage(
  stored: EntryLang | null,
  queryParam?: string | null
): EntryLang {
  if (queryParam === "hi" || queryParam === "en") return queryParam;
  if (stored === "hi" || stored === "en") return stored;
  return "en";
}
