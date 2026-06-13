/**
 * A simple, in-memory cache for storing similarity scores between entities.
 *
 * It provides O(1) retrieval and handles symmetric keys.
 */
export class SimilarityCache {
  private readonly cache = new Map<string, number>();
  private readonly index = new Map<string, Set<string>>();
  private readonly keyToIds = new Map<string, [string, string]>();

  /**
   * Constructs a new SimilarityCache.
   *
   * @param maxEntries Optional capacity limit. If exceeded, oldest entries are evicted (LRU).
   */
  constructor(private readonly maxEntries?: number) {}

  /**
   * Generates a symmetric cache key for a pair of identifiers.
   *
   * @param id1 The first identifier.
   * @param id2 The second identifier.
   * @returns The symmetric cache key.
   */
  private getCacheKey(id1: string, id2: string): string {
    return id1 < id2 ? `${id1}:${id2}` : `${id2}:${id1}`;
  }

  /**
   * Retrieves a similarity score from the cache.
   * Updates access order for LRU if cached.
   *
   * @param id1 The first identifier.
   * @param id2 The second identifier.
   * @returns The cached score, or undefined if not cached.
   */
  public get(id1: string, id2: string): number | undefined {
    const key = this.getCacheKey(id1, id2);
    const score = this.cache.get(key);
    if (score !== undefined) {
      // Refresh insertion order for LRU
      this.cache.delete(key);
      this.cache.set(key, score);
    }
    return score;
  }

  /**
   * Stores a similarity score in the cache.
   * Performs LRU eviction if capacity limit is exceeded.
   *
   * @param id1 The first identifier.
   * @param id2 The second identifier.
   * @param score The similarity score value.
   */
  public set(id1: string, id2: string, score: number): void {
    const key = this.getCacheKey(id1, id2);

    if (this.cache.has(key)) {
      this.cache.delete(key);
    } else if (this.maxEntries !== undefined && this.cache.size >= this.maxEntries) {
      // Evict the oldest entry (first item in the Map keys)
      const oldestKey = this.cache.keys().next().value;
      if (oldestKey !== undefined) {
        this.cache.delete(oldestKey);
        
        const ids = this.keyToIds.get(oldestKey);
        if (ids) {
          const [idA, idB] = ids;
          const setA = this.index.get(idA);
          if (setA) {
            setA.delete(`${oldestKey}|${idB}`);
            if (setA.size === 0) {
              this.index.delete(idA);
            }
          }
          const setB = this.index.get(idB);
          if (setB) {
            setB.delete(`${oldestKey}|${idA}`);
            if (setB.size === 0) {
              this.index.delete(idB);
            }
          }
        }
        this.keyToIds.delete(oldestKey);
      }
    }

    this.cache.set(key, score);
    this.keyToIds.set(key, [id1, id2]);

    // Track keys in the index for both entities
    let set1 = this.index.get(id1);
    if (!set1) {
      set1 = new Set<string>();
      this.index.set(id1, set1);
    }
    set1.add(`${key}|${id2}`);

    let set2 = this.index.get(id2);
    if (!set2) {
      set2 = new Set<string>();
      this.index.set(id2, set2);
    }
    set2.add(`${key}|${id1}`);
  }

  /**
   * Invalidates all cached similarities involving a specific identifier.
   *
   * @param id The identifier to invalidate.
   */
  public invalidate(id: string): void {
    const entries = this.index.get(id);
    if (!entries) {
      return;
    }

    for (const entry of entries) {
      const pipeIndex = entry.indexOf("|");
      const key = entry.slice(0, pipeIndex);
      const otherId = entry.slice(pipeIndex + 1);

      this.cache.delete(key);
      this.keyToIds.delete(key);

      // Clean up the other entity's index
      const otherEntries = this.index.get(otherId);
      if (otherEntries) {
        otherEntries.delete(`${key}|${id}`);
        if (otherEntries.size === 0) {
          this.index.delete(otherId);
        }
      }
    }

    this.index.delete(id);
  }

  /**
   * Clears all cached similarities and tracking metadata.
   */
  public clear(): void {
    this.cache.clear();
    this.index.clear();
    this.keyToIds.clear();
  }

  /**
   * Retrieves the current size of the cache.
   *
   * @returns The number of entries in the cache.
   */
  public size(): number {
    return this.cache.size;
  }
}
