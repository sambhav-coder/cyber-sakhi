/**
 * Shared in-memory LRU/TTL cache used by network-intelligence lookups so a
 * batch of emails re-analyzed in one process does not hammer the same IP or
 * domain twice. Bounded and per-process; never written to disk.
 */

export interface CacheEntry<V> {
  at: number;
  value: V;
}

export class TtlLruCache<V> {
  private map = new Map<string, CacheEntry<V>>();

  constructor(
    private readonly ttlMs = 60_000,
    private readonly maxEntries = 512,
    private readonly now: () => number = Date.now
  ) {}

  get(key: string): V | undefined {
    const entry = this.map.get(key);
    if (!entry) return undefined;
    if (this.now() - entry.at > this.ttlMs) {
      this.map.delete(key);
      return undefined;
    }
    this.map.delete(key);
    this.map.set(key, entry); // LRU touch
    return entry.value;
  }

  set(key: string, value: V): void {
    this.map.delete(key);
    this.map.set(key, { at: this.now(), value });
    if (this.map.size > this.maxEntries) {
      const oldest = this.map.keys().next().value;
      if (oldest != null) this.map.delete(oldest);
    }
  }

  clear(): void {
    this.map.clear();
  }

  get size(): number {
    return this.map.size;
  }
}

/** Smallest unit usable across modules. */
export const geoCache = new TtlLruCache<Record<string, unknown>>(60_000, 512);