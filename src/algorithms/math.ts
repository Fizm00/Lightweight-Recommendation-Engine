/**
 * Calculates the Euclidean norm (magnitude) of a sparse vector.
 *
 * @param vector The sparse vector representation.
 * @returns The Euclidean magnitude of the vector.
 */
const magnitudeCache = new WeakMap<ReadonlyMap<any, number>, number>();

/**
 * Calculates the Euclidean norm (magnitude) of a sparse vector.
 *
 * @param vector The sparse vector representation.
 * @returns The Euclidean magnitude of the vector.
 */
export function calculateMagnitude<T = string | number>(vector: ReadonlyMap<T, number>): number {
  let mag = magnitudeCache.get(vector);
  if (mag !== undefined) return mag;

  let sumOfSquares = 0;
  for (const rating of vector.values()) {
    sumOfSquares += rating * rating;
  }
  mag = Math.sqrt(sumOfSquares);
  magnitudeCache.set(vector, mag);
  return mag;
}

/**
 * Invalidates the cached magnitude for a modified vector.
 */
export function invalidateMagnitudeCache(vector: ReadonlyMap<any, number>): void {
  magnitudeCache.delete(vector);
}

/**
 * Calculates the dot product between two sparse vectors.
 *
 * It optimizes the calculation by iterating over the smaller vector
 * and performing O(1) lookups in the larger vector.
 *
 * @param v1 The first sparse vector.
 * @param v2 The second sparse vector.
 * @returns The dot product value.
 */
export function calculateDotProduct<T = string | number>(
  v1: ReadonlyMap<T, number>,
  v2: ReadonlyMap<T, number>
): number {
  if (v1.size === 0 || v2.size === 0) {
    return 0;
  }

  const [smaller, larger] = v1.size < v2.size ? [v1, v2] : [v2, v1];
  let dotProduct = 0;

  for (const [itemId, rating] of smaller.entries()) {
    const matchingRating = larger.get(itemId);
    if (matchingRating !== undefined) {
      dotProduct += rating * matchingRating;
    }
  }

  return dotProduct;
}

/**
 * Normalizes a sparse vector to unit length (magnitude of 1).
 *
 * If the magnitude of the vector is 0, it returns a new empty map.
 *
 * @param vector The sparse vector to normalize.
 * @returns A new Map representing the normalized sparse vector.
 */
export function normalizeVector<T = string | number>(vector: ReadonlyMap<T, number>): Map<T, number> {
  const normalized = new Map<T, number>();
  const magnitude = calculateMagnitude(vector);

  if (magnitude === 0) {
    return normalized;
  }

  for (const [itemId, rating] of vector.entries()) {
    normalized.set(itemId, rating / magnitude);
  }

  return normalized;
}

/**
 * Calculates the number of shared items (keys) between two sparse vectors.
 *
 * It optimizes the calculation by iterating over the smaller vector.
 *
 * @param v1 The first sparse vector.
 * @param v2 The second sparse vector.
 * @returns The count of shared items.
 */
export function intersectionSize<T = string | number>(
  v1: ReadonlyMap<T, number>,
  v2: ReadonlyMap<T, number>
): number {
  if (v1.size === 0 || v2.size === 0) {
    return 0;
  }

  const [smaller, larger] = v1.size < v2.size ? [v1, v2] : [v2, v1];
  let sharedCount = 0;

  for (const itemId of smaller.keys()) {
    if (larger.has(itemId)) {
      sharedCount++;
    }
  }

  return sharedCount;
}

/**
 * Retrieves the set of item identifiers that are shared between two sparse vectors.
 *
 * It optimizes the intersection operation by iterating over the smaller vector.
 *
 * @param v1 The first sparse vector.
 * @param v2 The second sparse vector.
 * @returns A Set containing the shared item IDs.
 */
export function sharedItems<T = string | number>(
  v1: ReadonlyMap<T, number>,
  v2: ReadonlyMap<T, number>
): Set<T> {
  const shared = new Set<T>();
  if (v1.size === 0 || v2.size === 0) {
    return shared;
  }

  const [smaller, larger] = v1.size < v2.size ? [v1, v2] : [v2, v1];

  for (const itemId of smaller.keys()) {
    if (larger.has(itemId)) {
      shared.add(itemId);
    }
  }

  return shared;
}

const sortedKeysCache = new WeakMap<ReadonlyMap<any, number>, Int32Array>();

/**
 * Caches and returns a sorted Int32Array of internal IDs (which are numbers) for a sparse vector.
 */
export function getSortedKeys(v: ReadonlyMap<any, number>): Int32Array {
  let keys = sortedKeysCache.get(v);
  if (!keys) {
    const entries = Array.from(v.keys()) as number[];
    entries.sort((a, b) => a - b);
    keys = new Int32Array(entries);
    sortedKeysCache.set(v, keys);
  }
  return keys;
}

/**
 * Invalidates the cached sorted keys for a modified vector.
 */
export function invalidateSortedKeysCache(v: ReadonlyMap<any, number>): void {
  sortedKeysCache.delete(v);
}

/**
 * Checks if two sorted Int32Arrays share at least one element using a two-pointer approach.
 */
export function hasOverlapSorted(arrA: Int32Array, arrB: Int32Array): boolean {
  let pA = 0, pB = 0;
  const lenA = arrA.length, lenB = arrB.length;
  while (pA < lenA && pB < lenB) {
    const valA = arrA[pA]!;
    const valB = arrB[pB]!;
    if (valA === valB) {
      return true;
    }
    if (valA < valB) {
      pA++;
    } else {
      pB++;
    }
  }
  return false;
}

