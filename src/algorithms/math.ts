/**
 * Calculates the Euclidean norm (magnitude) of a sparse vector.
 *
 * @param vector The sparse vector representation.
 * @returns The Euclidean magnitude of the vector.
 */
export function calculateMagnitude<T = string | number>(vector: ReadonlyMap<T, number>): number {
  let sumOfSquares = 0;
  for (const rating of vector.values()) {
    sumOfSquares += rating * rating;
  }
  return Math.sqrt(sumOfSquares);
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
