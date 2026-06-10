/**
 * A simple, in-memory cache for storing similarity scores between entities.
 *
 * It provides O(1) retrieval and handles symmetric keys.
 */
export class SimilarityCache {
  private readonly cache = new Map<string, number>();

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
   *
   * @param id1 The first identifier.
   * @param id2 The second identifier.
   * @returns The cached score, or undefined if not cached.
   */
  public get(id1: string, id2: string): number | undefined {
    return this.cache.get(this.getCacheKey(id1, id2));
  }

  /**
   * Stores a similarity score in the cache.
   *
   * @param id1 The first identifier.
   * @param id2 The second identifier.
   * @param score The similarity score value.
   */
  public set(id1: string, id2: string, score: number): void {
    this.cache.set(this.getCacheKey(id1, id2), score);
  }

  /**
   * Clears all cached similarities.
   */
  public clear(): void {
    this.cache.clear();
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
