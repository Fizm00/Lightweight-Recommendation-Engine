/**
 * A simple, in-memory cache for storing similarity scores between entities.
 *
 * It provides O(1) retrieval and handles symmetric keys.
 */
export class SimilarityCache {
  private readonly cache = new Map<number, number>();
  private readonly index = new Map<number, Set<number>>();
  private readonly idMap = new Map<string, number>();
  private readonly idToMap: string[] = [];
  public toInternal?: (id: string | number) => string | number;

  /**
   * Constructs a new SimilarityCache.
   *
   * @param maxEntries Optional capacity limit. If exceeded, oldest entries are evicted (LRU).
   */
  constructor(private readonly maxEntries?: number) {}

  private getId(id: string | number): number {
    const resolved = this.toInternal ? this.toInternal(id) : id;
    if (typeof resolved === "number") return resolved;
    let num = this.idMap.get(resolved);
    if (num === undefined) {
      num = this.idMap.size;
      this.idMap.set(resolved, num);
      this.idToMap.push(resolved);
    }
    return num;
  }

  /**
   * Generates a symmetric cache key for a pair of identifiers as a 53-bit safe integer.
   *
   * @param id1 The first identifier.
   * @param id2 The second identifier.
   * @returns The symmetric numeric cache key.
   */
  private getCacheKey(id1: string | number, id2: string | number): number {
    const idx1 = this.getId(id1);
    const idx2 = this.getId(id2);
    // Combine two 32-bit integers into a safe 53-bit integer
    return idx1 < idx2 ? idx1 + idx2 * 0x100000000 : idx2 + idx1 * 0x100000000;
  }

  /**
   * Retrieves a similarity score from the cache.
   * Updates access order for LRU if cached and capacity is limited.
   *
   * @param id1 The first identifier.
   * @param id2 The second identifier.
   * @returns The cached score, or undefined if not cached.
   */
  public get(id1: string | number, id2: string | number): number | undefined {
    const key = this.getCacheKey(id1, id2);
    const score = this.cache.get(key);
    if (score !== undefined && this.maxEntries !== undefined) {
      // Refresh insertion order for LRU only if capacity is limited
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
  public set(id1: string | number, id2: string | number, score: number): void {
    const key = this.getCacheKey(id1, id2);

    if (this.cache.has(key)) {
      this.cache.delete(key);
    } else if (this.maxEntries !== undefined && this.cache.size >= this.maxEntries) {
      // Evict the oldest entry (first item in the Map keys)
      const oldestKey = this.cache.keys().next().value;
      if (oldestKey !== undefined) {
        this.cache.delete(oldestKey);
        
        // Decode low and high 32-bit integers from the 64-bit combined number
        const low = oldestKey % 0x100000000;
        const high = Math.floor(oldestKey / 0x100000000);
        const idA = this.idToMap[low] !== undefined ? this.idToMap[low]! : low;
        const idB = this.idToMap[high] !== undefined ? this.idToMap[high]! : high;

        const setA = this.index.get(low);
        if (setA) {
          setA.delete(oldestKey);
          if (setA.size === 0) {
            this.index.delete(low);
          }
        }
        const setB = this.index.get(high);
        if (setB) {
          setB.delete(oldestKey);
          if (setB.size === 0) {
            this.index.delete(high);
          }
        }
      }
    }

    this.cache.set(key, score);

    const idx1 = this.getId(id1);
    const idx2 = this.getId(id2);

    // Track keys in the index for both entities
    let set1 = this.index.get(idx1);
    if (!set1) {
      set1 = new Set<number>();
      this.index.set(idx1, set1);
    }
    set1.add(key);

    let set2 = this.index.get(idx2);
    if (!set2) {
      set2 = new Set<number>();
      this.index.set(idx2, set2);
    }
    set2.add(key);
  }

  /**
   * Invalidates all cached similarities involving a specific identifier.
   *
   * @param id The identifier to invalidate.
   */
  public invalidate(id: string | number): void {
    const internalId = typeof id === "number" ? id : this.idMap.get(id);
    if (internalId === undefined) return;

    const keys = this.index.get(internalId);
    if (!keys) {
      return;
    }

    for (const key of keys) {
      this.cache.delete(key);

      const low = key % 0x100000000;
      const high = Math.floor(key / 0x100000000);
      const otherInternalId = low === internalId ? high : low;

      // Clean up the other entity's index
      const otherKeys = this.index.get(otherInternalId);
      if (otherKeys) {
        otherKeys.delete(key);
        if (otherKeys.size === 0) {
          this.index.delete(otherInternalId);
        }
      }
    }

    this.index.delete(internalId);
  }

  /**
   * Clears all cached similarities and tracking metadata.
   */
  public clear(): void {
    this.cache.clear();
    this.index.clear();
    this.idMap.clear();
    this.idToMap.length = 0;
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
