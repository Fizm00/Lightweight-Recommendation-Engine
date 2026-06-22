/**
 * Locality Sensitive Hashing (LSH) index using Random Projection (SimHash)
 * to support Approximate Nearest Neighbor (ANN) search for Cosine similarity.
 *
 * It projects sparse vectors onto deterministic random hyperplanes generated
 * on-the-fly via a hashing function (zero-memory projection), partitions
 * the resulting signature into bands, and indexes entities into buckets.
 */
export class LshIndex {
  private readonly bandsCount: number;
  private readonly rowsPerBand: number;
  
  // Array of maps, one map for each band: Map<bucketKey, Set<entityId>>
  private readonly bands: Map<number, Set<any>>[];
  // Maps entityId to its bucket keys in each band: Map<entityId, bucketKeys[]>
  private readonly entityBuckets = new Map<any, number[]>();

  constructor(options: { bands?: number; rows?: number } = {}) {
    this.bandsCount = options.bands ?? 8;
    this.rowsPerBand = options.rows ?? 8;
    this.bands = Array.from({ length: this.bandsCount }, () => new Map());
  }

  /**
   * Hashes any key (string or number) to a 32-bit integer.
   */
  private getFeatureHash(featureId: any): number {
    if (typeof featureId === "number") {
      return featureId | 0;
    }
    const str = String(featureId);
    let hash = 0;
    for (let i = 0; i < str.length; i++) {
      hash = (hash * 31 + str.charCodeAt(i)) | 0;
    }
    return hash;
  }

  /**
   * Deterministic pseudo-random weight for hyperplane projection.
   * Stateless, zero-memory, and zero-dependency.
   */
  private getHyperplaneWeight(featureHash: number, bitIdx: number): number {
    let h = Math.imul(featureHash ^ 3432918353, 2246822507) ^ Math.imul(bitIdx ^ 461845907, 3266489909);
    h = Math.imul(h ^ (h >>> 16), 2246822507);
    h = Math.imul(h ^ (h >>> 13), 3266489909);
    h = h ^ (h >>> 16);
    // Map to [-1.0, 1.0]
    return ((h & 0x7fffffff) / 2147483648.0) * 2.0 - 1.0;
  }

  /**
   * Computes the signature and bucket keys for a sparse vector.
   */
  private computeBucketKeys(vector: ReadonlyMap<any, number>): number[] {
    const bucketKeys = new Array<number>(this.bandsCount).fill(0);
    
    for (let b = 0; b < this.bandsCount; b++) {
      let bandValue = 0;
      for (let r = 0; r < this.rowsPerBand; r++) {
        const bitIdx = b * this.rowsPerBand + r;
        
        let dot = 0;
        for (const [featureId, rating] of vector.entries()) {
          const featureHash = this.getFeatureHash(featureId);
          dot += rating * this.getHyperplaneWeight(featureHash, bitIdx);
        }
        
        if (dot >= 0) {
          bandValue |= (1 << r);
        }
      }
      bucketKeys[b] = bandValue;
    }
    
    return bucketKeys;
  }

  /**
   * Updates (or inserts) the signature of an entity in the LSH index.
   */
  public update(entityId: any, vector: ReadonlyMap<any, number>): void {
    this.remove(entityId);

    if (vector.size === 0) return;

    const bucketKeys = this.computeBucketKeys(vector);
    
    for (let b = 0; b < this.bandsCount; b++) {
      const bucketKey = bucketKeys[b]!;
      let set = this.bands[b]!.get(bucketKey);
      if (!set) {
        set = new Set();
        this.bands[b]!.set(bucketKey, set);
      }
      set.add(entityId);
    }
    
    this.entityBuckets.set(entityId, bucketKeys);
  }

  /**
   * Removes an entity from all buckets.
   */
  public remove(entityId: any): void {
    const oldKeys = this.entityBuckets.get(entityId);
    if (!oldKeys) return;

    for (let b = 0; b < this.bandsCount; b++) {
      const bucketKey = oldKeys[b]!;
      const set = this.bands[b]!.get(bucketKey);
      if (set) {
        set.delete(entityId);
        if (set.size === 0) {
          this.bands[b]!.delete(bucketKey);
        }
      }
    }
    this.entityBuckets.delete(entityId);
  }

  /**
   * Retrieves all candidate entity IDs that share at least minMatches LSH buckets with the query vector.
   */
  public getCandidates(vector: ReadonlyMap<any, number>, minMatches = 1): Set<any> {
    const candidates = new Set<any>();
    if (vector.size === 0) return candidates;

    const bucketKeys = this.computeBucketKeys(vector);
    
    if (minMatches <= 1) {
      for (let b = 0; b < this.bandsCount; b++) {
        const bucketKey = bucketKeys[b]!;
        const set = this.bands[b]!.get(bucketKey);
        if (set) {
          for (const id of set) {
            candidates.add(id);
          }
        }
      }
      return candidates;
    }

    const matchCounts = new Map<any, number>();
    for (let b = 0; b < this.bandsCount; b++) {
      const bucketKey = bucketKeys[b]!;
      const set = this.bands[b]!.get(bucketKey);
      if (set) {
        for (const id of set) {
          const count = (matchCounts.get(id) ?? 0) + 1;
          matchCounts.set(id, count);
        }
      }
    }

    for (const [id, count] of matchCounts.entries()) {
      if (count >= minMatches) {
        candidates.add(id);
      }
    }
    return candidates;
  }

  /**
   * Clears the LSH index.
   */
  public clear(): void {
    for (let b = 0; b < this.bandsCount; b++) {
      this.bands[b]!.clear();
    }
    this.entityBuckets.clear();
  }
}
