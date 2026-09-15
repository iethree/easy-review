/**
 * Bounded TTL cache. Diffs are keyed by head SHA, so entries are immutable and
 * the TTL only exists to bound memory, not correctness.
 */

interface Entry<T> {
  value: T;
  expires: number;
}

export class TtlCache<T> {
  private readonly map = new Map<string, Entry<T>>();

  constructor(
    private readonly maxEntries = 200,
    private readonly ttlMs = 10 * 60 * 1000,
  ) {}

  get(key: string): T | undefined {
    const hit = this.map.get(key);
    if (!hit) return undefined;
    if (hit.expires < Date.now()) {
      this.map.delete(key);
      return undefined;
    }
    // Refresh recency for the LRU eviction below.
    this.map.delete(key);
    this.map.set(key, hit);
    return hit.value;
  }

  set(key: string, value: T): void {
    if (this.map.has(key)) this.map.delete(key);
    this.map.set(key, { value, expires: Date.now() + this.ttlMs });
    while (this.map.size > this.maxEntries) {
      const oldest = this.map.keys().next();
      if (oldest.done) break;
      this.map.delete(oldest.value);
    }
  }

  clear(): void {
    this.map.clear();
  }

  get size(): number {
    return this.map.size;
  }
}
