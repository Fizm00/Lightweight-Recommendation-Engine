class DoublyLinkedListNode {
  public prev: DoublyLinkedListNode | null = null;
  public next: DoublyLinkedListNode | null = null;

  constructor(
    public readonly key: number,
    public val: number,
    public readonly idx1: number,
    public readonly idx2: number
  ) {}
}

/**
 * A simple, in-memory cache for storing similarity scores between entities.
 *
 * It provides O(1) retrieval and handles symmetric keys.
 */
export class SimilarityCache {
  private readonly cache = new Map<number, DoublyLinkedListNode>();
  private readonly index = new Map<number, Set<number>>();
  private readonly idMap = new Map<string, number>();
  private readonly idToMap: string[] = [];
  private head: DoublyLinkedListNode | null = null; // Least recently used (oldest)
  private tail: DoublyLinkedListNode | null = null; // Most recently used (newest)
  private hits = 0;
  private misses = 0;
  public toInternal?: (id: string | number) => string | number;

  /**
   * Constructs a new SimilarityCache.
   *
   * @param maxEntries Optional capacity limit. If exceeded, oldest entries are evicted (LRU).
   */
  constructor(private readonly maxEntries?: number) {}

  private removeNode(node: DoublyLinkedListNode): void {
    if (node.prev) {
      node.prev.next = node.next;
    } else {
      this.head = node.next;
    }
    if (node.next) {
      node.next.prev = node.prev;
    } else {
      this.tail = node.prev;
    }
    node.prev = null;
    node.next = null;
  }

  private addToTail(node: DoublyLinkedListNode): void {
    if (!this.head) {
      this.head = node;
      this.tail = node;
    } else {
      if (this.tail) {
        this.tail.next = node;
        node.prev = this.tail;
      }
      this.tail = node;
    }
  }

  private moveToTail(node: DoublyLinkedListNode): void {
    this.removeNode(node);
    this.addToTail(node);
  }

  private getId(id: string | number): number {
    if (typeof id === "number") return id;
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
    const node = this.cache.get(key);
    if (node !== undefined) {
      this.hits++;
      if (this.maxEntries !== undefined) {
        this.moveToTail(node);
      }
      return node.val;
    } else {
      this.misses++;
    }
    return undefined;
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
    const idx1 = this.getId(id1);
    const idx2 = this.getId(id2);

    const existingNode = this.cache.get(key);
    if (existingNode !== undefined) {
      existingNode.val = score;
      if (this.maxEntries !== undefined) {
        this.moveToTail(existingNode);
      }
    } else {
      if (this.maxEntries !== undefined && this.cache.size >= this.maxEntries) {
        // Evict oldest (head)
        const oldestNode = this.head;
        if (oldestNode) {
          this.cache.delete(oldestNode.key);
          this.removeNode(oldestNode);
          
          const set1 = this.index.get(oldestNode.idx1);
          if (set1) {
            set1.delete(oldestNode.key);
            if (set1.size === 0) {
              this.index.delete(oldestNode.idx1);
            }
          }
          const set2 = this.index.get(oldestNode.idx2);
          if (set2) {
            set2.delete(oldestNode.key);
            if (set2.size === 0) {
              this.index.delete(oldestNode.idx2);
            }
          }
        }
      }

      const newNode = new DoublyLinkedListNode(key, score, idx1, idx2);
      this.cache.set(key, newNode);
      if (this.maxEntries !== undefined) {
        this.addToTail(newNode);
      }

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
      const node = this.cache.get(key);
      if (node !== undefined) {
        this.cache.delete(key);
        if (this.maxEntries !== undefined) {
          this.removeNode(node);
        }

        const otherInternalId = node.idx1 === internalId ? node.idx2 : node.idx1;
        const otherKeys = this.index.get(otherInternalId);
        if (otherKeys) {
          otherKeys.delete(key);
          if (otherKeys.size === 0) {
            this.index.delete(otherInternalId);
          }
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
    this.head = null;
    this.tail = null;
  }

  /**
   * Retrieves the current size of the cache.
   *
   * @returns The number of entries in the cache.
   */
  public size(): number {
    return this.cache.size;
  }

  /**
   * Retrieves hit and miss stats for the cache.
   */
  public getStats(): { hits: number; misses: number; size: number; hitRate: number } {
    const total = this.hits + this.misses;
    const hitRate = total > 0 ? this.hits / total : 0.0;
    return {
      hits: this.hits,
      misses: this.misses,
      size: this.cache.size,
      hitRate,
    };
  }

  /**
   * Resets hit and miss stats counters.
   */
  public resetStats(): void {
    this.hits = 0;
    this.misses = 0;
  }
}
